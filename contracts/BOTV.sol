// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import "erc721a/contracts/extensions/ERC4907A.sol";

import "./interfaces/IBUFA.sol";

// import "hardhat/console.sol";

/**
 * @title Bufalo's NFT Collection - BOTV Skulls (BOTV)
 * @author Anthony Gourraud
 * @notice ERC721A contract with ERC4907 rentable NFT token standard and ERC2981 royalties implementations.
 *
 * The contract's owner (initially the deployer) can :
 * - specify the price to mint a token, with the currency he wants (any ERC20 or the blockchain's native coin)
 * - activate or deactivate private and public minting phases
 *
 * Allowed addresses for the private sale and eligible addresses for a 50% discount on the second token minted
 * are verified with a merkle proof (see https://soliditydeveloper.com/merkle-tree)
 *
 * When a user pays and mints X tokens, he also receives X tokens from each Bufalo collection of wearables.
 * IMPORTANT :
 * - Deployer should be owner of 1000 wearable tokens, with tokenIDs following each other, for each collection to airdrop.
 * - Once the contract deployed, the deployer should call for each collection
 *   the {ERC721-setApprovalForAll} function to allow the contract to airdrop the tokens
 *
 * Token metadata should be revealed by the contract's owner.
 * A mechanism using Chainlink VRF ensures that no cheating is possible.
 * IMPORTANT :
 * - Deployer should create and fund a Chainlink subscription
 * - Deployer should add the deployed contract as a consumer for the subscription
 *
 * Once revealed, each token holder can claim rewards ($BUFA tokens) continously.
 * The longer he holds and the rarer the NFT's attributes are,
 * the higher reward amount he gets
 * IMPORTANT :
 * - Deployer should grant the contract the `MINTER_ROLE`
 * - User should claim its rewards before transfering a token, or he will lose it
 */
contract BOTV is
    ERC2981,
    ERC4907A,
    Ownable,
    ReentrancyGuard,
    VRFConsumerBaseV2
{
    struct MintPriceSettings {
        bool enabled;
        uint256 amount;
    }

    using SafeERC20 for IERC20;
    using Strings for uint256;

    /** @notice Opensea-comptatible off-chain metadata base URI for each ERC721 token,
     * See https://docs.opensea.io/docs/metadata-standards
     */
    string public constant baseURI =
        "ipfs://bafybeibo35dz2wsz44ixiw3yudl6ulk4kvdsj7irbjwjn76gkg7msl3lzy/tokens/";

    /// @notice Maximum number of tokens to mint
    uint256 public constant MAX_SUPPLY = 1000;

    /// @notice Maximum number of tokens an address can mint
    uint256 public constant MINT_LIMIT_PER_WALLET = 10;

    /// @notice Where goes funds from mint
    address payable public constant MINT_TREASURY =
        payable(0x3C0dABC82bf51d1bf994a54E70e7a7d19865f950);

    /// @notice Where goes funds from second sales royalties
    address payable public immutable ROYALTIES_TREASURY;

    /// @notice $BUFA contract address, rewards tokens holding NFT
    IBUFA public immutable BUFA_CONTRACT_ADDRESS;

    /// @notice Boolean operator to activate/deactivate private sale
    bool public privateSaleActive = false;

    /// @notice Boolean operator to activate/deactivate public sale
    bool public publicSaleActive = false;

    /** @notice Random number to get via Chainlink VRF.
     * This number links a {tokenId} to a unique JSON metadata file, stored on IPFS (see {baseURI})
     * The value of {randomNumber} is set once via {fulfillRandomWords}
     */
    uint256 public randomNumber;

    /// @notice Request ID from Chainlink VRF
    uint256 public requestId;

    // Chainlink VRF configuration, see https://docs.chain.link/vrf/v2/subscription/supported-networks/
    VRFCoordinatorV2Interface private immutable _VRF_COORDINATOR;

    // Merkle root to check if an address can get a discount
    bytes32 private immutable _DISCOUNT_LIST_MERKLE_ROOT;

    // Merkle root to check if an address is on the private sale allowlist
    bytes32 private immutable _PRIVATE_LIST_MERKLE_ROOT;

    // Merkle root to check if an address is on the private sale allowlist
    bytes32 private immutable _BUFA_REWARDS_MERKLE_ROOT;

    // Address from which to airdrop wearable tokens on mint
    address private immutable _WEARABLES_OWNER;

    // Specific for which contracts the airdrop applies
    address[] private _WEARABLES_ADDRESSES;

    /** For every single _WEARABLES_ADDRESSES i,
     * _WEARABLES_OWNER should be owner of
     * tokenIDs = [_WEARABLES_TOKENIDS_OFFSET[i] ; _WEARABLES_TOKENIDS_OFFSET[i] + MAX_SUPPLY -1]
     *
     * Keep track of tokenId index for every wearable airdrop
     * Counter should be incremented after a transfer
     */
    mapping(IERC721 => uint256) private _wearablesTokenIds;

    // Keep track if mint is possible paying with blockchain's native coin, and for which price per token
    MintPriceSettings private _mintNativePrice = MintPriceSettings(false, 0);

    // Keep track if mint is possible paying with a specific ERC20, and for which price per token
    mapping(IERC20 => MintPriceSettings) private _mintERC20Prices;

    // Keep track of last claim date for each token - reset on transfer
    mapping(uint256 => uint256) private _lastClaimTimestamps;

    /* ****************
     *  ERRORS
     *****************/

    error AlreadyRevealed();
    error AmountValueTooLow(uint256 value);
    error CannotBeZeroAddress();
    error ForbiddenCurrency(address currency);
    error IncompleteAirdropParameter();
    error InvalidAirdropParameter();
    error InvalidMerkleRoot();
    error InvalidMintParameters();
    error InvalidRewardsParameters();
    error InvalidRewardsForToken(
        uint256 tokenId,
        uint256 metadataId,
        uint256 rewardsPerDay
    );
    error MaxSupplyExceeded();
    error NoActiveSale();
    error NotAllowedForPrivateSale();
    error NotOwner(address tokenOwner, uint256 tokenId);
    error NotRevealed();
    error RevealAlreadyRequested();
    error TokenGivenTwice(uint256 tokenId);
    error TokenMintingLimitExceeded();

    /* ****************
     *  EVENTS
     *****************/

    event MintPriceChange(
        address indexed currency,
        bool indexed enabled,
        uint256 indexed amount
    );

    event Mint(
        address indexed tokenOwner,
        uint256 indexed quantity,
        uint256 price,
        address currency,
        address msgSender
    );

    event RevealRandomNumber(uint256 randomNumber);

    event PublicSaleStateChanged(bool active);

    event PrivateSaleStateChanged(bool active);

    /* ****************
     *  CONTRACT CONSTRUCTOR
     *****************/

    /**
     * @param mintCurrency For example 0x7ceb23fd6bc0add59e62ac25578270cff1b9f619 to charge mint in WETH on Polygon. Set 0 to select the blockchain's native coin.
     * @param mintAmount Price per token minted, paid in token/coin specified with the `mintCurrency` parameter
     * @param royaltiesTreasury Where to send funds from secondary sales
     * @param vrfCoordinator Chainlink VRF configuration, for example 0xAE975071Be8F8eE67addBC1A82488F1C24858067 on Polygon. See https://docs.chain.link/vrf/v2/subscription/supported-networks/
     * @param wearablesAddresses Contracts for wearable tokens to airdrop
     * @param wearablesTokenIdsOffset From which tokenIDs deployer is owner of wearables to airdrop
     * @param rewardsToken ERC20 Contract for $BUFA
     * @param rewardsMerkleRoot Merkle root computed from the rank/rarity scores to verify how much per day a token is eligible in $BUFA
     * @param discountListMerkleRoot Merkle root computed from array of eligible addresses for the 50% discount on second token minted
     * @param privateListMerkleRoot Merkle root computed from array of allowed addresses to mint during the private sale
     *
     * Merkle proofs can
     *
     */
    constructor(
        address mintCurrency,
        uint256 mintAmount,
        address payable royaltiesTreasury,
        address vrfCoordinator,
        address[] memory wearablesAddresses,
        uint256[] memory wearablesTokenIdsOffset,
        address rewardsToken,
        bytes32 rewardsMerkleRoot,
        bytes32 discountListMerkleRoot,
        bytes32 privateListMerkleRoot
    ) ERC721A("Bufalo BOTV Skulls", "BOTV") VRFConsumerBaseV2(vrfCoordinator) {
        if (royaltiesTreasury == address(0)) revert CannotBeZeroAddress();
        if (vrfCoordinator == address(0)) revert CannotBeZeroAddress();
        if (rewardsToken == address(0)) revert CannotBeZeroAddress();

        if (wearablesAddresses.length != wearablesTokenIdsOffset.length)
            revert IncompleteAirdropParameter();

        for (uint256 i = 0; i < wearablesAddresses.length; i++) {
            address wearableContractAddr = wearablesAddresses[i];
            if (wearableContractAddr == address(0))
                revert InvalidAirdropParameter();
            _wearablesTokenIds[
                IERC721(wearableContractAddr)
            ] = wearablesTokenIdsOffset[i];
        }

        if (
            rewardsMerkleRoot == bytes32(0) ||
            discountListMerkleRoot == bytes32(0) ||
            privateListMerkleRoot == bytes32(0)
        ) revert InvalidMerkleRoot();

        _setPrice(mintCurrency, true, mintAmount);

        ROYALTIES_TREASURY = royaltiesTreasury;

        _VRF_COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinator);

        _WEARABLES_OWNER = _msgSenderERC721A();
        _WEARABLES_ADDRESSES = wearablesAddresses;

        BUFA_CONTRACT_ADDRESS = IBUFA(rewardsToken);
        _BUFA_REWARDS_MERKLE_ROOT = rewardsMerkleRoot;

        _DISCOUNT_LIST_MERKLE_ROOT = discountListMerkleRoot;
        _PRIVATE_LIST_MERKLE_ROOT = privateListMerkleRoot;

        // 10 % royalties fee
        _setDefaultRoyalty(royaltiesTreasury, 1000);
    }

    /* ******************
     *  EXTERNAL FUNCTIONS
     ********************/

    /**
     * @notice Mint tokens if it succeeds to pay with provided `currency`, and then transfer it & airdrop wearables to `tokenOwner`
     * @param tokenOwner Transfer minted tokens & airdrop wearables to this address
     * @param quantity Number of tokens to mint
     * @param currency ERC20 contract address to spend tokens, 0 to pay with the blockchain's native coin
     * @param privateSaleMerkleProof Merkle proof to verify if `tokenOwner` is on the private sale allowlist
     * @param discountMerkleProof Merkle proof to verify if `tokenOwner` can have a 50% discount on the second token
     *
     * To get `privateSaleMerkleProof` and `discountMerkleProof` values,
     * you should  fetch https://bufalo-api.anthonygourraud.workers.dev/merkleproofs/:tokenOwner
     * All merkle proofs are available on Github :
     * - Private sale => https://github.com/antho31/bufalo-nft-skulls/blob/main/data/results/merkleAllowlists/community.json
     * - Discounts => https://github.com/antho31/bufalo-nft-skulls/blob/main/data/results/merkleAllowlists/fans.json
     *
     * @dev External calls considerations :
     * - Payment with provided `currency` should have been enabled with {setPrice} function
     * - Will revert if the contract do not succeed to charge
     * (this contract should have spending allowance if `currency` is ERC20, see {IERC20-approve})
     * - Checks Effects pattern & reetrancy protection
     *
     * Emits a {Mint} and {IERC721-Transfer} events.
     */
    function mint(
        address tokenOwner,
        uint256 quantity,
        address currency,
        bytes32[] calldata privateSaleMerkleProof,
        bytes32[] calldata discountMerkleProof
    ) external payable nonReentrant {
        // check quantity validity
        // {_safeMint} function below will revert if quantity = 0
        if ((_totalMinted() + quantity) > MAX_SUPPLY)
            revert MaxSupplyExceeded();

        // check beneficiary validity
        if (tokenOwner == address(0)) revert CannotBeZeroAddress();

        // ensure beneficiary cannot mint more than {MINT_LIMIT_PER_WALLET} tokens
        if (balanceOf(tokenOwner) + quantity > MINT_LIMIT_PER_WALLET)
            revert TokenMintingLimitExceeded();

        // revert if there is no active sale or if beneficiary address is not in the privale sale allowlist
        if (publicSaleActive == false) {
            if (privateSaleActive == false) revert NoActiveSale();

            if (
                isAllowedForPrivateSale(tokenOwner, privateSaleMerkleProof) ==
                false
            ) revert NotAllowedForPrivateSale();
        }

        uint256 price = getPrice(
            tokenOwner,
            currency,
            quantity,
            discountMerkleProof
        );

        // pay to mint
        if (currency == address(0)) {
            // if paid with MATIC on Polygon / ETH on Ethereum
            if (msg.value < price) revert AmountValueTooLow(msg.value);
            Address.sendValue(MINT_TREASURY, price);
        } else {
            // if paid with ERC20 tokens
            IERC20(currency).safeTransferFrom(
                _msgSenderERC721A(),
                MINT_TREASURY,
                price
            );
        }

        // mint `quantity` tokens, transfer to `tokenOwner`
        super._safeMint(tokenOwner, quantity);

        // transfer to `tokenOwner` the wearables as a gift for the mint
        _airdrop(quantity, tokenOwner);

        emit Mint(tokenOwner, quantity, price, currency, _msgSenderERC721A());
    }

    /**
     * @notice Claim $BUFA tokens as a reward for token holding.
     *
     * @param tokenOwner Holder who will receive $BUFA rewards
     * @param tokenIds Tokens holder owns
     * @param rewardsPerDay Array of rewards number for each token holder can get.
     * @param rewardsProofs Array of proofs regarding rewards holder can get
     *
     * To get `rewardsPerDay` and `rewardsProofs`values,
     * you should execute {getMetadataIdsForTokens(tokenIds)}
     * and then fetch https://bufalo-api.anthonygourraud.workers.dev/merkleproofs/rewards/:metadataIds
     * All merkle proofs and rewards allocation per day for each metadataId are available here : https://github.com/antho31/bufalo-nft-skulls/blob/main/data/results/metadata/bufaRewardsMerkleData.json
     *
     * Emits {ERC20-Transfer} event
     */
    function claimRewards(
        address tokenOwner,
        uint256[] memory tokenIds,
        uint256[] memory rewardsPerDay,
        bytes32[][] calldata rewardsProofs
    ) public {
        uint256 amount;
        if (isRevealed() == false) revert NotRevealed();
        if (
            tokenIds.length == 0 ||
            tokenIds.length != rewardsProofs.length ||
            tokenIds.length != rewardsProofs.length
        ) revert InvalidRewardsParameters();

        //   bool[] memory tokensChecked = new bool[](MAX_SUPPLY);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            //  if (tokensChecked[tokenId]) revert TokenGivenTwice(tokenId);
            //   tokensChecked[tokenId] = true;
            uint256 rewardsPerDayForToken = rewardsPerDay[i];
            bytes32[] memory rewardsProof = rewardsProofs[i];

            amount =
                amount +
                _availableRewards(
                    tokenOwner,
                    tokenId,
                    rewardsPerDayForToken,
                    rewardsProof
                );
            _resetClaimTimestamp(tokenId);
        }
        BUFA_CONTRACT_ADDRESS.mint(tokenOwner, amount);
    }

    /* ****************************************
     *  EXTERNAL FUNCTIONS, RESTRICTED TO OWNER
     ******************************************/

    /**
     * @notice Mint/airdrop tokens
     * @param recipients Transfer minted token(s) theses addresses
     * @param quantities Number of tokens to mint per address
     *
     * Emits {Mint} and {ERC721-Transfer} events.
     */
    function mintForFree(
        address[] calldata recipients,
        uint256[] calldata quantities
    ) external onlyOwner nonReentrant {
        if (recipients.length == 0 || recipients.length != quantities.length)
            revert InvalidMintParameters();

        uint256 totalQty = 0;
        for (uint256 i = 0; i < recipients.length; i++) {
            // check beneficiary validity
            if (recipients[i] == address(0)) revert CannotBeZeroAddress();

            // check quantity validity
            if (quantities[i] == 0) revert InvalidMintParameters();
            totalQty = totalQty + quantities[i];
        }

        if ((_totalMinted() + totalQty) > MAX_SUPPLY)
            revert MaxSupplyExceeded();

        for (uint256 i = 0; i < recipients.length; i++) {
            // mint `quantity` tokens and transfer to `recipient`
            super._safeMint(recipients[i], quantities[i]);
            _airdrop(quantities[i], recipients[i]);
            emit Mint(
                recipients[i],
                quantities[i],
                0,
                address(0),
                _msgSenderERC721A()
            );
        }
    }

    function resetVrfRequest() external onlyOwner {
        if (isRevealed()) revert AlreadyRevealed();
        requestId = 0;
    }

    /**
     *  @notice Random metadata attribution with Chainlink
     *  @param keyHash See https://docs.chain.link/vrf/v2/subscription/supported-networks/#configurations
     *  @param subscriptionId Create a subscription here : https://vrf.chain.link/
     *  @param callbackGasLimit Storing each word costs about 20,000 gas. 40,000 is a safe default for this function
     *
     * Emits {vrfCoordinatorV2-RandomWordsRequested"} event
     */
    function reveal(
        bytes32 keyHash,
        uint64 subscriptionId,
        uint32 callbackGasLimit
    ) external onlyOwner {
        if (requestId != 0) revert RevealAlreadyRequested();

        uint32 numWords = 1;
        uint16 requestConfirmations = 3;

        // Will revert if subscription is not set and funded.
        requestId = _VRF_COORDINATOR.requestRandomWords(
            keyHash,
            subscriptionId,
            requestConfirmations,
            callbackGasLimit,
            numWords
        );
    }

    /** @param currency ERC20 contract address or 0 for native coin
     *  @param enabled Allow / disallow minting sale with provided `currency`
     *  @param amount How much user will have to pay to mint one token - can be 0
     *
     * Emits a {MintPriceChange} event.
     */
    function setPrice(
        address currency,
        bool enabled,
        uint256 amount
    ) external onlyOwner {
        _setPrice(currency, enabled, amount);
    }

    /**
     * @param active Activate/deactivate private mint
     *
     * Emits {PrivateSaleStateChanged} event
     */
    function setPrivateSale(bool active) external onlyOwner {
        privateSaleActive = active;
        emit PrivateSaleStateChanged(active);
    }

    /**
     * @param active Activate/deactivate public mint
     *
     * Emits {PublicSaleStateChanged} event
     */
    function setPublicSale(bool active) external onlyOwner {
        publicSaleActive = active;
        emit PublicSaleStateChanged(active);
    }

    /* ****************
     *  EXTERNAL GETTERS
     *****************/

    /**
     * @notice Comoute how much $BUFA tokens a holder can claim as a reward for token holding.
     * The longer you hold and the rarer the NFT's attributes are,
     * the higher reward amount you get
     *
     * @param tokenOwner Holder address
     * @param tokenIds Tokens holder owns
     * @param rewardsPerDay Array of rewards number for each token holder can get.
     * @param rewardsProofs Array of proofs regarding rewards holder can get
     *
     * To get `rewardsPerDay` and `rewardsProofs`values,
     * you should execute {getMetadataIdsForTokens(tokenIds)}
     * and then fetch https://bufalo-api.anthonygourraud.workers.dev/merkleproofs/rewards/:metadataIds
     */
    function availableRewards(
        address tokenOwner,
        uint256[] memory tokenIds,
        uint256[] memory rewardsPerDay,
        bytes32[][] calldata rewardsProofs
    ) external view returns (uint256 amount) {
        if (isRevealed() == false) revert NotRevealed();
        if (
            tokenIds.length == 0 ||
            tokenIds.length != rewardsProofs.length ||
            tokenIds.length != rewardsProofs.length
        ) revert InvalidRewardsParameters();

        bool[] memory tokensChecked = new bool[](MAX_SUPPLY);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            if (tokensChecked[tokenId]) revert TokenGivenTwice(tokenId);
            tokensChecked[tokenId] = true;
            uint256 rewardsPerDayForToken = rewardsPerDay[i];
            bytes32[] memory rewardsProof = rewardsProofs[i];

            amount =
                amount +
                _availableRewards(
                    tokenOwner,
                    tokenId,
                    rewardsPerDayForToken,
                    rewardsProof
                );
        }
    }

    /* ****************
     *  PUBLIC GETTERS
     *****************/

    /**
     * @notice If revealed Get metadataIds for tokens
     * @param tokenIds Array of token ids
     */
    function getMetadataIdsForTokens(
        uint256[] memory tokenIds
    ) public view returns (bool, uint256[] memory) {
        uint256[] memory metadataIds = new uint256[](tokenIds.length);

        if (isRevealed() == false) {
            return (false, metadataIds);
        } else {
            for (uint256 i = 0; i < tokenIds.length; i++) {
                metadataIds[i] = _getMetadataForToken(tokenIds[i]);
            }

            return (true, metadataIds);
        }
    }

    /**
     * @notice  Get the price to pay for a provided `currency` and a number of tokens to mint
     * @param tokenOwner Beneficiary address
     * @param currency ERC20 contract address or 0 for native coin
     * @param quantity Number of tokens to mint
     * @param discountMerkleProof Merkle proof to check if tokenOwner can have a 50% discount on the second token
     *
     */
    function getPrice(
        address tokenOwner,
        address currency,
        uint256 quantity,
        bytes32[] calldata discountMerkleProof
    ) public view returns (uint256) {
        // get price per token to mint
        (bool enabled, uint256 amount) = _getMintPriceForCurrency(currency);
        if (!enabled) revert ForbiddenCurrency(currency);

        uint256 discount = _getDiscount(
            tokenOwner,
            amount,
            quantity,
            discountMerkleProof
        );
        return quantity * amount - discount;
    }

    /**
     * @notice Check if an address is in the allowlist private sale
     * @param tokenOwner Transfer minted tokens to this address
     * @param privateSaleMerkleProof Merkle proof to check if `tokenOwner` is on the private sale allowlist
     */
    function isAllowedForPrivateSale(
        address tokenOwner,
        bytes32[] calldata privateSaleMerkleProof
    ) public view returns (bool) {
        return
            MerkleProof.verifyCalldata(
                privateSaleMerkleProof,
                _PRIVATE_LIST_MERKLE_ROOT,
                keccak256(abi.encodePacked(tokenOwner))
            );
    }

    /**
     * @notice Check if metadata assignation is revealed
     */
    function isRevealed() public view returns (bool) {
        return randomNumber != 0;
    }

    /* ****************
     *  PUBLIC OVERRIDE GETTERS
     *****************/

    function isApprovedForAll(
        address owner,
        address operator
    ) public view override(ERC721A, IERC721A) returns (bool isOperator) {
        /* @dev On Polygon (Main Network), if OpenSea's ERC721 Proxy Address is detected,
         * auto-return true. Otherwise, use the default ERC721.isApprovedForAll()
         * See https://docs.opensea.io/docs/polygon-basic-integration
         */
        if (
            block.chainid == 137 &&
            operator == address(0x58807baD0B376efc12F5AD86aAc70E78ed67deaE)
        ) {
            return true;
        }
        return ERC721A.isApprovedForAll(owner, operator);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC4907A, ERC2981) returns (bool) {
        return
            ERC4907A.supportsInterface(interfaceId) ||
            ERC2981.supportsInterface(interfaceId);
    }

    function tokenURI(
        uint256 tokenId
    ) public view virtual override(ERC721A, IERC721A) returns (string memory) {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = tokenId;
        (bool revealed, uint256[] memory metadataIds) = getMetadataIdsForTokens(
            tokenIds
        );

        if (_exists(tokenId) == false) revert URIQueryForNonexistentToken();

        if (revealed == false) {
            return string(abi.encodePacked(baseURI, "prereveal"));
        } else {
            return string(abi.encodePacked(baseURI, metadataIds[0].toString()));
        }
    }

    /* ****************
     *  INTERNAL OVERRIDE
     *****************/

    /**
     * @notice See {ERC721-_burn}. This override additionally clears the royalty information for the token.
     */
    function _burn(uint256 tokenId) internal virtual override {
        super._burn(tokenId);
        _resetTokenRoyalty(tokenId);
    }

    /**
     * @notice Callback function used by VRF Coordinator to return the random number to this contract.
     */
    function fulfillRandomWords(
        uint256 /* requestId */,
        uint256[] memory randomWords
    ) internal override {
        /**
         * @dev
         * We want to prevent :
         * - `randomNumber = 0`, flag used to return preveal metadata
         * - `randomNumber` ∈ [MAX_UINT256 - MAX_SUPPLY ; MAX_UINT256],
         *    to avoid overflow from {tokenURI} function which computes `randomNumber + tokenId`
         * So we transform the result to a number between 1 and 1547888569 (arbitrary number) inclusively
         */
        randomNumber = (randomWords[0] % 1547888569) + 1;

        emit RevealRandomNumber(randomNumber);
    }

    /**
     * @notice We use this hook to set/reset holding start period
     */
    function _beforeTokenTransfers(
        address from,
        address to,
        uint256 startTokenId,
        uint256 quantity
    ) internal virtual override {
        for (uint256 i = startTokenId; i < startTokenId + quantity; i++) {
            _resetClaimTimestamp(i);
        }
        super._beforeTokenTransfers(from, to, startTokenId, quantity);
    }

    /* ****************
     *  PRIVATE FUNCTIONS
     *****************/

    function _airdrop(uint256 quantity, address tokenOwner) private {
        // @dev gas optimization : copy from storage to memory
        address[] memory airdrops = _WEARABLES_ADDRESSES;
        uint256 airdropNbs = airdrops.length;

        for (uint256 i = 0; i < quantity; i++) {
            for (uint256 j = 0; j < airdropNbs; j++) {
                IERC721 airdropAddr = IERC721(airdrops[j]);

                uint256 currentId = _wearablesTokenIds[airdropAddr];

                try
                    airdropAddr.safeTransferFrom(
                        _WEARABLES_OWNER,
                        tokenOwner,
                        currentId
                    )
                {
                    _wearablesTokenIds[airdropAddr] = currentId + 1;
                } catch {}
            }
        }
    }

    function _resetClaimTimestamp(uint256 tokenId) private {
        _lastClaimTimestamps[tokenId] = block.timestamp;
    }

    function _setPrice(address currency, bool enabled, uint256 amount) private {
        if (currency != address(0)) {
            _mintERC20Prices[IERC20(currency)] = MintPriceSettings(
                enabled,
                amount
            );
        } else {
            _mintNativePrice = MintPriceSettings(enabled, amount);
        }

        emit MintPriceChange(currency, enabled, amount);
    }

    /* ****************
     *  PRIVATE VIEW FUNCTIONS
     *****************/

    function _availableRewards(
        address tokenOwner,
        uint256 tokenId,
        uint256 rewardsPerDay,
        bytes32[] memory rewardsProof
    ) private view returns (uint256) {
        if (ownerOf(tokenId) != tokenOwner)
            revert NotOwner(tokenOwner, tokenId);

        uint256 metadataId = _getMetadataForToken(tokenId);
        if (
            MerkleProof.verify(
                rewardsProof,
                _BUFA_REWARDS_MERKLE_ROOT,
                keccak256(abi.encodePacked(metadataId, rewardsPerDay))
            ) == false
        ) revert InvalidRewardsForToken(tokenId, metadataId, rewardsPerDay);

        assert(_lastClaimTimestamps[tokenId] > 0);
        assert(block.timestamp >= _lastClaimTimestamps[tokenId]);
        uint256 nbSecondsToClaim = block.timestamp -
            _lastClaimTimestamps[tokenId];

        return
            ((10 ** BUFA_CONTRACT_ADDRESS.decimals()) *
                rewardsPerDay *
                nbSecondsToClaim) / 86400;
    }

    function _getDiscount(
        address tokenOwner,
        uint256 amount,
        uint256 quantity,
        bytes32[] calldata discountMerkleProof
    ) private view returns (uint256 discount) {
        discount = 0;
        uint256 ownerBalance = balanceOf(tokenOwner);

        if (
            discountMerkleProof.length > 0 &&
            ((ownerBalance == 0 && quantity > 1) || ownerBalance == 1)
        ) {
            if (
                MerkleProof.verifyCalldata(
                    discountMerkleProof,
                    _DISCOUNT_LIST_MERKLE_ROOT,
                    keccak256(abi.encodePacked(tokenOwner))
                )
            ) {
                discount = amount / 2;
            }
        }
    }

    function _getMetadataForToken(
        uint256 tokenId
    ) private view returns (uint256) {
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();
        return (tokenId + randomNumber) % MAX_SUPPLY;
    }

    function _getMintPriceForCurrency(
        address currency
    ) private view returns (bool enabled, uint256 amount) {
        MintPriceSettings memory mintPriceSettings = currency != address(0)
            ? _mintERC20Prices[IERC20(currency)]
            : _mintNativePrice;

        enabled = mintPriceSettings.enabled;
        amount = mintPriceSettings.amount;
    }
}

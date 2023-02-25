// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

import "erc721a/contracts/extensions/ERC4907A.sol";

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
 * Token metadata should be revealed by the contract's owner.
 * A mechanism using Chainlink VRF ensures that no cheating is possible.
 * IMPORTANT :
 * - Deployer should create and fund a Chainlink subscription
 * - Deployer should add the deployed contract as a consumer for the subscription
 *
 * When a user pays and mints X tokens, he also receives X tokens from each Bufalo collection of wearables.
 * IMPORTANT :
 * - Deployer should be owner of 1000 wearable tokens, for each collection to airdrop.
 * - Once the contract deployed, the deployer should call for each collection
 *   the {ERC721-setApprovalForAll} function to allow the contract to airdrop the tokens
 */
contract BOTV is ERC2981, ERC4907A, Ownable, VRFConsumerBaseV2 {
    struct MintPriceSettings {
        bool enabled;
        uint256 amount;
    }

    using SafeERC20 for IERC20;
    using Strings for uint256;

    /// @notice Maximum number of tokens to mint
    uint256 public constant MAX_SUPPLY = 1000;

    /// @notice Maximum number of tokens an address can mint
    uint256 public constant MINT_LIMIT_PER_WALLET = 10;

    /// @notice Where goes funds from mint and second sales royalties
    address payable public immutable TREASURY;

    /// @notice Merkle root to check if an address can get a discount
    bytes32 public immutable DISCOUNT_LIST_MERKLE_ROOT;

    /// @notice Merkle root to check if an address is on the private sale allowlist
    bytes32 public immutable PRIVATE_LIST_MERKLE_ROOT;

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

    /** @notice Opensea-comptatible off-chain metadata base URI for each ERC721 token,
     * See https://docs.opensea.io/docs/metadata-standards
     */
    string public constant baseURI =
        "ipfs://bafybeigbkru6w5yyim3wrkuisayq3hk66cgxcatjtqk2xpyjrfv5avoici/tokens/";

    /** @notice Opensea-comptatible storefront-level metadata,
     * See https://docs.opensea.io/docs/contract-level-metadata
     */
    string public constant contractURI =
        "ipfs://bafkreid2ll6xenucqrbjpaqhrhweqizl4txpg7i2ejbzvrprgzl4du6zom";

    // Chainlink VRF configuration, see https://docs.chain.link/vrf/v2/subscription/supported-networks/
    VRFCoordinatorV2Interface private immutable _VRF_COORDINATOR;

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
    error MaxSupplyExceeded();
    error NoActiveSale();
    error NotAllowedForPrivateSale();
    error RevealAlreadyRequested();
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

    /* ****************
     *  CONTRACT CONSTRUCTOR
     *****************/

    /**
     * @param mintCurrency For example 0x7ceb23fd6bc0add59e62ac25578270cff1b9f619 to charge mint in WETH on Polygon. Set 0 to select the blockchain's native coin.
     * @param mintAmount Price per token minted, paid in token/coin specified with the `mintCurrency` parameter
     * @param treasury Where to send funds from mints & royalties
     * @param vrfCoordinator Chainlink VRF configuration, for example 0xAE975071Be8F8eE67addBC1A82488F1C24858067 on Polygon. See https://docs.chain.link/vrf/v2/subscription/supported-networks/
     * @param wearablesAddresses Contracts for wearable tokens to airdrop
     * @param wearablesTokenIdsOffset From which tokenIDs deployer is owner of wearables to airdrop
     * @param discountListMerkleRoot Merkle root computed from array of eligible addresses for the 50% discount on second token minted
     * @param privateListMerkleRoot Merkle root computed from array of allowed addresses to mint during the private sale
     */
    constructor(
        address mintCurrency,
        uint256 mintAmount,
        address payable treasury,
        address vrfCoordinator,
        address[] memory wearablesAddresses,
        uint256[] memory wearablesTokenIdsOffset,
        bytes32 discountListMerkleRoot,
        bytes32 privateListMerkleRoot
    ) ERC721A("BOTV Skulls", "BOTV") VRFConsumerBaseV2(vrfCoordinator) {
        if (treasury == address(0)) revert CannotBeZeroAddress();
        if (vrfCoordinator == address(0)) revert CannotBeZeroAddress();

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
            discountListMerkleRoot == bytes32(0) ||
            privateListMerkleRoot == bytes32(0)
        ) revert InvalidMerkleRoot();

        _setPrice(mintCurrency, true, mintAmount);

        TREASURY = treasury;

        _VRF_COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinator);

        _WEARABLES_OWNER = _msgSenderERC721A();
        _WEARABLES_ADDRESSES = wearablesAddresses;

        DISCOUNT_LIST_MERKLE_ROOT = discountListMerkleRoot;
        PRIVATE_LIST_MERKLE_ROOT = privateListMerkleRoot;

        // 10 % royalties fee
        _setDefaultRoyalty(treasury, 1000);
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

     * @dev External calls considerations :
     * - Payment with provided `currency` should have been enabled with {setPrice} function
     * - Will revert if the contract do not succeed to charge  
     * (this contract should have spending allowance if `currency` is ERC20, see {IERC20-approve})
     * - Checks Effects pattern & reetrancy protection from ERC721A contract  
     *
     * Emits a {Mint} and {IERC721-Transfer} events.
     */
    function mint(
        address tokenOwner,
        uint256 quantity,
        address currency,
        bytes32[] calldata privateSaleMerkleProof,
        bytes32[] calldata discountMerkleProof
    ) external payable {
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
            Address.sendValue(TREASURY, price);
        } else {
            // if paid with ERC20 tokens
            IERC20(currency).safeTransferFrom(
                _msgSenderERC721A(),
                TREASURY,
                price
            );
        }

        // mint `quantity` tokens, transfer to `tokenOwner`
        super._safeMint(tokenOwner, quantity);

        // transfer to `tokenOwner` the wearables as a gift for the mint
        _airdrop(quantity, tokenOwner);

        emit Mint(tokenOwner, quantity, price, currency, _msgSenderERC721A());
    }

    /* ****************************************
     *  EXTERNAL FUNCTIONS, RESTRICTED TO OWNER
     ******************************************/

    function resetVrfRequest() external onlyOwner {
        if (randomNumber != 0) revert AlreadyRevealed();
        requestId = 0;
    }

    /** @param keyHash See https://docs.chain.link/vrf/v2/subscription/supported-networks/#configurations
     *  @param subscriptionId Create a subscription here : https://vrf.chain.link/
     *  @param callbackGasLimit Storing each word costs about 20,000 gas. 40,000 is a safe default for this function
     *
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

    /// @param active Activate/deactivate private mint
    function setPrivateSale(bool active) external onlyOwner {
        privateSaleActive = active;
    }

    /// @param active Activate/deactivate public mint
    function setPublicSale(bool active) external onlyOwner {
        publicSaleActive = active;
    }

    /* ****************
     *  EXTERNAL  GETTERS
     *****************/

    function getTreasury() external view returns (address payable) {
        return TREASURY;
    }

    function getMaxSupply() external pure returns (uint256) {
        return MAX_SUPPLY;
    }

    /* ****************
     *  PUBLIC GETTERS
     *****************/

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
                PRIVATE_LIST_MERKLE_ROOT,
                keccak256(abi.encodePacked(tokenOwner))
            );
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

    /**
     * @dev See {IERC165-supportsInterface}.
     */
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
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();

        if (randomNumber == 0) {
            return string(abi.encodePacked(baseURI, "prereveal"));
        } else {
            uint256 randomMetadataId = (tokenId + randomNumber) % MAX_SUPPLY;
            return
                string(abi.encodePacked(baseURI, randomMetadataId.toString()));
        }
    }

    /* ****************
     *  INTERNAL OVERRIDE
     *****************/

    /**
     * @dev See {ERC721-_burn}. This override additionally clears the royalty information for the token.
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

    /* ****************
     *  PRIVATE FUNCTIONS
     *****************/

    function _airdrop(uint256 quantity, address tokenOwner) private {
        // @dev gas optimization : copy from storage to memory
        address[] memory airdrops = _WEARABLES_ADDRESSES;
        uint256 airdropNbs = airdrops.length;

        // @dev `quantity` will never be > 10 (cf. `MINT_LIMIT_PER_WALLET`)
        for (uint256 i = 0; i < quantity; i++) {
            /** Airdrop wearables
             * DCL wearables supports {batchTransferFrom},
             * but we want to comply with any ERC721 contract
             */
            for (uint256 j = 0; j < airdropNbs; j++) {
                IERC721 airdropAddr = IERC721(airdrops[j]);

                uint256 currentId = _wearablesTokenIds[airdropAddr];

                airdropAddr.safeTransferFrom(
                    _WEARABLES_OWNER,
                    tokenOwner,
                    currentId
                );
                _wearablesTokenIds[airdropAddr] = currentId + 1;
            }
        }
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

    /**
     * @notice  Check if an address can have 50% off on the second token minted, and get the discount amount
     * @param tokenOwner Beneficiary address
     * @param amount Price per token
     * @param quantity Number of tokens to mint
     * @param discountMerkleProof Merkle proof to check if tokenOwner can have a 50% discount on the second token
     *
     * @return discount How much to subtract to normal price
     */
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
                    DISCOUNT_LIST_MERKLE_ROOT,
                    keccak256(abi.encodePacked(tokenOwner))
                )
            ) {
                discount = amount / 2;
            }
        }
    }

    /** @param currency ERC20 contract address or 0 for native coin
     *
     * @return enabled {currency} is accepted as a paying method
     * @return amount how much to pay in {currency} per token
     */
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

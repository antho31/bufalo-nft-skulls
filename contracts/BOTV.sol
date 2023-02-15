// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title Bufalo's NFT Collection - BOTV Skulls (BOTV)
 * @author Anthony Gourraud
 * @notice This is an NFT (ERC721) contract
 * with ERC20 pricing and ERC2981 royalties implementations.
 *
 * TODO doc [ ] Private sale and public sale
 * [ ] Chainlink reveal
 *
 * TODO : ERC721A
 */
contract BOTV is ERC721Royalty, Ownable, ReentrancyGuard, VRFConsumerBaseV2 {
    struct MintPriceSettings {
        bool enabled;
        uint256 amount;
    }

    using Counters for Counters.Counter;
    using SafeERC20 for IERC20;
    using Strings for uint256;

    /// @notice Maximum number of tokens to mint
    uint256 public constant MAX_SUPPLY = 1000;

    /// @notice Maximum number of tokens an address can mint
    uint256 public constant MINT_LIMIT_PER_WALLET = 10;

    /// @notice Where goes funds from mint and second sales royalties
    address payable public immutable TREASURY;

    /** @notice Opensea-comptatible off-chain metadata for each ERC721 token,
     * only `controller` can modify this value
     * See https://docs.opensea.io/docs/metadata-standards
     */
    string public constant baseURI = "@TODO";

    /** @notice Opensea-comptatible storefront-level metadata for your contract,
     * only `controller` can modify this value
     * See https://docs.opensea.io/docs/contract-level-metadata
     */
    string public constant contractURI = "@TODO";

    /// @notice To check if an address can get a discount
    bytes32 public immutable DISCOUNT_LIST_MERKLE_ROOT;

    /// @notice To check if an address is on the private sale allowlist
    bytes32 public immutable PRIVATE_LIST_MERKLE_ROOT;

    /// @notice Boolean operator to activate private sale
    bool public privateSaleActive = false;

    /// @notice Boolean operator to activate public sale
    bool public publicSaleActive = false;

    /// @notice Random number got via Chainlink VRF, to link a tokenId to skull metadata on IPFS
    uint256 public randomNumber;

    /// @notice Request ID from Chainlink VRF, to link a tokenId to skull metadata on IPFS
    uint256 public requestId;

    VRFCoordinatorV2Interface private immutable _VRF_COORDINATOR;

    address private immutable _WEARABLES_OWNER;

    address[] private _WEARABLES_ADDRESSES;
    uint256[] private _WEARABLES_TOKENIDS_OFFSET;

    mapping(IERC721 => Counters.Counter) private _wearablesTokenIds;
    Counters.Counter private _tokenIds;

    MintPriceSettings private _mintNativePrice = MintPriceSettings(false, 0);
    mapping(IERC20 => MintPriceSettings) private _mintERC20Prices;

    /* ****************
     *  ERRORS
     *****************/

    error AlreadyRevealed();
    error AmountValueTooLow(uint256 value);
    error CannotBeZeroAddress();
    error ForbiddenCurrency(address currency);
    error IncompleteAirdropParameter();
    error InvalidTokenId(uint256 tokenId);
    error InvalidERC20Transfer();
    error InvalidQuantity();
    error MaxSupplyExceeded();
    error NoActiveSale();
    error NotAllowedForPrivateSale();
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

    /* ****************
     *  CONTRACT CONSTRUCTOR
     *****************/

    /**
     * @param treasury Address to send funds from sales
     * TODO complete doc
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
    ) ERC721("BOTV Skulls", "BOTV") VRFConsumerBaseV2(vrfCoordinator) {
        if (treasury == address(0)) revert CannotBeZeroAddress();
        if (vrfCoordinator == address(0)) revert CannotBeZeroAddress();

        if (wearablesAddresses.length != wearablesTokenIdsOffset.length)
            revert IncompleteAirdropParameter();

        _setPrice(mintCurrency, true, mintAmount);

        TREASURY = treasury;

        _VRF_COORDINATOR = VRFCoordinatorV2Interface(vrfCoordinator);

        _WEARABLES_OWNER = msg.sender;
        _WEARABLES_ADDRESSES = wearablesAddresses;
        _WEARABLES_TOKENIDS_OFFSET = wearablesTokenIdsOffset;

        DISCOUNT_LIST_MERKLE_ROOT = discountListMerkleRoot;
        PRIVATE_LIST_MERKLE_ROOT = privateListMerkleRoot;

        // 10 % royalties fee
        _setDefaultRoyalty(treasury, 1000);
    }

    /* ******************
     *  EXTERNAL FUNCTIONS
     ********************/

    /**
     * @notice Mint tokens if succeed to pay with provided `currency`, and transfer to `tokenOwner`
     * @param tokenOwner Transfer minted token to this address
     * @param quantity Number of tokens to mint
     * @param currency ERC20 contract address to spend tokens, 0 for native
     * @param privateSaleMerkleProof Merkle proof to check if tokenOwner is on the private sale allowlist 
     * @param discountMerkleProof Merkle proof to check if tokenOwner can have a 50% discount on the second token 

     * @dev External calls considerations :
     * - Payment with provided `currency` should be enabled : {getMintPriceForCurrency} gives the `enabled` information.
     * - Will revert if the contract cannot transfer corresponding price `amount` per unit
     * (this contract should have spending allowance if `currency` is ERC20, see {IERC20-approve})
     * - Reentrency protection against {ERC721-_safeMint}, ({IERC721Receiver-onERC721Received}) (needed if paid via msg.value)
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
        // check quantity & supply
        if (quantity == 0) revert InvalidQuantity();
        if (MAX_SUPPLY < (totalSupply() + quantity)) revert MaxSupplyExceeded();

        // check beneficiary validity
        if (tokenOwner == address(0)) revert CannotBeZeroAddress();

        // check price to mint
        (bool enabled, uint256 amount) = getMintPriceForCurrency(currency);
        if (!enabled) revert ForbiddenCurrency(currency);

        // ensure beneficiary cannot mint more than {MINT_LIMIT_PER_WALLET} tokens
        uint256 ownerBalance = balanceOf(tokenOwner);
        if (ownerBalance + quantity > MINT_LIMIT_PER_WALLET)
            revert TokenMintingLimitExceeded();

        // revert if there is no active sale or if beneficiary address is not in the privale sale allowlist
        if (publicSaleActive == false) {
            if (privateSaleActive == false) revert NoActiveSale();

            if (
                MerkleProof.verifyCalldata(
                    privateSaleMerkleProof,
                    PRIVATE_LIST_MERKLE_ROOT,
                    keccak256(abi.encodePacked(tokenOwner))
                ) == false
            ) revert NotAllowedForPrivateSale();
        }

        // compute how much to pay
        // check if beneficiary address can have a 50% discoutn on the second token
        uint256 discount = 0;
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
        uint256 price = (quantity * amount) - discount;

        // pay to mint
        if (currency == address(0)) {
            // if paid with MATIC on Polygon / ETH on Ethereum
            if (msg.value < price) revert AmountValueTooLow(msg.value);
            Address.sendValue(TREASURY, price);
        } else {
            IERC20(currency).safeTransferFrom(_msgSender(), TREASURY, price);
        }

        // @dev gas optimization : copy from storage to memory
        address[] memory airdrops = _WEARABLES_ADDRESSES;
        uint256 airdropNbs = airdrops.length;

        // mint {quantity} tokens, transfer to {tokenOwner}
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = totalSupply();
            super._safeMint(tokenOwner, tokenId);
            _tokenIds.increment();

            // airdrop wearables
            for (uint256 j = 0; j < airdropNbs; j++) {
                IERC721 airdropAddr = IERC721(airdrops[j]);

                airdropAddr.safeTransferFrom(
                    _WEARABLES_OWNER,
                    tokenOwner,
                    _wearablesTokenIds[airdropAddr].current()
                );
                _wearablesTokenIds[airdropAddr].increment();
            }
        }

        emit Mint(tokenOwner, quantity, price, currency, msg.sender);
    }

    /** @param keyHash See https://docs.chain.link/vrf/v2/subscription/supported-networks/#configurations
     *  @param subscriptionId Create a subscription here : https://vrf.chain.link/mumbai
     *  @param callbackGasLimit Storing each word costs about 20,000 gas. 40,000 is a safe default for this function
     *
     * Emits a {MintPriceChange} event.
     */
    function reveal(
        bytes32 keyHash,
        uint64 subscriptionId,
        uint32 callbackGasLimit
    ) external onlyOwner returns (uint256) {
        if (requestId != 0) revert AlreadyRevealed();

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
        return requestId;
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
     *  INTERNAL FUNCTIONS
     *****************/

    /** @param currency ERC20 contract address or 0 for native coin
     *  @param enabled Allow / disallow minting sale with provided `currency`
     *  @param amount How much user will have to pay to mint one token - can be 0
     *
     * Emits a {MintPriceChange} event.
     */
    function _setPrice(
        address currency,
        bool enabled,
        uint256 amount
    ) internal {
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
     *  EXTERNAL  GETTERS
     *****************/

    function getTreasury() external view returns (address payable) {
        return TREASURY;
    }

    // @dev URI OpenSea traits compatibility.
    function uri(uint256 tokenId) external view returns (string memory) {
        return tokenURI(tokenId);
    }

    function getContractURI() external pure returns (string memory) {
        return contractURI;
    }

    function getMaxSupply() external pure returns (uint256) {
        return MAX_SUPPLY;
    }

    /* ****************
     *  PUBLIC GETTERS
     *****************/

    function getMintPriceForCurrency(
        address currency
    ) public view returns (bool enabled, uint256 amount) {
        MintPriceSettings memory mintPriceSettings = currency != address(0)
            ? _mintERC20Prices[IERC20(currency)]
            : _mintNativePrice;

        enabled = mintPriceSettings.enabled;
        amount = mintPriceSettings.amount;
    }

    function totalSupply() public view returns (uint256) {
        return _tokenIds.current();
    }

    /* ****************
     *  PUBLIC OVERRIDE GETTERS
     *****************/

    /**
     * @notice Callback function used by VRF Coordinator to return the random number to this contract.
     */
    function fulfillRandomWords(
        uint256 /* requestId */,
        uint256[] memory randomWords
    ) internal override {
        // we want to avoid a randomNumber = 0
        // or between [ MAX_UINT256 - MAX_SUPPLY ; MAX_UINT256] (because {tokenURI} will compute tokenId + randomNumber, so we have to prevent overflow)
        // so we transform the result to a number between 1 and 1547888569 (arbitrary number) inclusively
        randomNumber = (randomWords[0] % 1547888569) + 1;
    }

    function isApprovedForAll(
        address _owner,
        address _operator
    ) public view override returns (bool isOperator) {
        /* @dev On Polygon (Main Network), if OpenSea's ERC721 Proxy Address is detected,
         * auto-return true. Otherwise, use the default ERC721.isApprovedForAll()
         * See https://docs.opensea.io/docs/polygon-basic-integration
         */
        if (
            block.chainid == 137 &&
            _operator == address(0x58807baD0B376efc12F5AD86aAc70E78ed67deaE)
        ) {
            return true;
        }
        return ERC721.isApprovedForAll(_owner, _operator);
    }

    function tokenURI(
        uint256 tokenId
    ) public view virtual override returns (string memory) {
        _requireMinted(tokenId);

        if (randomNumber == 0) {
            return string(abi.encodePacked(baseURI, "prereveal.json"));
        } else {
            uint256 randomMetadataId = (tokenId + randomNumber) % MAX_SUPPLY;
            return
                string(abi.encodePacked(baseURI, randomMetadataId.toString()));
        }
    }
}

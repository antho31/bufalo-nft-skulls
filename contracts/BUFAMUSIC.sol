// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@opengsn/contracts/src/ERC2771Recipient.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155URIStorage.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./interfaces/IBUFA.sol";
import "./interfaces/IBOTV.sol";

/**
 * @title Bufalo's Music NFTs
 * @author Anthony Gourraud
 * @notice ERC20 contract with AccessControl to allow token minting
 */
contract BUFAMUSIC is
    Ownable,
    ERC1155Supply,
    ERC1155URIStorage,
    ERC2771Recipient,
    ReentrancyGuard
{
    struct SacemRecord {
        uint256 recordId;
    }
    mapping(uint256 => SacemRecord) public SacemData;
    mapping(uint256 => uint256) public maxSupplies;
    mapping(uint256 => uint256) public bufaPrices; // ether prices

    IBOTV public botvContractAddress;
    IBUFA public bufaContractAddr;

    constructor(
        address _botvAddress,
        address _bufaAddress,
        address _trustedForwarder
    ) ERC1155("Bufalo Music NFTs") {
        _setTrustedForwarder(_trustedForwarder);
        _setBotvAddress(_botvAddress);
        _setBufaAddress(_bufaAddress);
        _setupMusicNFT(0, 1458888, 50, 1);
        _setURI(
            0,
            "https://bafkreih342ey3v2ezuhc2pqcijw6kod7dcnlnwfxd7v6gmhwtjajzdwjse.ipfs.nftstorage.link"
        );
    }

    function claimAndMintWithBufaTokens(
        uint256 tokenId,
        uint256 quantity,
        uint256[] memory botvTokenIds,
        uint256[] memory rewardsPerDay,
        bytes32[][] calldata rewardsProofs
    ) external {
        address account = _msgSender();

        botvContractAddress.claimRewards(
            account,
            botvTokenIds,
            rewardsPerDay,
            rewardsProofs
        );
        mintWithBufaTokens(tokenId, quantity);
    }

    function mint(
        address to,
        uint256 tokenId,
        uint256 amount
    ) external onlyOwner {
        _mint(to, tokenId, amount);
    }

    function mintWithBufaTokens(
        uint256 tokenId,
        uint256 quantity
    ) public nonReentrant {
        // @todo require quantity > 0
        // @todo require tokenId is enabled

        uint256 price = bufaPrices[tokenId];
        uint256 amount = quantity * price * (10 ** bufaContractAddr.decimals());
        address account = _msgSender();

        bufaContractAddr.burn(account, amount);
        _mint(account, tokenId, quantity);
    }

    function setBaseURI(string memory baseURI) external onlyOwner {
        _setBaseURI(baseURI);
    }

    function setBotvAddress(address contractAddr) external onlyOwner {
        _setBotvAddress(contractAddr);
    }

    function setBufaAddress(address contractAddr) external onlyOwner {
        _setBufaAddress(contractAddr);
    }

    function setTrustedForwarder(address _trustedForwarder) external onlyOwner {
        _setTrustedForwarder(_trustedForwarder);
    }

    function setupMusicNFT(
        uint256 tokenId,
        uint256 recordId,
        uint256 maxSupply,
        uint256 bufaPrice
    ) external onlyOwner {
        _setupMusicNFT(tokenId, recordId, maxSupply, bufaPrice);
    }

    function setURI(
        uint256 tokenId,
        string memory tokenURI
    ) external onlyOwner {
        _setURI(tokenId, tokenURI);
    }

    function versionRecipient() external pure returns (string memory) {
        return "1";
    }

    function uri(
        uint256 tokenId
    )
        public
        view
        virtual
        override(ERC1155, ERC1155URIStorage)
        returns (string memory)
    {
        return ERC1155URIStorage.uri(tokenId);
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override(ERC1155, ERC1155Supply) {
        ERC1155Supply._beforeTokenTransfer(
            operator,
            from,
            to,
            ids,
            amounts,
            data
        );
    }

    function _msgData()
        internal
        view
        virtual
        override(ERC2771Recipient, Context)
        returns (bytes calldata)
    {
        return ERC2771Recipient._msgData();
    }

    function _msgSender()
        internal
        view
        virtual
        override(ERC2771Recipient, Context)
        returns (address sender)
    {
        return ERC2771Recipient._msgSender();
    }

    function _mint(address to, uint256 tokenId, uint256 amount) private {
        // @todo check quantity
        _mint(to, tokenId, amount, "");
        // @todo event mint with sacem data
    }

    function _setBotvAddress(address contractAddr) private {
        botvContractAddress = IBOTV(contractAddr);
    }

    function _setBufaAddress(address contractAddr) private {
        bufaContractAddr = IBUFA(contractAddr);
    }

    function _setBufaPrice(uint256 tokenId, uint256 bufaPrice) private {
        bufaPrices[tokenId] = bufaPrice;
        // @todo event
    }

    function _setMaxSupply(uint256 tokenId, uint256 maxSupply) private {
        require(maxSupply > totalSupply(tokenId), "Cannot reduce the supply");
        maxSupplies[tokenId] = maxSupply;
        // @todo event
    }

    function _setupMusicNFT(
        uint256 tokenId,
        uint256 recordId,
        uint256 maxSupply,
        uint256 bufaPrice
    ) private {
        // uint256 existingRecordId = SacemData[tokenId].recordId;
        // @todo Error if exists

        SacemRecord memory sacemRecord = SacemRecord(recordId);
        SacemData[tokenId] = sacemRecord;

        _setBufaPrice(tokenId, bufaPrice);
        _setMaxSupply(tokenId, maxSupply);

        // @todo event music nft
    }
}

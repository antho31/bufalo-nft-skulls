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
 * @notice ERC1155 contract giving commercial rights on a music for holders
 */
contract BUFAMUSIC is
    Ownable,
    ERC1155Supply,
    ERC1155URIStorage,
    ERC2771Recipient,
    ReentrancyGuard
{
    using Strings for uint256;

    struct TokenParameter {
        string title;
        string iswc;
        uint256 supply;
        uint256 bufaPrice;
        bool mintActive;
        bool tokenActive;
    }

    string public name = "Bufalo Music NFTs";
    string public symbol = "BUFAMUSIC";

    IBOTV public botvContractAddr;
    IBUFA public bufaContractAddr;

    mapping(uint256 => TokenParameter) public tokenParameters;
    mapping(string => uint256) public iswcs;

    /* ****************
     *  ERRORS
     *****************/

    error CannotSubmitALowerSupply();
    error InactiveToken(uint256 tokenId);
    error IswcAlreadyUsed(string iswc, uint256 tokenId, uint256 actualTokenId);
    error MintDisabled(uint256 tokenId);
    error OneTokenPerIdOnly(address tokenOwner, uint256 tokenId);
    error SupplyExceeded(
        uint256 tokenId,
        uint256 actualSupply,
        uint256 quantity,
        uint256 maxSupply
    );
    error SupplySetAs0(uint256 tokenId);

    /* ****************
     *  EVENTS
     *****************/

    event CommercialRightsChange(
        string indexed iswc,
        address indexed previousOwner,
        address indexed newOwner,
        uint256 tokenId
    );

    event UpdatedTokenParameter(
        uint256 indexed tokenId,
        string indexed title,
        string indexed iswc,
        uint256 supply,
        uint256 bufaPrice,
        bool mintActive,
        bool tokenActive
    );

    /* ****************
     *  CONTRACT CONSTRUCTOR
     *****************/

    constructor(
        address _botvAddress,
        address _bufaAddress,
        address _trustedForwarder
    ) ERC1155("") {
        _setTrustedForwarder(_trustedForwarder);
        _setBotvAddress(_botvAddress);
        _setBufaAddress(_bufaAddress);
        _setBaseURI(
            "https://bufalo-api.anthonygourraud.workers.dev/musicnftmetadata/"
        );
    }

    /* ******************
     *  EXTERNAL FUNCTIONS
     ********************/

    function claimAndMintWithBufaTokens(
        uint256 tokenId,
        uint256 quantity,
        uint256[] memory botvTokenIds,
        uint256[] memory rewardsPerDay,
        bytes32[][] calldata rewardsProofs
    ) external {
        address account = _msgSender();

        botvContractAddr.claimRewards(
            account,
            botvTokenIds,
            rewardsPerDay,
            rewardsProofs
        );
        mintWithBufaTokens(tokenId, quantity);
    }

    /* ****************************************
     *  EXTERNAL FUNCTIONS, RESTRICTED TO OWNER
     ******************************************/

    function burn(
        address from,
        uint256 id,
        uint256 quantity
    ) external onlyOwner {
        _burn(from, id, quantity);
    }

    function mint(
        address to,
        uint256 tokenId,
        uint256 quantity
    ) external onlyOwner {
        _mint(to, tokenId, quantity);
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

    function updateTokenParameter(
        uint256 tokenId,
        string memory title,
        string memory iswc,
        uint256 supply,
        uint256 bufaPrice,
        bool mintActive,
        bool tokenActive
    ) external onlyOwner {
        _updateTokenParameter(
            tokenId,
            title,
            iswc,
            supply,
            bufaPrice,
            mintActive,
            tokenActive
        );
    }

    function setURI(
        uint256 tokenId,
        string memory tokenURI
    ) external onlyOwner {
        _setURI(tokenId, tokenURI);
    }

    /* ******************
     *  PUBLIC FUNCTIONS
     ********************/

    function mintWithBufaTokens(
        uint256 tokenId,
        uint256 quantity
    ) public nonReentrant {
        address account = _msgSender();

        if (balanceOf(account, tokenId) > 0)
            revert OneTokenPerIdOnly(account, tokenId);

        TokenParameter memory tokenParameter = tokenParameters[tokenId];

        if (tokenParameter.tokenActive == false) revert InactiveToken(tokenId);
        if (tokenParameter.mintActive == false) revert MintDisabled(tokenId);

        uint256 price = tokenParameter.bufaPrice;

        if (price > 0) {
            uint256 amount = quantity * price;
            bufaContractAddr.burn(account, amount);
        }

        _mint(account, tokenId, quantity);
    }

    /* ****************
     *  EXTERNAL GETTERS
     *****************/

    function versionRecipient() external pure returns (string memory) {
        return "1";
    }

    /* ****************
     *  PUBLIC GETTERS
     *****************/

    function uri(
        uint256 tokenId
    )
        public
        view
        virtual
        override(ERC1155, ERC1155URIStorage)
        returns (string memory)
    {
        if (tokenParameters[tokenId].tokenActive == false)
            revert InactiveToken(tokenId);

        return ERC1155URIStorage.uri(tokenId);
    }

    /* ****************
     *  INTERNAL OVERRIDE
     *****************/

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

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 tokenId = ids[i];

            emit CommercialRightsChange(
                tokenParameters[tokenId].iswc,
                from,
                to,
                tokenId
            );
        }
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

    /* ****************
     *  PRIVATE FUNCTIONS
     *****************/

    function _mint(address to, uint256 tokenId, uint256 quantity) private {
        TokenParameter memory tokenParameter = tokenParameters[tokenId];

        if (tokenParameter.supply == 0) revert SupplySetAs0(tokenId);

        uint256 actualSupply = totalSupply(tokenId);
        uint256 maxSupply = tokenParameter.supply;
        if (actualSupply + quantity > maxSupply)
            revert SupplyExceeded(tokenId, actualSupply, quantity, maxSupply);

        _mint(to, tokenId, quantity, "");
    }

    function _setBotvAddress(address contractAddr) private {
        botvContractAddr = IBOTV(contractAddr);
    }

    function _setBufaAddress(address contractAddr) private {
        bufaContractAddr = IBUFA(contractAddr);
    }

    function _updateTokenParameter(
        uint256 tokenId,
        string memory title,
        string memory iswc,
        uint256 supply,
        uint256 bufaPrice,
        bool mintActive,
        bool tokenActive
    ) private {
        uint256 tokenIdFromISWC = iswcs[iswc];

        if (tokenParameters[tokenId].supply > supply)
            revert CannotSubmitALowerSupply();

        if (tokenIdFromISWC == 0 || tokenIdFromISWC == tokenIdFromISWC) {
            TokenParameter memory tokenParameter = TokenParameter(
                title,
                iswc,
                supply,
                bufaPrice,
                mintActive,
                tokenActive
            );

            tokenParameters[tokenId] = tokenParameter;
            iswcs[iswc] = tokenId;
            _setURI(tokenId, tokenId.toString());

            emit UpdatedTokenParameter(
                tokenId,
                title,
                iswc,
                supply,
                bufaPrice,
                mintActive,
                tokenActive
            );
        } else {
            revert IswcAlreadyUsed(iswc, tokenId, tokenIdFromISWC);
        }
    }
}

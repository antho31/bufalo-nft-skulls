// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@opengsn/contracts/src/ERC2771Recipient.sol";

/**
 * @title Bufalo's Rewards Token (BUFA)
 * @author Anthony Gourraud
 * @notice ERC20 contract with AccessControl to allow token minting
 */
contract BUFA is ERC20, ERC2771Recipient, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant SPENDER_ROLE = keccak256("SPENDER_ROLE");

    constructor(address _trustedForwarder) ERC20("Bufalo Token", "BUFA") {
        _setTrustedForwarder(_trustedForwarder);

        // Grant the contract deployer the default admin role: it will be able
        // to grant and revoke any roles
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

        _grantRole(MINTER_ROLE, _msgSender());
        _grantRole(SPENDER_ROLE, _msgSender());
    }

    function burn(
        address from,
        uint256 amount
    ) external onlyRole(SPENDER_ROLE) {
        _burn(from, amount);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function setTrustedForwarder(
        address _trustedForwarder
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setTrustedForwarder(_trustedForwarder);
    }

    function versionRecipient() external pure returns (string memory) {
        return "1";
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

    function _msgData()
        internal
        view
        virtual
        override(ERC2771Recipient, Context)
        returns (bytes calldata)
    {
        return ERC2771Recipient._msgData();
    }
}

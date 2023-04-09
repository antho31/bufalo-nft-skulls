// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

/**
 * @title Bufalo's Rewards Token (BUFA)
 * @author Anthony Gourraud
 * @notice ERC20 contract with AccessControl to allow token minting
 */
contract BUFA is ERC20Permit, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant SPENDER_ROLE = keccak256("SPENDER_ROLE");

    constructor() ERC20("Bufalo Token", "BUFA") ERC20Permit("MyToken") {
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

    function versionRecipient() external pure returns (string memory) {
        return "1";
    }
}

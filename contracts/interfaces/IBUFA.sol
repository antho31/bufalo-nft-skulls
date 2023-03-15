// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IBUFA is IERC20 {
    function decimals() external view returns (uint8);

    function mint(address to, uint256 amount) external;
}

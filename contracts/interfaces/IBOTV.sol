// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "erc721a/contracts/IERC721A.sol";

interface IBOTV is IERC721A {
    function claimRewards(
        address tokenOwner,
        uint256[] memory tokenIds,
        uint256[] memory rewardsPerDay,
        bytes32[][] calldata rewardsProofs
    ) external;
}

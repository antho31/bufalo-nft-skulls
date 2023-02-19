// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ERC721Mock is ERC721 {
    constructor(
        string memory name,
        string memory symbol
    ) ERC721(name, symbol) {}

    function mint(
        address account,
        uint256 tokenOffset,
        uint256 quantity
    ) public {
        for (uint256 i = 0; i < quantity; i++) {
            _mint(account, tokenOffset);
            tokenOffset++;
        }
    }
}

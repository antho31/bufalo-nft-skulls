// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IBOTV {
    function mint(
        address tokenOwner,
        uint256 quantity,
        address currency,
        bytes32[] calldata privateSaleMerkleProof,
        bytes32[] calldata discountMerkleProof
    ) external payable;
}

contract Reentrant is IERC721Receiver {
    bool entered = false;

    uint256 quantity;
    address currency;
    bytes32[] privateSaleMerkleProof;
    bytes32[] discountMerkleProof;

    constructor(
        uint256 _quantity,
        address _currency,
        bytes32[] memory _privateSaleMerkleProof,
        bytes32[] memory _discountMerkleProof
    ) {
        quantity = _quantity;
        currency = _currency;
        privateSaleMerkleProof = _privateSaleMerkleProof;
        discountMerkleProof = _discountMerkleProof;
    }

    function onERC721Received(
        address operator,
        address,
        uint256,
        bytes calldata
    ) external returns (bytes4) {
        if (!entered) {
            entered = true;
            IBOTV(operator).mint(
                address(this),
                quantity,
                currency,
                privateSaleMerkleProof,
                discountMerkleProof
            );
        }

        return IERC721Receiver.onERC721Received.selector;
    }
}

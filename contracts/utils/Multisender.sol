// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract Multisender {
    function multisend(address contractAddress, uint256[] calldata tokenIds, address[] calldata recipients) external {
        require(tokenIds.length == recipients.length, "length mismatch");
        uint256 tokenIdsLength = tokenIds.length;
        for (uint256 i = 0; i < tokenIdsLength; i++) {
            require(IERC721(contractAddress).ownerOf(tokenIds[i]) == msg.sender, "not owner");
            IERC721(contractAddress).safeTransferFrom(msg.sender, recipients[i], tokenIds[i], "");
        }
    }
}

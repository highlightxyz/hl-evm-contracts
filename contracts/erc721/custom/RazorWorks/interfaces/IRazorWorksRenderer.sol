//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

interface IRazorWorksRenderer {
    /**
     * @notice Return the block hash of the block before the minted token's block
     */
    function previousBlockHash(address nftContract, uint256 tokenId) external view returns (bytes32);
}

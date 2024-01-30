// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

/**
 * @notice General1155 mint interface for sequentially minted collections
 * @author highlight.xyz
 */
interface IERC1155YungWkndMint {
    /**
     * @notice Mint one token to one recipient
     * @param recipient Recipient of minted NFT
     */
    function mintOneToOneRecipient(address recipient) external returns (uint256);

    /**
     * @notice Mint one token to one recipient
     * @param recipient Recipient of minted NFT
     * @param tokenId Token id to mint another copy of
     */
    function mintExistingOneToOneRecipient(address recipient, uint256 tokenId) external returns (uint256);

    /**
     * @notice Mint one token to one recipient
     * @param recipient Recipient of minted NFT
     * @param seed Seed to mint specifically
     */
    function mintSeedToOneRecipient(address recipient, bytes32 seed) external returns (uint256);
}

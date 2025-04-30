// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

/**
 * @notice Interface to burn tokens on a Zora 1155 contract
 */
interface IZora1155Burn {
    function burnBatch(address user, uint256[] calldata tokenIds, uint256[] calldata amounts) external;
}

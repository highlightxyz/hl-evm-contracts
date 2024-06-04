// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

/**
 * @notice Interface to burn tokens on a Manifold 1155 Creator contract
 */
interface IManifold1155Burn {
    function burn(address account, uint256[] memory tokenIds, uint256[] memory amounts) external;
}

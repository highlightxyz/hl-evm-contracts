// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

/**
 * @author highlight.xyz
 */
interface IERC721EditionsStartId {
    /**
     * @notice Get an edition's start id
     */
    function editionStartId(uint256 editionId) external view returns (uint256);
}

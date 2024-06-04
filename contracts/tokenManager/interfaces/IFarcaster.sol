// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

/**
 * @author highlight.xyz
 * @notice Interact with idOf on the farcaster id registry
 */
interface IFarcaster {
    function idOf(address user) external view returns (uint256);
}

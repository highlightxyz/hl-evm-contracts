// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../mint/MintManager.sol";

/**
 * @author highlight.xyz
 * @dev Mock MintManager
 */
contract TestMintManager is MintManager {
    /**
     * @dev Test function to test upgrades
     */
    function test() external pure returns (bool) {
        return true;
    }
}

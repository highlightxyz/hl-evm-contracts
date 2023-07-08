// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../utils/Ownable.sol";
import "./InterfaceSupportRoyaltyManager.sol";

/**
 * @author highlight.xyz
 * @notice A basic royalty manager / sample implementation that locks swaps / removals / setting of royalties
 */
contract LockedRoyaltyManager is IRoyaltyManager, InterfaceSupportRoyaltyManager {
    /**
     * @notice See {IRoyaltyManager-canSetGranularRoyalty}
     */
    function canSetGranularRoyalty(
        uint256, /* id */
        Royalty calldata, /* royalty */
        address /* sender */
    ) external pure override returns (bool) {
        // owner can set granular royalty (same as without royalty manager)
        return false;
    }

    /**
     * @notice See {IRoyaltyManager-canSetDefaultRoyalty}
     */
    function canSetDefaultRoyalty(
        Royalty calldata, /* royalty */
        address /* sender */
    ) external pure override returns (bool) {
        // owner can set granular royalty (same as without royalty manager)
        return false;
    }

    /**
     * @notice See {IRoyaltyManager-canSwap}
     */
    function canSwap(
        address, /* newRoyaltyManager */
        address /* sender */
    ) external pure override returns (bool) {
        return false;
    }

    /**
     * @notice See {IRoyaltyManager-canRemoveItself}
     */
    function canRemoveItself(
        address /* sender */
    ) external pure override returns (bool) {
        return false;
    }
}

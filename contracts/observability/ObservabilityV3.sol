// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./ObservabilityV2.sol";
import "./IObservabilityV3.sol";

/**
 * @title ObservabilityV3
 * @author highlight.xyz
 * @notice Highlight Observability v3
 * @dev Singleton to coalesce select Highlight protocol events
 */
contract ObservabilityV3 is ObservabilityV2, IObservabilityV3 {
    /**
     * @notice See {IObservabilityV3-emitOwnershipTransferred}
     */
    function emitOwnershipTransferred(address previousOwner, address newOwner) external {
        emit OwnershipTransferred(msg.sender, previousOwner, newOwner);
    }
}

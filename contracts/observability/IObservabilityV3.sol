// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./IObservabilityV2.sol";

/**
 * @title IObservabilityV3
 * @author highlight.xyz
 * @notice Interface to interact with the Highlight observabilityV3 singleton
 * @dev Singleton to coalesce select Highlight protocol events
 */
interface IObservabilityV3 is IObservabilityV2 {
    /**
     * @notice Emitted when ownership of contract is transferred
     * @param contractAddress Address of contract that was deployed
     * @param previousOwner Previous owner
     * @param newOwner New owner
     */
    event OwnershipTransferred(
        address indexed contractAddress,
        address indexed previousOwner,
        address indexed newOwner
    );

    /**
     * @notice Emit OwnershipTransferred
     */
    function emitOwnershipTransferred(address previousOwner, address newOwner) external;
}

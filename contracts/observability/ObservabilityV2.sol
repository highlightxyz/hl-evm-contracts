// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./Observability.sol";
import "./IObservabilityV2.sol";

/**
 * @title ObservabilityV2
 * @author highlight.xyz
 * @notice Highlight Observability v2
 * @dev Singleton to coalesce select Highlight protocol events
 */
contract ObservabilityV2 is Observability, IObservabilityV2 {
    /**
     * @notice See {IObservability-emitSingleEditionDeployed}
     */
    function emitEditions1155Deployed(address contractAddress) external {
        emit Editions1155Deployed(msg.sender, contractAddress);
    }

    /**
     * @notice Emit 1155 Transfer
     */
    function emitTransferSingle(address operator, address from, address to, uint256 tokenId, uint256 amount) external {
        emit TransferSingle(msg.sender, operator, from, to, tokenId, amount);
    }

    /**
     * @notice Emit 1155 TransferBatch
     */
    function emitTransferBatch(
        address operator,
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external {
        emit TransferBatch(msg.sender, operator, from, to, ids, amounts);
    }
}

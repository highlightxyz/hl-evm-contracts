// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./IObservability.sol";

/**
 * @title IObservabilityV2
 * @author highlight.xyz
 * @notice Interface to interact with the Highlight observabilityV2 singleton
 * @dev Singleton to coalesce select Highlight protocol events
 */
interface IObservabilityV2 is IObservability {
    /**************************
        Deployment events
    **************************/

    /**
     * @notice Emitted when Editions1155 contract is deployed
     * @param deployer Contract deployer
     * @param contractAddress Address of contract that was deployed
     */
    event Editions1155Deployed(address indexed deployer, address indexed contractAddress);

    /**************************
        ERC1155 events
    **************************/

    /**
     * @notice Emitted when an amount `value` of `tokenId` token is transferred from `from` to `to` on contractAddress
     * @param contractAddress NFT contract token resides on
     * @param operator Transaction executor
     * @param from Token sender
     * @param to Token receiver
     * @param id ID of token being sent
     * @param value Amount of token ssent
     */
    event TransferSingle(
        address indexed contractAddress,
        address operator,
        address indexed from,
        address indexed to,
        uint256 id,
        uint256 value
    );

    /**
     * @notice Emitted when amount `values` of `tokenId` token is transferred from `from` to `to` on contractAddress
     * @param contractAddress NFT contract token resides on
     * @param operator Transaction executor
     * @param from Token sender
     * @param to Token receiver
     * @param ids Token ids being sent
     * @param values Amounts of tokens sent
     */
    event TransferBatch(
        address indexed contractAddress,
        address operator,
        address indexed from,
        address indexed to,
        uint256[] ids,
        uint256[] values
    );

    /**
     * @notice Emit Editions1155Deployed
     */
    function emitEditions1155Deployed(address contractAddress) external;

    /**
     * @notice Emit 1155 TransferSingle
     */
    function emitTransferSingle(address operator, address from, address to, uint256 tokenId, uint256 amount) external;

    /**
     * @notice Emit 1155 TransferBatch
     */
    function emitTransferBatch(
        address operator,
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts
    ) external;
}

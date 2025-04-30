// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./IMechanicData.sol";

/**
 * @notice Process seed in seed based mint
 */
interface ISeedProcessor {
    function processSeed(
        bytes32 mechanicVectorId,
        address nftContract,
        address mintRecipient,
        uint32 numMinted,
        address minter,
        address payable paymentRecipient,
        bytes calldata mintData
    ) external payable;
}

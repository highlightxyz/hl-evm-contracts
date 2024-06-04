// SPDX-License-Identifier: GPL-3.0

/// @title IDescriptor interface

pragma solidity 0.8.10;
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV2V3Interface.sol";

interface IFiniOracle {
    function findRoundId(
        uint256 targetTimestamp,
        AggregatorV2V3Interface feed,
        uint80 roundId,
        uint16 counter,
        uint16 jumpSize,
        bool jumpDirection
    ) external view returns (uint80);
}

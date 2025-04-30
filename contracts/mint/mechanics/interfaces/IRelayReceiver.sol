// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

interface IRelayReceiver {
    function forward(bytes calldata data) external payable;
}

//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../BitRotGenerative.sol";

contract BitRotGenerativeTest {
    BitRotGenerative public bitRot;

    constructor(address bitRotAddress) {
        bitRot = BitRotGenerative(bitRotAddress);
    }

    /**
     * @dev This contract needs to be a valid minter on BitRotGenerative
     */
    function test() external {
        // updating renderer should fail, only owner can do it
        bool updateFailed = false;
        try bitRot.updateRenderer(address(0)) {} catch {
            updateFailed = true;
        }
        if (!updateFailed) {
            revert("Updating renderer worked");
        }

        // test seed details recording
        _getSeedDetailsShouldFail(1);

        bitRot.mintAmountToOneRecipient(msg.sender, 2);
        _validateTokenRange(1, 2);

        bitRot.mintOneToOneRecipient(msg.sender);
        _validateTokenRange(3, 1);
        _validateTokenRange(1, 3);
        _getSeedDetailsShouldFail(4);

        bitRot.mintAmountToOneRecipient(msg.sender, 12);
        _validateTokenRange(4, 12);
        _validateTokenRange(1, 15);
        _getSeedDetailsShouldFail(16);

        bitRot.mintAmountToOneRecipient(msg.sender, 4);
        _validateTokenRange(16, 4);
        _validateTokenRange(1, 19);
        _getSeedDetailsShouldFail(20);

        bitRot.mintOneToOneRecipient(msg.sender);
        _validateTokenRange(20, 1);
        _validateTokenRange(1, 20);
        _getSeedDetailsShouldFail(21);
    }

    function _validateTokenRange(uint256 start, uint256 num) private {
        for (uint256 i = start; i < start + num; i++) {
            BitRotGenerative.SeedDetails memory seedDetails = bitRot.getSeedDetails(i);
            if (
                seedDetails.previousBlockHash != blockhash(block.number - 1) ||
                seedDetails.blockTimestamp != block.timestamp
            ) {
                revert("Failed seed recording");
            }
        }
    }

    function _getSeedDetailsShouldFail(uint256 tokenId) private {
        bool getSeedFailed = false;
        try bitRot.getSeedDetails(tokenId) {} catch {
            getSeedFailed = true;
        }
        if (!getSeedFailed) {
            revert("Getting seed failed");
        }
    }
}

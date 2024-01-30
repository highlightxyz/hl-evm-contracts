//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../YungWkndGenerative.sol";

contract YungWkndGenerativeTest {
    YungWkndGenerative public yungWknd;

    constructor(address yungWkndAddress) {
        yungWknd = YungWkndGenerative(yungWkndAddress);
    }

    /**
     * @dev This contract needs to be a valid minter on YungWkndGenerative
     */
    function test() external {
        // updating renderer should fail, only owner can do it
        bool updateFailed = false;
        try yungWknd.updateRenderer(address(0)) {} catch {
            updateFailed = true;
        }
        if (!updateFailed) {
            revert("Updating renderer worked");
        }

        // test seed details recording
        _getSeedDetailsShouldFail(1);

        yungWknd.mintOneToOneRecipient(msg.sender);
        _validateTokenRange(3, 1);
        _validateTokenRange(1, 3);
        _getSeedDetailsShouldFail(4);

        yungWknd.mintOneToOneRecipient(msg.sender);
        _validateTokenRange(20, 1);
        _validateTokenRange(1, 20);
        _getSeedDetailsShouldFail(21);
    }

    function _validateTokenRange(uint256 start, uint256 num) private {
        for (uint256 i = start; i < start + num; i++) {
            YungWkndGenerative.SeedDetails memory seedDetails = yungWknd.getSeedDetails(i);
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
        try yungWknd.getSeedDetails(tokenId) {} catch {
            getSeedFailed = true;
        }
        if (!getSeedFailed) {
            revert("Getting seed failed");
        }
    }
}

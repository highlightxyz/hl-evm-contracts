// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../DiscreteDutchAuctionMechanic.sol";

/**
 * @author highlight.xyz
 * @dev Mock DiscreteDutchAuctionMechanic
 */
contract TestDiscreteDutchAuctionMechanic is DiscreteDutchAuctionMechanic {
    /**
     * @dev Test function to test upgrades
     */
    function test() external pure returns (bool) {
        return true;
    }
}

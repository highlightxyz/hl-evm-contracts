// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

interface IERC1155Standard {
    /**
     * @notice Return Highlight contract standard hash
     */
    function highlightContractStandardHash() external view returns (bytes32);
}

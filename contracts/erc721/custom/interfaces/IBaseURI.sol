//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

/**
 * @notice Interface for gen series base uri
 */
interface IBaseURI {
    /**
     * @notice Return base uri
     */
    function baseURI() external view returns (string memory);
}

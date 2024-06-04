//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

interface IHLFS {
    /**
     * @notice Return registered file names
     */
    function files() external view returns (string[] memory);

    /**
     * @notice Return storage bytecode addresses for a file
     */
    function fileStorage(string calldata fileName) external view returns (address[] memory);

    /**
     * @notice Return file contents
     */
    function fileContents(string calldata fileName) external view returns (string memory);
}

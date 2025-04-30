// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IJsonUtil {
    /// @dev Retrieves the value at the specified path in the JSON blob.
    function get(string memory _jsonBlob, string memory _path) external pure returns (string memory);

    /// @dev Retrieves the raw value at the specified path in the JSON blob.
    function getRaw(string memory _jsonBlob, string memory _path) external pure returns (string memory);

    /// @dev Retrieves the `int256` value at the specified path in the JSON blob.
    function getInt(string memory _jsonBlob, string memory _path) external pure returns (int256);

    /// @dev Retrieves the `uint256` value at the specified path in the JSON blob.
    function getUint(string memory _jsonBlob, string memory _path) external pure returns (uint256);

    /// @dev Retrieves the `bool` value at the specified path in the JSON blob.
    function getBool(string memory _jsonBlob, string memory _path) external pure returns (bool);

    /// @dev Converts the JSON blob into a base64 encoded data URI.
    function dataURI(string memory _jsonBlob) external pure returns (string memory);

    /// @dev Checks if a value exists at the specified path in the JSON blob.
    function exists(string memory _jsonBlob, string memory _path) external pure returns (bool);

    /// @dev Validates the JSON blob.
    function validate(string memory _jsonBlob) external pure returns (bool);

    /// @dev Compacts the JSON blob.
    function compact(string memory _jsonBlob) external pure returns (string memory);

    /// @dev Sets the value at the specified path in the JSON blob.
    function set(
        string memory _jsonBlob,
        string memory _path,
        string memory _value
    ) external pure returns (string memory);

    /// @dev Sets the values at the specified paths in the JSON blob.
    function set(
        string memory _jsonBlob,
        string[] memory _paths,
        string[] memory _values
    ) external pure returns (string memory);

    /// @dev Sets the raw value at the specified path in the JSON blob.
    function setRaw(
        string memory _jsonBlob,
        string memory _path,
        string memory _rawBlob
    ) external pure returns (string memory);

    /// @dev Sets the raw values at the specified paths in the JSON blob.
    function setRaw(
        string memory _jsonBlob,
        string[] memory _paths,
        string[] memory _rawBlobs
    ) external pure returns (string memory);

    /// @dev Sets the `int256` value at the specified path in the JSON blob.
    function setInt(string memory _jsonBlob, string memory _path, int256 _value) external pure returns (string memory);

    /// @dev Sets the `int256` values at the specified paths in the JSON blob.
    function setInt(
        string memory _jsonBlob,
        string[] memory _paths,
        int256[] memory _values
    ) external pure returns (string memory);

    /// @dev Sets the `uint256` value at the specified path in the JSON blob.
    function setUint(
        string memory _jsonBlob,
        string memory _path,
        uint256 _value
    ) external pure returns (string memory);

    /// @dev Sets the `uint256` values at the specified paths in the JSON blob.
    function setUint(
        string memory _jsonBlob,
        string[] memory _paths,
        uint256[] memory _values
    ) external pure returns (string memory);

    /// @dev Sets the `bool` value at the specified path in the JSON blob.
    function setBool(string memory _jsonBlob, string memory _path, bool _value) external pure returns (string memory);

    /// @dev Sets the `bool` values at the specified paths in the JSON blob.
    function setBool(
        string memory _jsonBlob,
        string[] memory _paths,
        bool[] memory _values
    ) external pure returns (string memory);

    function subReplace(
        string memory _jsonBlob,
        string memory _searchPath,
        string memory _replacePath,
        string memory _value
    ) external pure returns (string memory);

    function subReplace(
        string memory _jsonBlob,
        string memory _searchPath,
        string[] memory _replacePaths,
        string[] memory _values
    ) external pure returns (string memory);

    function subReplaceInt(
        string memory _jsonBlob,
        string memory _searchPath,
        string memory _replacePath,
        int256 _value
    ) external pure returns (string memory);

    function subReplaceInt(
        string memory _jsonBlob,
        string memory _searchPath,
        string[] memory _replacePaths,
        int256[] memory _values
    ) external pure returns (string memory);

    function subReplaceUint(
        string memory _jsonBlob,
        string memory _searchPath,
        string memory _replacePath,
        uint256 _value
    ) external pure returns (string memory);

    function subReplaceUint(
        string memory _jsonBlob,
        string memory _searchPath,
        string[] memory _replacePaths,
        uint256[] memory _values
    ) external pure returns (string memory);

    function subReplaceBool(
        string memory _jsonBlob,
        string memory _searchPath,
        string memory _replacePath,
        bool _value
    ) external pure returns (string memory);

    function subReplaceBool(
        string memory _jsonBlob,
        string memory _searchPath,
        string[] memory _replacePaths,
        bool[] memory _values
    ) external pure returns (string memory);

    /// @dev Removes the value at the specified path in the JSON blob.
    function remove(string memory _jsonBlob, string memory _path) external pure returns (string memory);
}

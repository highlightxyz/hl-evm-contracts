// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface ITokenUriResolver {
    function tierTokenUri(uint8 tier) external view returns (string memory);

    function defaultTokenUri() external view returns (string memory);
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@manifoldxyz/creator-core-solidity/contracts/ERC1155Creator.sol";

contract Manifold1155CreatorMock is ERC1155Creator {
    constructor() ERC1155Creator("MyContract", "MC") {}

    function contractType() external view returns (string memory) {
        return "Manifold1155CreatorMock";
    }
}

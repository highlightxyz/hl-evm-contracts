// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@manifoldxyz/creator-core-solidity/contracts/ERC1155Creator.sol";

contract Zora1155CreatorMock is ERC1155Creator {
    constructor() ERC1155Creator("MyContract", "MC") {}

    function contractType() external view returns (string memory) {
        return "Zora1155CreatorMock";
    }

    function burnBatch(address from, uint256[] calldata tokenIds, uint256[] calldata amounts) external {
        if (from != msg.sender && !isApprovedForAll(from, msg.sender)) {
            revert("Not approved");
        }

        _burnBatch(from, tokenIds, amounts);
    }
}

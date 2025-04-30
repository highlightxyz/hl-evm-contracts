// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../utils/Ownable.sol";
import "./InterfaceSupportTokenManager.sol";
import "./interfaces/IPostTransfer.sol";

/**
 * @notice f bots
 */
contract MoolitiaFrozenTokenManager is ITokenManager, IPostTransfer, InterfaceSupportTokenManager {
    mapping(uint256 => bool) public frozen;

    address constant moolitia = 0x981f578baBFbC70989207d7EbF0EFce084b854cd;

    constructor() {
        frozen[4796] = true;
        frozen[4795] = true;
        frozen[4794] = true;
        frozen[4790] = true;
        frozen[4788] = true;
        frozen[4780] = true;
        frozen[4779] = true;
        frozen[4778] = true;
        frozen[4777] = true;
        frozen[4776] = true;
        frozen[4774] = true;
        frozen[4772] = true;
        frozen[4771] = true;
        frozen[4769] = true;
        frozen[4768] = true;
        frozen[4766] = true;
        frozen[4765] = true;
        frozen[4761] = true;
        frozen[4758] = true;
        frozen[4757] = true;
        frozen[4756] = true;
        frozen[4754] = true;
        frozen[4751] = true;
        frozen[4747] = true;
        frozen[4731] = true;
        frozen[4729] = true;
        frozen[4728] = true;
        frozen[4726] = true;
        frozen[4725] = true;
        frozen[4723] = true;
        frozen[4720] = true;
    }

    function setFrozen(uint256[] calldata ids, bool isFrozen) external {
        if (Ownable(moolitia).owner() != msg.sender) {
            revert("Not owner");
        }
        for (uint256 i = 0; i < ids.length; i++) {
            frozen[ids[i]] = isFrozen;
        }
    }

    /**
     * @notice See {ITokenManager-canUpdateMetadata}
     */
    function canUpdateMetadata(
        address sender,
        uint256 /* id */,
        bytes calldata /* newTokenUri */
    ) external view override returns (bool) {
        return Ownable(msg.sender).owner() == sender;
    }

    /**
     * @notice See {ITokenManager-canSwap}
     */
    function canSwap(
        address sender,
        uint256 /* id */,
        address /* newTokenManager */
    ) external view override returns (bool) {
        return Ownable(msg.sender).owner() == sender;
    }

    /**
     * @notice See {ITokenManager-canRemoveItself}
     */
    function canRemoveItself(address sender, uint256 /* id */) external view override returns (bool) {
        return Ownable(msg.sender).owner() == sender;
    }

    /**
     * @notice See {IPostTransfer-postSafeTransferFrom}
     */
    function postSafeTransferFrom(
        address /* operator */,
        address /* from */,
        address /* to */,
        uint256 id,
        bytes memory /* data */
    ) external view override {
        if (frozen[id]) {
            revert("Transfers disallowed");
        }
    }

    /**
     * @notice See {IPostTransfer-postTransferFrom}
     */
    function postTransferFrom(
        address /* operator */,
        address /* from */,
        address /* to */,
        uint256 id
    ) external view override {
        if (frozen[id]) {
            revert("Transfers disallowed");
        }
    }

    /**
     * @notice See {IERC165-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(InterfaceSupportTokenManager) returns (bool) {
        return
            interfaceId == type(IPostTransfer).interfaceId ||
            InterfaceSupportTokenManager.supportsInterface(interfaceId);
    }
}

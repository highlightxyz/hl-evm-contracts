// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../utils/Ownable.sol";
import "./InterfaceSupportTokenManager.sol";
import "./interfaces/IPostTransfer.sol";
import "./interfaces/IFarcaster.sol";

/**
 * @author highlight.xyz
 * @notice A basic token manager that prevents transfers to addresses without a Farcaster ID
 */
contract FarcasterBoundTokenManager is ITokenManager, IPostTransfer, InterfaceSupportTokenManager {
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
        address to,
        uint256 /* id */,
        bytes memory /* data */
    ) external view override {
        if (IFarcaster(0x00000000Fc6c5F01Fc30151999387Bb99A9f489b).idOf(to) == 0) {
            revert("Can only transfer to a Farcaster user");
        }
    }

    /**
     * @notice See {IPostTransfer-postTransferFrom}
     */
    function postTransferFrom(
        address /* operator */,
        address /* from */,
        address to,
        uint256 /* id */
    ) external view override {
        if (IFarcaster(0x00000000Fc6c5F01Fc30151999387Bb99A9f489b).idOf(to) == 0) {
            revert("Can only transfer to a Farcaster user");
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

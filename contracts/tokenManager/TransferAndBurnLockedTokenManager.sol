// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../utils/Ownable.sol";
import "./InterfaceSupportTokenManager.sol";
import "./interfaces/IPostTransfer.sol";
import "./interfaces/IPostBurn.sol";

/**
 * @author highlight.xyz
 * @notice A basic token manager / sample implementation that locks burns / transfers
 */
contract TransferAndBurnLockedTokenManager is ITokenManager, IPostTransfer, IPostBurn, InterfaceSupportTokenManager {
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
        uint256 /* id */,
        bytes memory /* data */
    ) external pure override {
        revert("Transfers disallowed");
    }

    /**
     * @notice See {IPostTransfer-postTransferFrom}
     */
    function postTransferFrom(
        address /* operator */,
        address /* from */,
        address /* to */,
        uint256 /* id */
    ) external pure override {
        revert("Transfers disallowed");
    }

    /**
     * @notice See {IPostBurn-postBurn}
     */
    function postBurn(address /* operator */, address /* sender */, uint256 /* id */) external pure override {
        revert("Burns disallowed");
    }

    /**
     * @notice See {IPostBurn-postBurnAmount}
     */
    function postBurnAmount(address /* operator */, address /* sender */, uint256 /* id */, uint256 /* amount */) external pure override {
        revert("Burns disallowed");
    }

    /**
     * @notice See {IERC165-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(InterfaceSupportTokenManager) returns (bool) {
        return
            interfaceId == type(IPostTransfer).interfaceId ||
            interfaceId == type(IPostBurn).interfaceId ||
            InterfaceSupportTokenManager.supportsInterface(interfaceId);
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../utils/Ownable.sol";
import "./InterfaceSupportEditionsTokenManager.sol";
import "./interfaces/IPostTransfer.sol";
import "./interfaces/IPostBurn.sol";
import "../metadata/interfaces/IEditionsMetadataRenderer.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";

/**
 * @author highlight.xyz
 * @notice A token manager that manages updating a checkerboard game
 */
contract CheckerboardTokenManager is ITokenManagerEditions, IPostBurn, InterfaceSupportEditionsTokenManager, Ownable {
    /**
     * @notice The current move that the checkerboard can be updated to
     */
    string public currentAllowedMoveImageUri;

    /**
     * @notice The EditionsMetadataRenderer
     */
    address public editionsMetadataRenderer;

    /**
     * @notice Emitted when allowed move is updated
     * @param allowedMove New allowed move image url
     */
    event SetAllowedMove(string allowedMove);

    constructor(
        address platform,
        address _editionsMetadataRenderer,
        string memory firstAllowedMoveImageUrl
    ) Ownable() {
        _transferOwnership(platform);
        editionsMetadataRenderer = _editionsMetadataRenderer;
        currentAllowedMoveImageUri = firstAllowedMoveImageUrl;
    }

    /**
     * @notice Set the current allowed move
     */
    function setAllowedMoveForTheDay(string calldata newMoveImageUri) external onlyOwner {
        currentAllowedMoveImageUri = newMoveImageUri;

        emit SetAllowedMove(newMoveImageUri);
    }

    /**
     * @notice See {ITokenManager-canUpdateMetadata}
     */
    function canUpdateMetadata(
        address, /* sender */
        uint256, /* id */
        bytes calldata /* newTokenImageUri */
    ) external view override returns (bool) {
        return false;
    }

    /**
     * @notice See {ITokenManagerEditions-canUpdateEditionsMetadata}
     */
    function canUpdateEditionsMetadata(
        address editionsAddress,
        address sender,
        uint256, /* editionId */
        bytes calldata newTokenImageUri,
        FieldUpdated fieldUpdated
    ) external view override returns (bool) {
        return
            // validate that updater is authorized (checkerboard nft holder or owner)
            (IERC721Upgradeable(editionsAddress).balanceOf(sender) > 0 || Ownable(editionsAddress).owner() == sender) &&
            // validate that image is being changed to allowed one
            _equal(currentAllowedMoveImageUri, newTokenImageUri) &&
            fieldUpdated == FieldUpdated.imageUrl; // validate that image was the metadata field that was changed
    }

    /**
     * @notice See {ITokenManager-canSwap}
     */
    function canSwap(
        address sender,
        uint256, /* id */
        address /* newTokenManager */
    ) external view override returns (bool) {
        return Ownable(msg.sender).owner() == sender;
    }

    /**
     * @notice See {ITokenManager-canRemoveItself}
     */
    function canRemoveItself(
        address sender,
        uint256 /* id */
    ) external view override returns (bool) {
        return Ownable(msg.sender).owner() == sender;
    }

    /* solhint-disable no-empty-blocks */
    /**
     * @notice See {IPostBurn-postBurn}
     */
    function postBurn(
        address, /* operator */
        address, /* sender */
        uint256 /* id */
    ) external pure override {}

    /* solhint-enable no-empty-blocks */

    /**
     * @notice See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(InterfaceSupportEditionsTokenManager)
        returns (bool)
    {
        return
            interfaceId == type(IPostBurn).interfaceId ||
            InterfaceSupportEditionsTokenManager.supportsInterface(interfaceId);
    }

    /**
     * @dev Returns true if a string is equal to a bytes
     */
    function _equal(string memory s, bytes calldata b) private pure returns (bool) {
        return keccak256(bytes(s)) == keccak256(b);
    }
}

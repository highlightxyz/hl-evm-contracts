// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./IGengineObservability.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title Observability
 * @author highlight.xyz
 * @notice Highlight Observability
 * @dev Singleton to coalesce select Highlight protocol events
 */
contract GengineObservability is IGengineObservability, UUPSUpgradeable, OwnableUpgradeable {
    /**
     * @notice Initialize implementation with initial owner
     * @param _owner Initial owner
     */
    function initialize(address _owner) external initializer {
        __Ownable_init();
        _transferOwnership(_owner);
    }

    /**
     * @notice See {IGengineObservability-emitContractMetadataSet}
     */
    function emitContractMetadataSet(
        string calldata name,
        string calldata symbol,
        string calldata contractURI
    ) external {
        emit ContractMetadataSet(msg.sender, name, symbol, contractURI);
    }

    /**
     * @notice See {IGengineObservability-emitLimitSupplySet}
     */
    function emitLimitSupplySet(uint256 newLimitSupply) external {
        emit LimitSupplySet(msg.sender, newLimitSupply);
    }

    /**
     * @notice See {IGengineObservability-emitBaseUriSet}
     */
    function emitBaseUriSet(string calldata newBaseUri) external {
        emit BaseUriSet(msg.sender, newBaseUri);
    }

    /**
     * @notice See {IGengineObservability-emitGenerativeSeriesDeployed}
     */
    function emitGenerativeSeriesDeployed(address contractAddress) external {
        emit GenerativeSeriesDeployed(msg.sender, contractAddress);
    }

    /**
     * @notice See {IGengineObservability-emitSeriesDeployed}
     */
    function emitSeriesDeployed(address contractAddress) external {
        emit SeriesDeployed(msg.sender, contractAddress);
    }

    /**
     * @notice See {IGengineObservability-emitTokenMint}
     */
    function emitTokenMint(address to, uint256 numMinted) external {
        emit TokenMint(msg.sender, to, numMinted);
    }

    /**
     * @notice See {IGengineObservability-emitTokenUpdated}
     */
    function emitTokenUpdated(address contractAddress, uint256 tokenId) external {
        emit TokenUpdated(msg.sender, tokenId);
    }

    /**
     * @notice See {IGengineObservability-emitTransfer}
     */
    function emitTransfer(address from, address to, uint256 tokenId) external {
        emit Transfer(msg.sender, from, to, tokenId);
    }

    /**
     * @notice See {IGengineObservability-emitCustomMintData}
     */
    function emitCustomMintData(address contractAddress, bytes calldata data) external {
        emit CustomMintData(msg.sender, contractAddress, data);
    }

    /**
     * @notice See {IGengineObservability-emitHighlightRegenerate}
     */
    function emitHighlightRegenerate(address collection, uint256 tokenId) external {
        emit HighlightRegenerate(msg.sender, collection, tokenId);
    }

    /* solhint-disable no-empty-blocks */
    /**
     * @notice Limit upgrades of contract to owner
     * @param // New implementation
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}
}

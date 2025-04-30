//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../../../mint/mechanics/interfaces/ISeedProcessor.sol";
import "../../../utils/ERC721/IERC721.sol";
import "../../../erc721/interfaces/IERC721GeneralSupplyMetadata.sol";

import { UUPSUpgradeable } from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/**
 * @title Manage seeds for Bitframes by Matt DesLauriers
 */
contract BitframesSeedManager is ISeedProcessor, UUPSUpgradeable, OwnableUpgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /**
     * @notice Map contract to encoding version
     */
    mapping(address => bytes1) public encodingVersions;

    /**
     * @notice Seed based mint mechanic
     */
    address public seedBasedMechanic;

    /**
     * @notice Map contract to minimum price
     */
    mapping(address => uint256) public minimumPrice;

    /**
     * @notice Map contract to allowed minters
     */
    mapping(address => EnumerableSet.AddressSet) private _allowedMinters;

    /**
     * @notice Map contract to if mint is gated
     */
    mapping(address => bool) private _gated;

    /**
     * @notice Emitted for Gengine to ingest and inject collector-curated seed
     */
    event CustomMintData(address indexed sender, address indexed contractAddress, bytes data);

    /**
     * @notice Unified event for every event that updates a seed for a token
     */
    event SeedUpdate(
        address indexed nftContract,
        address indexed invoker, // minter / owner
        uint256 indexed tokenId,
        bytes32 newSeed,
        bool isMint,
        address mintRecipient,
        uint32 numMinted,
        uint256 paymentAmount
    );

    /**
     * @notice Emitted to trigger Gengine re-capture
     */
    event SeedRefresh(address indexed contractAddress, bytes32 indexed newSeed, uint256 indexed tokenId, address owner);

    /**
     * @notice Revert if caller isn't seed based mechanic
     */
    modifier onlySeedBasedMechanic() {
        if (msg.sender != seedBasedMechanic) {
            revert("Not seed based mechanic");
        }
        _;
    }

    /**
     * @notice Initialize Bistream seed manager
     */
    function initialize(address initialOwner, address _initialSeedBasedMechanic) external initializer {
        __Ownable_init();
        _transferOwnership(initialOwner);
        seedBasedMechanic = _initialSeedBasedMechanic;
    }

    /**
     * @notice Set the allowed seed based mint mechanic
     */
    function setSeedBasedMechanic(address newSeedBasedMechanic) external onlyOwner {
        seedBasedMechanic = newSeedBasedMechanic;
    }

    /**
     * @notice Add an allowed minter for a contract
     */
    function addMinter(address nftContract, address minter) external onlyOwner {
        _allowedMinters[nftContract].add(minter);
    }

    /**
     * @notice Remove an allowed minter for a contract
     */
    function removeMinter(address nftContract, address minter) external onlyOwner {
        _allowedMinters[nftContract].remove(minter);
    }

    /**
     * @notice Toggle if a contract is gated
     */
    function setContractGatedStatus(address nftContract, bool gated) external onlyOwner {
        _gated[nftContract] = gated;
    }

    /**
     * @notice Set the encoding version for an nft contract
     */
    function setEncodingVersion(address nftContract, bytes1 encodingVersion) external onlyOwner {
        encodingVersions[nftContract] = encodingVersion;
    }

    /**
     * @notice Set the minimum price for an nft contract mint
     */
    function setMinimumPrice(address nftContract, uint256 _minimumPrice) external onlyOwner {
        minimumPrice[nftContract] = _minimumPrice;
    }

    /**
     * @notice Remove the encoding version for an nft contract
     */
    function removeEncodingVersion(address nftContract) external onlyOwner {
        delete encodingVersions[nftContract];
    }

    /**
     * @notice Process seed, see {ISeedProcessor-processSeed}
     */
    function processSeed(
        bytes32 mechanicVectorId,
        address nftContract,
        address mintRecipient,
        uint32 numMinted,
        address minter,
        address payable paymentRecipient,
        bytes calldata mintData
    ) external payable onlySeedBasedMechanic {
        bytes1 encoding = encodingVersions[nftContract];
        bytes memory encodedData = replaceFirstByte(mintData, encoding);
        bytes32 seed = castMintDataToSeed(encodedData);

        if (_gated[nftContract] && !_allowedMinters[nftContract].contains(minter)) {
            revert("Minter not allowed");
        }

        if (msg.value < minimumPrice[nftContract]) {
            revert("Lower than minimum");
        }
        if (numMinted != 1) {
            revert("Invalid mint amount");
        }
        (bool sentToRecipient, ) = paymentRecipient.call{ value: msg.value }("");
        if (!sentToRecipient) {
            revert("Ether send failed");
        }

        emit CustomMintData(msg.sender, nftContract, encodedData);
        emit SeedUpdate(
            nftContract,
            minter,
            _predictTokenId(nftContract),
            seed,
            true,
            mintRecipient,
            numMinted,
            msg.value
        );

        if (encoding != 0x00 && encoding != 0x01) {
            revert("Cannot process logic for this encoding");
        }
    }

    /**
     * @notice Let a token owner refresh a seed
     */
    function refreshSeed(address nftContract, uint256 tokenId, bytes32 newSeed) external {
        address tokenOwner = IERC721(nftContract).ownerOf(tokenId);
        if (tokenOwner != msg.sender) {
            revert("Not token owner");
        }

        bytes1 encoding = encodingVersions[nftContract];
        bytes memory encodedData = replaceFirstByte(abi.encodePacked(newSeed), encoding);
        bytes32 seed = castMintDataToSeed(encodedData);
        if (encoding == 0x01) {
            emit SeedUpdate(nftContract, tokenOwner, tokenId, seed, false, address(0), 0, 0);
            emit SeedRefresh(nftContract, seed, tokenId, tokenOwner);
            emit CustomMintData(msg.sender, nftContract, encodedData);
        } else {
            revert("Cannot process logic for nft contract with this encoding");
        }
    }

    /**
     * @notice Replace first byte of seed
     */
    function replaceFirstByte(bytes memory seed, bytes1 encodingVersion) public pure returns (bytes memory) {
        seed[0] = encodingVersion;
        return seed;
    }

    /**
     * @notice Cast mint data to a seed
     */
    function castMintDataToSeed(bytes memory mintData) public pure returns (bytes32 result) {
        require(mintData.length >= 32, "Invalid mint data");
        assembly {
            result := mload(add(mintData, 32))
        }
    }

    /* solhint-disable no-empty-blocks */
    /**
     * @notice Limit upgrades of contract to EditionsMetadataRenderer owner
     * @param // New implementation
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}

    function _predictTokenId(address nftContract) private view returns (uint256) {
        return IERC721GeneralSupplyMetadata(nftContract).totalSupply() + 1;
    }
}

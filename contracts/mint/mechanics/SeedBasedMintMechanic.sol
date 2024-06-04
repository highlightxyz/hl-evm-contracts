// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./MechanicMintManagerClientUpgradeable.sol";
import "../../erc721/interfaces/IEditionCollection.sol";
import "../../erc721/interfaces/IERC721GeneralSupplyMetadata.sol";
import "../../observability/IGengineObservability.sol";
import "./interfaces/IManifold1155Burn.sol";

import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/**
 * @notice Highlight's bespoke Seed based mint mechanic
 * @author highlight.xyz
 */
contract SeedBasedMintMechanic is MechanicMintManagerClientUpgradeable, UUPSUpgradeable {
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /**
     * @notice Throw when an action is unauthorized
     */
    error Unauthorized();

    /**
     * @notice Throw when it is invalid to mint on a vector
     */
    error InvalidMint();

    /**
     * @notice Throw when a vector is already created with a mechanic vector ID
     */
    error VectorAlreadyCreated();

    /**
     * @notice Throw when the seed has already been used
     */
    error SeedAlreadyUsed();

    /**
     * @notice Throw when the transaction sender has sent an invalid payment amount during a mint
     */
    error InvalidPaymentAmount();

    /**
     * @notice Throw when an internal transfer of ether fails
     */
    error EtherSendFailed();

    /**
     * @notice On-chain mint vector (stored data)
     * @param startTimestamp When minting opens on vector
     * @param endTimestamp When minting ends on vector
     * @param maxUserClaimableViaVector Max number of tokens that can be minted by user via vector
     * @param maxTotalClaimableViaVector Max number of tokens that can be minted via vector
     * @param totalClaimedViaVector Total number of tokens minted via vector
     * @param currency Currency used for payment. Native gas token, if zero address
     * @param tokenLimitPerTx Max number of tokens that can be minted in one transaction
     * @param paymentRecipient Payment recipient
     * @param pricePerToken Price that has to be paid per minted token
     * @param requireDirectEOA Require minters to directly be EOAs
     */
    struct SeedBasedVector {
        uint48 startTimestamp;
        uint48 endTimestamp;
        uint32 maxUserClaimableViaVector;
        uint32 maxTotalClaimableViaVector;
        uint48 currentSupply;
        uint48 tokenLimitPerTx;
        uint192 pricePerToken;
        address payable paymentRecipient;
        bool uniqueSeeds;
    }

    /**
     * @notice Config used to control updating of fields in SeedBasedVector
     */
    struct SeedBasedVectorUpdateConfig {
        bool updateStartTimestamp;
        bool updateEndTimestamp;
        bool updateMaxUserClaimableViaVector;
        bool updateMaxTotalClaimableViaVector;
        bool updateTokenLimitPerTx;
        bool updatePaymentRecipient;
        bool updatePricePerToken;
    }

    /**
     * @notice Config used to control burn / redeem mechanic when 1155 tokens are being burned
     */
    struct BurnRedeem1155Config {
        address burnContract;
        uint88 tokenId;
        uint8 numToBurnPerMint;
    }

    /**
     * @notice IGengineObservability contract
     */
    IGengineObservability public observability;

    /**
     * @notice Stores seed based vector, indexed by global mechanic vector id
     */
    mapping(bytes32 => SeedBasedVector) private vector;

    /**
     * @notice Stores already used seeds per mechanic
     */
    mapping(bytes32 => mapping(bytes32 => uint256)) public seedInfo;

    /**
     * @notice System-wide vector ids to (user to user claims count)
     */
    mapping(bytes32 => mapping(address => uint64)) public userClaims;

    /**
     * @notice System-wide vector ids to burn/redeem configuration
     */
    mapping(bytes32 => BurnRedeem1155Config) private _burnRedeem1155Config;

    /**
     * @notice Emitted when a mint vector is created
     */
    event SeedBasedVectorCreated(bytes32 indexed mechanicVectorId);

    /**
     * @notice Emitted when a mint vector is updated
     */
    event SeedBasedVectorUpdated(bytes32 indexed mechanicVectorId);

    /**
     * @notice Emitted when a number of tokens are minted
     */
    event SeedBasedMint(
        bytes32 indexed mechanicVectorId,
        address indexed recipient,
        uint200 pricePerToken,
        uint48 numMinted
    );

    /**
     * @notice Emitted for the seed based data on mint
     * @param sender contract emitting the event
     * @param contractAddress NFT contract token resides on
     * @param data custom mint data
     */
    event CustomMintData(address indexed sender, address indexed contractAddress, bytes data);

    /**
     * @notice Emitted when payment is made to payment recipient
     * @param paymentRecipient Creator recipient of payment
     * @param mechanicVectorId Mechanic vector ID
     * @param amountToCreator Amount sent to creator
     * @param percentageBPSOfTotal Percentage (in basis points) that was sent to creator, of total payment
     */
    event SeedBasedNativeTokenPayment(
        bytes32 indexed mechanicVectorId,
        address indexed paymentRecipient,
        uint256 amountToCreator,
        uint32 percentageBPSOfTotal
    );

    /**
     * @notice Initialize mechanic contract
     * @param _mintManager Mint manager address
     * @param platform Platform owning the contract
     */
    function initialize(address _mintManager, address platform, address _observability) external initializer {
        __MechanicMintManagerClientUpgradeable_initialize(_mintManager, platform);
        observability = IGengineObservability(_observability);
    }

    /**
     * @notice Create a seed based vector
     * @param mechanicVectorId Global mechanic vector ID
     * @param vectorData Vector data, to be deserialized into seed based vector data
     */
    function createVector(bytes32 mechanicVectorId, bytes memory vectorData) external onlyMintManager {
        // precaution, although MintManager tightly controls creation and prevents double creation
        if (vector[mechanicVectorId].startTimestamp != 0) {
            _revert(VectorAlreadyCreated.selector);
        }
        (
            uint48 startTimestamp,
            uint48 endTimestamp,
            uint32 maxUserClaimableViaVector,
            uint32 maxTotalClaimableViaVector,
            uint48 tokenLimitPerTx,
            uint192 pricePerToken,
            address paymentRecipient,
            bool uniqueSeeds
        ) = abi.decode(vectorData, (uint48, uint48, uint32, uint32, uint48, uint192, address, bool));

        SeedBasedVector memory _vector = SeedBasedVector(
            startTimestamp == 0 ? uint48(block.timestamp) : startTimestamp,
            endTimestamp,
            maxUserClaimableViaVector,
            maxTotalClaimableViaVector,
            0,
            tokenLimitPerTx,
            pricePerToken,
            payable(paymentRecipient),
            uniqueSeeds
        );

        vector[mechanicVectorId] = _vector;

        emit SeedBasedVectorCreated(mechanicVectorId);
    }

    /* solhint-disable code-complexity */
    /**
     * @notice Update a seed based vector
     * @param mechanicVectorId Global mechanic vector ID
     * @param newVector New vector fields
     * @param updateConfig Config denoting what fields on vector to update
     */
    function updateVector(
        bytes32 mechanicVectorId,
        SeedBasedVector calldata newVector,
        SeedBasedVectorUpdateConfig calldata updateConfig
    ) external {
        MechanicVectorMetadata memory metadata = _getMechanicVectorMetadata(mechanicVectorId);
        if (
            OwnableUpgradeable(metadata.contractAddress).owner() != msg.sender && metadata.contractAddress != msg.sender
        ) {
            _revert(Unauthorized.selector);
        }

        // rather than updating entire vector, update per-field
        if (updateConfig.updateStartTimestamp) {
            vector[mechanicVectorId].startTimestamp = newVector.startTimestamp == 0
                ? uint48(block.timestamp)
                : newVector.startTimestamp;
        }
        if (updateConfig.updateEndTimestamp) {
            vector[mechanicVectorId].endTimestamp = newVector.endTimestamp;
        }
        if (updateConfig.updateMaxUserClaimableViaVector) {
            vector[mechanicVectorId].maxUserClaimableViaVector = newVector.maxUserClaimableViaVector;
        }
        if (updateConfig.updateMaxTotalClaimableViaVector) {
            vector[mechanicVectorId].maxTotalClaimableViaVector = newVector.maxTotalClaimableViaVector;
        }
        if (updateConfig.updateTokenLimitPerTx) {
            vector[mechanicVectorId].tokenLimitPerTx = newVector.tokenLimitPerTx;
        }
        if (updateConfig.updatePaymentRecipient) {
            vector[mechanicVectorId].paymentRecipient = newVector.paymentRecipient;
        }
        if (updateConfig.updatePricePerToken) {
            vector[mechanicVectorId].pricePerToken = newVector.pricePerToken;
        }

        emit SeedBasedVectorUpdated(mechanicVectorId);
    }

    /**
     * @notice Set the burn redeem 1155 config for a vector
     * @param mechanicVectorId Global mechanic vector ID
     * @param newConfig New Burn/Redeem 1155 config
     */
    function setBurnRedeem1155Config(bytes32 mechanicVectorId, BurnRedeem1155Config calldata newConfig) external {
        MechanicVectorMetadata memory metadata = _getMechanicVectorMetadata(mechanicVectorId);
        if (
            OwnableUpgradeable(metadata.contractAddress).owner() != msg.sender && metadata.contractAddress != msg.sender
        ) {
            _revert(Unauthorized.selector);
        }

        _burnRedeem1155Config[mechanicVectorId] = newConfig;
    }

    /* solhint-enable code-complexity */

    /**
     * @notice See {IMechanic-processNumMint}
     */
    function processNumMint(
        bytes32 mechanicVectorId,
        address recipient,
        uint32 numToMint,
        address minter,
        MechanicVectorMetadata calldata mechanicVectorMetadata,
        bytes calldata data
    ) external payable onlyMintManager {
        _processMint(mechanicVectorId, recipient, numToMint, data);

        BurnRedeem1155Config memory burnRedeemConfig = _burnRedeem1155Config[mechanicVectorId];
        if (burnRedeemConfig.burnContract != address(0)) {
            _processBurnRedeem(burnRedeemConfig, minter, numToMint);
        }
    }

    /**
     * @notice See {IMechanic-processChooseMint}
     */
    function processChooseMint(
        bytes32 mechanicVectorId,
        address recipient,
        uint256[] calldata tokenIds,
        address minter,
        MechanicVectorMetadata calldata mechanicVectorMetadata,
        bytes calldata data
    ) external payable onlyMintManager {
        // currently we don't support "choose token to mint" functionality for seed based mints
        _revert(InvalidMint.selector);
    }

    /**
     * @notice Get raw vector data
     * @param mechanicVectorId Mechanic vector ID
     */
    function getRawVector(bytes32 mechanicVectorId) external view returns (SeedBasedVector memory _vector) {
        _vector = vector[mechanicVectorId];
    }

    /**
     * @notice Get a vector's full state
     * @param mechanicVectorId Mechanic vector ID
     */
    function getVectorState(
        bytes32 mechanicVectorId
    ) external view returns (SeedBasedVector memory _vector, uint256 collectionSupply, uint256 collectionSize) {
        _vector = vector[mechanicVectorId];
        (collectionSupply, collectionSize) = _collectionSupplyAndSize(mechanicVectorId);
    }

    /**
     * @notice Withdraw native gas token
     */
    function withdrawNativeGasToken(uint256 amountToWithdraw, address payable recipient) external onlyOwner {
        (bool sentToRecipient, bytes memory data) = recipient.call{ value: amountToWithdraw }("");
        if (!sentToRecipient) {
            _revert(EtherSendFailed.selector);
        }
    }

    /* solhint-disable no-empty-blocks */
    /**
     * @notice Limit upgrades of contract to SeedBasedMintMechanic owner
     * @param // New implementation address
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}

    /**
     * @notice Process sequential mint logic
     * @param mechanicVectorId Mechanic vector ID
     * @param recipient Mint recipient
     * @param numToMint Number of tokens to mint
     */
    function _processMint(bytes32 mechanicVectorId, address recipient, uint32 numToMint, bytes calldata data) private {
        MechanicVectorMetadata memory metadata = _getMechanicVectorMetadata(mechanicVectorId);
        if (metadata.contractAddress == address(0)) {
            revert("Vector doesn't exist");
        }
        SeedBasedVector memory _vector = vector[mechanicVectorId];
        uint48 newNumClaimedForUser = uint48(userClaims[mechanicVectorId][recipient]) + numToMint;
        bytes32 seedData = keccak256(data);
        uint256 newSeedCount = seedInfo[mechanicVectorId][seedData] + 1;

        uint48 newSupply = _vector.currentSupply + numToMint;
        if (
            block.timestamp < _vector.startTimestamp ||
            (block.timestamp > _vector.endTimestamp && _vector.endTimestamp != 0) ||
            (_vector.maxTotalClaimableViaVector != 0 && newSupply > _vector.maxTotalClaimableViaVector) ||
            (_vector.maxUserClaimableViaVector != 0 && newNumClaimedForUser > _vector.maxUserClaimableViaVector) ||
            (_vector.tokenLimitPerTx != 0 && numToMint > _vector.tokenLimitPerTx) ||
            numToMint > 1
        ) {
            _revert(InvalidMint.selector);
        }

        if (_vector.uniqueSeeds && newSeedCount != 1) {
            _revert(SeedAlreadyUsed.selector);
        }

        uint200 totalPrice = _vector.pricePerToken * numToMint;
        _processPayment(mechanicVectorId, _vector.paymentRecipient, totalPrice);

        seedInfo[mechanicVectorId][seedData] = newSeedCount;
        vector[mechanicVectorId].currentSupply = newSupply;
        userClaims[mechanicVectorId][recipient] = uint64(newNumClaimedForUser);

        emit SeedBasedMint(mechanicVectorId, recipient, _vector.pricePerToken, numToMint);

        emit CustomMintData(address(this), metadata.contractAddress, data);
    }

    /**
     * @notice Returns a collection's current supply
     * @param mechanicVectorId Mechanic vector ID
     */
    function _collectionSupplyAndSize(bytes32 mechanicVectorId) private view returns (uint256 supply, uint256 size) {
        MechanicVectorMetadata memory metadata = _getMechanicVectorMetadata(mechanicVectorId);
        if (metadata.contractAddress == address(0)) {
            revert("Vector doesn't exist");
        }
        if (metadata.isEditionBased) {
            IEditionCollection.EditionDetails memory edition = IEditionCollection(metadata.contractAddress)
                .getEditionDetails(metadata.editionId);
            supply = edition.supply;
            size = edition.size;
        } else {
            // supply holds a tighter constraint (no burns), some old contracts don't have it
            try IERC721GeneralSupplyMetadata(metadata.contractAddress).supply() returns (uint256 _supply) {
                supply = _supply;
            } catch {
                supply = IERC721GeneralSupplyMetadata(metadata.contractAddress).totalSupply();
            }
            size = IERC721GeneralSupplyMetadata(metadata.contractAddress).limitSupply();
        }
    }

    /**
     * @notice Process payment in native gas token, sending to creator and platform
     * @param mechanicVectorId ID of vector
     * @param recipient Creator recipient of payment
     * @param totalAmount Total amount being paid
     */
    function _processPayment(bytes32 mechanicVectorId, address payable recipient, uint256 totalAmount) private {
        if (totalAmount > msg.value) {
            _revert(InvalidPaymentAmount.selector);
        }
        (bool sentToRecipient, bytes memory dataRecipient) = recipient.call{ value: totalAmount }("");
        if (!sentToRecipient) {
            _revert(EtherSendFailed.selector);
        }
        emit SeedBasedNativeTokenPayment(mechanicVectorId, recipient, totalAmount, 10000);
    }

    /**
     * @notice Process burn / redeem
     * @param burnRedeemConfig Burn / redeem config
     * @param minter Minter burning tokens
     * @param numToMint Number of tokens to mint
     */
    function _processBurnRedeem(
        BurnRedeem1155Config memory burnRedeemConfig,
        address minter,
        uint32 numToMint
    ) private {
        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = uint256(burnRedeemConfig.tokenId);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = uint256(burnRedeemConfig.numToBurnPerMint) * uint256(numToMint);

        IManifold1155Burn(burnRedeemConfig.burnContract).burn(minter, tokenIds, amounts);
    }
}

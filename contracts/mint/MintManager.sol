// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../utils/Ownable.sol";
import "../erc721/interfaces/IERC721GeneralMint.sol";
import "../erc721/interfaces/IERC721EditionMint.sol";
import "../utils/ERC721/IERC721.sol";
import "./interfaces/INativeMetaTransaction.sol";
import "../utils/EIP712Upgradeable.sol";
import "../metatx/ERC2771ContextUpgradeable.sol";
import "./interfaces/IAbridgedMintVector.sol";
import "./interfaces/IMintFeeOracle.sol";
import "./mechanics/interfaces/IMechanicMintManager.sol";
import "./mechanics/interfaces/IMechanic.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title MintManager
 * @author highlight.xyz
 * @notice Faciliates lion's share of minting in Highlight protocol V2 by managing mint "vectors" on-chain and off-chain
 */
contract MintManager is
    EIP712Upgradeable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ERC2771ContextUpgradeable,
    IAbridgedMintVector,
    IMechanicMintManager
{
    using ECDSA for bytes32;
    using EnumerableSet for EnumerableSet.Bytes32Set;
    using EnumerableSet for EnumerableSet.AddressSet;

    /**
     * @notice Throw when sender is unauthorized to complete action
     */
    error Unauthorized();

    /**
     * @notice Throw when the executor being added or removed is invalid
     */
    error InvalidExecutorChanged();

    /**
     * @notice Throw when the action being applied to the vector has been frozen
     */
    error VectorUpdateActionFrozen();

    /**
     * @notice Throw when the totalClaimedViaVector passed in is invalid
     */
    error InvalidTotalClaimed();

    /**
     * @notice Throw when an invalid allowlist proof is used, or a regular mint is attempted on an allowlist vector
     */
    error AllowlistInvalid();

    /**
     * @notice Throw when a native gas token payment is attempted on a payment packet mint
     */
    error CurrencyTypeInvalid();

    /**
     * @notice Throw when the mint fee sent is too low
     */
    error MintFeeTooLow();

    /**
     * @notice Throw when an internal transfer of ether fails
     */
    error EtherSendFailed();

    /**
     * @notice Throw when a transaction signer is not the claimer passed in via a claim
     */
    error SenderNotClaimer();

    /**
     * @notice Throw when a claim is invalid
     */
    error InvalidClaim();

    /**
     * @notice Throw when an invalid amount is sent for a payment (native gas token or erc20)
     */
    error InvalidPaymentAmount();

    /**
     * @notice Throw when an on-chain mint vector's config parameter isn't met
     */
    error OnchainVectorMintGuardFailed();

    /**
     * @notice Throw when a mint is tried on a vector of the
     *         wrong collection type (edition -> series, series -> edition)
     */
    error VectorWrongCollectionType();

    /**
     * @notice Throw when msgSender is not directly an EOA
     */
    error SenderNotDirectEOA();

    /**
     * @notice Throw when a mint recipient on a gated claim is different from the claimer,
     *         and tx sender is not the claimer
     */
    error UnsafeMintRecipient();

    /**
     * @notice Throw when a mint is paused.
     */
    error MintPaused();

    /**
     * @notice Throw when an entity is already registered with a given ID
     */
    error AlreadyRegisteredWithId();

    /**
     * @notice Throw when a mechanic is invalid
     */
    error InvalidMechanic();

    /**
     * @notice Throw when a mechanic is paused
     */
    error MechanicPaused();

    /**
     * @notice On-chain mint vector
     * @param contractAddress NFT smart contract address
     * @param currency Currency used for payment. Native gas token, if zero address
     * @param paymentRecipient Payment recipient
     * @param startTimestamp When minting opens on vector
     * @param endTimestamp When minting ends on vector
     * @param pricePerToken Price that has to be paid per minted token
     * @param tokenLimitPerTx Max number of tokens that can be minted in one transaction
     * @param maxTotalClaimableViaVector Max number of tokens that can be minted via vector
     * @param maxUserClaimableViaVector Max number of tokens that can be minted by user via vector
     * @param totalClaimedViaVector Total number of tokens minted via vector
     * @param allowlistRoot Root of merkle tree with allowlist
     * @param paused If vector is paused
     */
    struct Vector {
        address contractAddress;
        address currency;
        address payable paymentRecipient;
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 pricePerToken;
        uint64 tokenLimitPerTx;
        uint64 maxTotalClaimableViaVector;
        uint64 maxUserClaimableViaVector;
        uint64 totalClaimedViaVector;
        bytes32 allowlistRoot;
        uint8 paused;
    }

    /**
     * @notice On-chain mint vector mutability rules
     * @param updatesFrozen If true, vector cannot be updated
     * @param deleteFrozen If true, vector cannot be deleted
     * @param pausesFrozen If true, vector cannot be paused
     */
    struct VectorMutability {
        uint8 updatesFrozen;
        uint8 deleteFrozen;
        uint8 pausesFrozen;
    }

    /**
     * @notice Packet enabling impersonation of purchaser for currencies supporting meta-transactions
     * @param functionSignature Function to call on contract, with arguments encoded
     * @param sigR Elliptic curve signature component
     * @param sigS Elliptic curve signature component
     * @param sigV Elliptic curve signature component
     */
    struct PurchaserMetaTxPacket {
        bytes functionSignature;
        bytes32 sigR;
        bytes32 sigS;
        uint8 sigV;
    }

    /**
     * @notice Claim that is signed off-chain with EIP-712, and unwrapped to facilitate fulfillment of mint
     * @param currency Currency used for payment. Native gas token, if zero address
     * @param contractAddress NFT smart contract address
     * @param claimer Account able to use this claim
     * @param paymentRecipient Payment recipient
     * @param pricePerToken Price that has to be paid per minted token
     * @param numTokensToMint Number of NFTs to mint in this transaction
     * @param maxClaimableViaVector Max number of tokens that can be minted via vector
     * @param maxClaimablePerUser Max number of tokens that can be minted by user via vector
     * @param editionId ID of edition to mint on. Unused if claim is passed into ERC721General minting function
     * @param claimExpiryTimestamp Time when claim expires
     * @param claimNonce Unique identifier of claim
     * @param offchainVectorId Unique identifier of vector offchain
     */
    struct Claim {
        address currency;
        address contractAddress;
        address claimer;
        address payable paymentRecipient;
        uint256 pricePerToken;
        uint64 numTokensToMint;
        uint256 maxClaimableViaVector;
        uint256 maxClaimablePerUser;
        uint256 editionId;
        uint256 claimExpiryTimestamp;
        bytes32 claimNonce;
        bytes32 offchainVectorId;
    }

    /**
     * @notice Claim that is signed off-chain with EIP-712, and unwrapped to facilitate fulfillment of mint on a Series
     * @dev Max number claimable per transaction is enforced off-chain
     * @param currency Currency used for payment. Native gas token, if zero address
     * @param contractAddress NFT smart contract address
     * @param claimer Account able to use this claim
     * @param paymentRecipient Payment recipient
     * @param pricePerToken Price that has to be paid per minted token
     * @param maxPerTxn Max number of tokens that can be minted in a transaction
     * @param maxClaimableViaVector Max number of tokens that can be minted via vector
     * @param maxClaimablePerUser Max number of tokens that can be minted by user via vector
     * @param claimExpiryTimestamp Time when claim expires
     * @param claimNonce Unique identifier of claim
     * @param offchainVectorId Unique identifier of vector offchain
     */
    struct SeriesClaim {
        address currency;
        address contractAddress;
        address claimer;
        address payable paymentRecipient;
        uint256 pricePerToken;
        uint64 maxPerTxn;
        uint64 maxClaimableViaVector;
        uint64 maxClaimablePerUser;
        uint64 claimExpiryTimestamp;
        bytes32 claimNonce;
        bytes32 offchainVectorId;
    }

    /**
     * @notice Tracks current claim state of offchain vectors
     * @param numClaimed Total claimed on vector
     * @param numClaimedPerUser Tracks totals claimed per user on vector
     */
    struct OffchainVectorClaimState {
        uint256 numClaimed;
        mapping(address => uint256) numClaimedPerUser;
    }

    /* solhint-disable max-line-length */
    /**
     * @notice DEPRECATED - Claim typehash used via typed structured data hashing (EIP-712)
     */
    bytes32 private constant _CLAIM_TYPEHASH =
        keccak256(
            "Claim(address currency,address contractAddress,address claimer,address paymentRecipient,uint256 pricePerToken,uint64 numTokensToMint,uint256 maxClaimableViaVector,uint256 maxClaimablePerUser,uint256 editionId,uint256 claimExpiryTimestamp,bytes32 claimNonce,bytes32 offchainVectorId)"
        );

    /**
     * @notice DEPRECATED - Claim typehash used via typed structured data hashing (EIP-712)
     */
    bytes32 private constant _CLAIM_WITH_META_TX_PACKET_TYPEHASH =
        keccak256(
            "ClaimWithMetaTxPacket(address currency,address contractAddress,address claimer,uint256 pricePerToken,uint64 numTokensToMint,PurchaserMetaTxPacket purchaseToCreatorPacket,PurchaserMetaTxPacket purchaseToCreatorPacket,uint256 maxClaimableViaVector,uint256 maxClaimablePerUser,uint256 editionId,uint256 claimExpiryTimestamp,bytes32 claimNonce,bytes32 offchainVectorId)"
        );

    /* solhint-enable max-line-length */

    /**
     * @notice Platform receiving portion of payment
     */
    address payable private _platform;

    /**
     * @notice System-wide mint vectors
     */
    mapping(uint256 => Vector) public vectors;

    /**
     * @notice System-wide mint vectors' mutabilities
     */
    mapping(uint256 => VectorMutability) public vectorMutabilities;

    /**
     * @notice System-wide vector ids to (user to user claims count)
     */
    mapping(uint256 => mapping(address => uint64)) public userClaims;

    /**
     * @notice Tracks what nonces used in signed mint keys have been used for vectors enforced offchain
     *      Requires the platform to not re-use offchain vector IDs.
     */
    mapping(bytes32 => EnumerableSet.Bytes32Set) private _offchainVectorsToNoncesUsed;

    /**
     * @notice Tracks running state of offchain vectors
     */
    mapping(bytes32 => OffchainVectorClaimState) public offchainVectorsClaimState;

    /**
     * @notice Maps vector ids to edition ids
     */
    mapping(uint256 => uint256) public vectorToEditionId;

    /**
     * @notice Current vector id index
     */
    uint256 private _vectorSupply;

    /**
     * @notice Platform transaction executors
     */
    EnumerableSet.AddressSet internal _platformExecutors;

    /**
     * @notice Platform mint fee
     */
    uint256 private _platformMintFee;

    /**
     * @notice System-wide mint vectors
     */
    mapping(uint256 => AbridgedVectorData) private _abridgedVectors;

    /**
     * @notice Extra data about an abridged mint vector
     * Bits Layout:
     * - [0] `paused`
     * - [1..127] `unused` (for now)
     * - [128..255] `flexible data`
     */
    mapping(uint256 => uint256) private _abridgedVectorMetadata;

    /**
     @notice The bit position of `flexibleData` in packed abridged vector metadata.
     */
    uint256 private constant _BITPOS_AV_FLEXIBLE_DATA = 128;

    /**
     @notice The bitmask of `paused` in packed abridged vector metadata.
     */
    uint256 private constant _BITMASK_AV_PAUSED = 1;

    /**
     * @notice Global mechanic vector metadatas
     */
    mapping(bytes32 => MechanicVectorMetadata) public mechanicVectorMetadata;

    /**
     * @notice Mint fee oracle
     */
    address private _mintFeeOracle;

    /**
     * @notice Gasless mechanic address
     */
    address private _gaslessMechanicAddress;

    /**
     * @notice Emitted when platform executor is added or removed
     * @param executor Changed executor
     * @param added True if executor was added and false otherwise
     */
    event PlatformExecutorChanged(address indexed executor, bool indexed added);

    /**
     * @notice Emitted when vector for edition based colletction is created on-chain
     * @param vectorId ID of vector
     * @param editionId Edition id of vector
     * @param contractAddress Collection contract address
     */
    event EditionVectorCreated(uint256 indexed vectorId, uint48 indexed editionId, address indexed contractAddress);

    /**
     * @notice Emitted when vector for series based collection is created on-chain
     * @param vectorId ID of vector
     * @param contractAddress Collection contract address
     */
    event SeriesVectorCreated(uint256 indexed vectorId, address indexed contractAddress);

    /**
     * @notice Emitted when vector is updated on-chain
     * @param vectorId ID of vector
     */
    event VectorUpdated(uint256 indexed vectorId);

    /**
     * @notice Emitted when vector is deleted on-chain
     * @param vectorId ID of vector to delete
     */
    event VectorDeleted(uint256 indexed vectorId);

    /**
     * @notice Emitted when vector metadata is set
     * @param vectorId ID of vector
     * @param paused True if vector was paused, false otherwise
     * @param flexibleData Flexible data set in a vector's metadata
     */
    event VectorMetadataSet(uint256 indexed vectorId, bool indexed paused, uint128 indexed flexibleData);

    /**
     * @notice Emitted when payment is made in native gas token
     * @param paymentRecipient Creator recipient of payment
     * @param vectorId Vector that payment was for
     * @param amountToCreator Amount sent to creator
     * @param percentageBPSOfTotal Percentage (in basis points) that was sent to creator, of total payment
     */
    event NativeGasTokenPayment(
        address indexed paymentRecipient,
        bytes32 indexed vectorId,
        uint256 amountToCreator,
        uint32 percentageBPSOfTotal
    );

    /**
     * @notice Emitted when payment is made in ERC20
     * @param currency ERC20 currency
     * @param paymentRecipient Creator recipient of payment
     * @param vectorId Vector that payment was for
     * @param payer Payer
     * @param amountToCreator Amount sent to creator
     * @param percentageBPSOfTotal Percentage (in basis points) that was sent to creator, of total payment
     */
    event ERC20Payment(
        address indexed currency,
        address indexed paymentRecipient,
        bytes32 indexed vectorId,
        address payer,
        uint256 amountToCreator,
        uint32 percentageBPSOfTotal
    );

    /**
     * @notice Emitted on a mint where discrete token ids are minted
     * @param vectorId Vector that payment was for
     * @param contractAddress Address of contract being minted on
     * @param onChainVector Denotes whether mint vector is on-chain
     * @param tokenIds Array of token ids to mint
     */
    event ChooseTokenMint(
        bytes32 indexed vectorId,
        address indexed contractAddress,
        bool indexed onChainVector,
        uint256[] tokenIds
    );

    /**
     * @notice Emitted on a mint where a number of tokens are minted monotonically
     * @param vectorId Vector that payment was for
     * @param contractAddress Address of contract being minted on
     * @param onChainVector Denotes whether mint vector is on-chain
     * @param numMinted Number of tokens minted
     */
    event NumTokenMint(
        bytes32 indexed vectorId,
        address indexed contractAddress,
        bool indexed onChainVector,
        uint256 numMinted
    );

    /**
     * @notice Emitted on a mint where a number of tokens are minted monotonically by the owner
     * @param contractAddress Address of contract being minted on
     * @param isEditionBased Denotes whether collection is edition-based
     * @param editionId Edition ID, if applicable
     * @param numMinted Number of tokens minted
     */
    event CreatorReservesNumMint(
        address indexed contractAddress,
        bool indexed isEditionBased,
        uint256 indexed editionId,
        uint256 numMinted
    );

    /**
     * @notice Emitted on a mint where a number of tokens are minted monotonically by the owner
     * @param contractAddress Address of contract being minted on
     * @param tokenIds IDs of tokens minted
     */
    event CreatorReservesChooseMint(address indexed contractAddress, uint256[] tokenIds);

    /**
     * @notice Emitted when a mechanic vector is registered
     * @param mechanicVectorId Global mechanic vector ID
     * @param mechanic Mechanic's address
     * @param contractAddress Address of collection the mechanic is minting on
     * @param editionId ID of edition, if applicable
     * @param isEditionBased If true, edition based
     */
    event MechanicVectorRegistered(
        bytes32 indexed mechanicVectorId,
        address indexed mechanic,
        address indexed contractAddress,
        uint256 editionId,
        bool isEditionBased
    );

    /**
     * @notice Emitted when a mechanic vector's pause state is toggled
     * @param mechanicVectorId Global mechanic vector ID
     * @param paused If true, mechanic was paused. If false, mechanic was unpaused
     */
    event MechanicVectorPauseSet(bytes32 indexed mechanicVectorId, bool indexed paused);

    /**
     * @notice Emitted when the platform mint fee is updated
     * @param newPlatformMintFee New platform mint fee
     */
    event PlatformMintFeeUpdated(uint256 indexed newPlatformMintFee);

    /**
     * @notice Emit when creator is paid out
     * @param currency Currency creator reward is in
     * @param rewardRecipient Creator reward recipient
     * @param amount Amount of payout
     */
    event CreatorRewardPayout(
        bytes32 indexed vectorId,
        address indexed currency,
        address indexed rewardRecipient,
        uint256 amount
    );

    /**
     * @notice Restricts calls to platform
     */
    modifier onlyPlatform() {
        if (_msgSender() != _platform) {
            _revert(Unauthorized.selector);
        }
        _;
    }

    /**
     * @notice Initializes MintManager
     * @param platform Platform address
     * @param _owner MintManager owner
     * @param trustedForwarder Trusted meta-tx executor
     * @param initialExecutor Initial platform executor
     * @param initialPlatformMintFee Initial platform mint fee
     */
    function initialize(
        address payable platform,
        address _owner,
        address trustedForwarder,
        address initialExecutor,
        uint256 initialPlatformMintFee
    ) external initializer {
        _platform = platform;
        __EIP721Upgradeable_initialize("MintManager", "1.0.0");
        __ERC2771ContextUpgradeable__init__(trustedForwarder);
        __Ownable_init();
        _transferOwnership(_owner);
        _platformExecutors.add(initialExecutor);
        _platformMintFee = initialPlatformMintFee;
    }

    /**
     * @notice Add or deprecate platform executor
     * @param _executor Platform executor to add or deprecate
     */
    function addOrDeprecatePlatformExecutor(address _executor) external onlyOwner {
        if (_executor == address(0)) {
            _revert(InvalidExecutorChanged.selector);
        }
        if (_platformExecutors.contains(_executor)) {
            // remove exeuctor
            _platformExecutors.remove(_executor);
        } else {
            // add executor
            _platformExecutors.add(_executor);
        }
    }

    /**
     * @notice See {IAbridgedMintVector-createAbridgedVector}
     */
    function createAbridgedVector(AbridgedVectorData calldata _vector) external {
        address msgSender = _msgSender();

        if (
            address(_vector.contractAddress) == msgSender ||
            Ownable(address(_vector.contractAddress)).owner() == msgSender
        ) {
            if (_vector.totalClaimedViaVector > 0) {
                _revert(InvalidTotalClaimed.selector);
            }

            _vectorSupply++;

            _abridgedVectors[_vectorSupply] = _vector;

            if (_vector.editionBasedCollection) {
                emit EditionVectorCreated(_vectorSupply, _vector.editionId, address(_vector.contractAddress));
            } else {
                emit SeriesVectorCreated(_vectorSupply, address(_vector.contractAddress));
            }
        } else {
            _revert(Unauthorized.selector);
        }
    }

    /* solhint-disable code-complexity */
    /**
     * @notice See {IAbridgedMintVector-updateAbridgedVector}
     */
    function updateAbridgedVector(
        uint256 vectorId,
        AbridgedVector calldata _newVector,
        UpdateAbridgedVectorConfig calldata updateConfig,
        bool pause,
        uint128 flexibleData
    ) external {
        address contractAddress = address(_abridgedVectors[vectorId].contractAddress);
        address msgSender = _msgSender();
        // check owner() first, more likely
        if (Ownable(contractAddress).owner() == msgSender || msgSender == contractAddress) {
            if (updateConfig.updateStartTimestamp > 0) {
                _abridgedVectors[vectorId].startTimestamp = _newVector.startTimestamp;
            }
            if (updateConfig.updateEndTimestamp > 0) {
                _abridgedVectors[vectorId].endTimestamp = _newVector.endTimestamp;
            }
            if (updateConfig.updatePaymentRecipient > 0) {
                _abridgedVectors[vectorId].paymentRecipient = uint160(_newVector.paymentRecipient);
            }
            if (updateConfig.updateMaxTotalClaimableViaVector > 0) {
                _abridgedVectors[vectorId].maxTotalClaimableViaVector = _newVector.maxTotalClaimableViaVector;
            }
            if (updateConfig.updateTokenLimitPerTx > 0) {
                _abridgedVectors[vectorId].tokenLimitPerTx = _newVector.tokenLimitPerTx;
            }
            if (updateConfig.updateMaxUserClaimableViaVector > 0) {
                _abridgedVectors[vectorId].maxUserClaimableViaVector = _newVector.maxUserClaimableViaVector;
            }
            if (updateConfig.updatePricePerToken > 0) {
                _abridgedVectors[vectorId].pricePerToken = _newVector.pricePerToken;
            }
            if (updateConfig.updateCurrency > 0) {
                _abridgedVectors[vectorId].currency = uint160(_newVector.currency);
            }
            if (updateConfig.updateRequireDirectEOA > 0) {
                _abridgedVectors[vectorId].requireDirectEOA = _newVector.requireDirectEOA;
            }
            if (updateConfig.updateMetadata > 0) {
                _abridgedVectorMetadata[vectorId] = _composeAbridgedVectorMetadata(pause, flexibleData);

                emit VectorMetadataSet(vectorId, pause, flexibleData);
            }

            emit VectorUpdated(vectorId);
        } else {
            _revert(Unauthorized.selector);
        }
    }

    /* solhint-enable code-complexity */

    /**
     * @notice See {IAbridgedMintVector-setAbridgedVectorMetadata}
     */
    function setAbridgedVectorMetadata(uint256 vectorId, bool pause, uint128 flexibleData) external {
        address contractAddress = address(_abridgedVectors[vectorId].contractAddress);
        address msgSender = _msgSender();
        // check .owner() first, more likely
        if (Ownable(contractAddress).owner() == msgSender || msgSender == contractAddress) {
            _abridgedVectorMetadata[vectorId] = _composeAbridgedVectorMetadata(pause, flexibleData);

            emit VectorMetadataSet(vectorId, pause, flexibleData);
        } else {
            _revert(Unauthorized.selector);
        }
    }

    /**
     * @notice See {IMechanicMintManager-registerMechanicVector}
     */
    function registerMechanicVector(
        MechanicVectorMetadata memory _mechanicVectorMetadata,
        uint96 seed,
        bytes calldata vectorData
    ) external {
        address msgSender = _msgSender();
        bytes32 mechanicVectorId = _produceMechanicVectorId(_mechanicVectorMetadata, seed);
        if (
            msgSender == _mechanicVectorMetadata.contractAddress ||
            Ownable(_mechanicVectorMetadata.contractAddress).owner() == msgSender
        ) {
            if (mechanicVectorMetadata[mechanicVectorId].contractAddress != address(0)) {
                _revert(AlreadyRegisteredWithId.selector);
            }
            if (
                _mechanicVectorMetadata.contractAddress == address(0) ||
                _mechanicVectorMetadata.mechanic == address(0) ||
                (_mechanicVectorMetadata.isEditionBased && _mechanicVectorMetadata.isChoose) ||
                mechanicVectorId == bytes32(0)
            ) {
                _revert(InvalidMechanic.selector);
            }
            _mechanicVectorMetadata.paused = false;
            mechanicVectorMetadata[mechanicVectorId] = _mechanicVectorMetadata;
        } else {
            _revert(Unauthorized.selector);
        }

        IMechanic(_mechanicVectorMetadata.mechanic).createVector(mechanicVectorId, vectorData);

        emit MechanicVectorRegistered(
            mechanicVectorId,
            _mechanicVectorMetadata.mechanic,
            _mechanicVectorMetadata.contractAddress,
            _mechanicVectorMetadata.editionId,
            _mechanicVectorMetadata.isEditionBased
        );
    }

    /**
     * @notice See {IMechanicMintManager-setPauseOnMechanicMintVector}
     */
    function setPauseOnMechanicMintVector(bytes32 mechanicVectorId, bool pause) external {
        address msgSender = _msgSender();
        address contractAddress = mechanicVectorMetadata[mechanicVectorId].contractAddress;
        if (contractAddress == address(0)) {
            _revert(InvalidMechanic.selector);
        }

        if (Ownable(contractAddress).owner() == msgSender || msgSender == contractAddress) {
            mechanicVectorMetadata[mechanicVectorId].paused = pause;
        } else {
            _revert(Unauthorized.selector);
        }

        emit MechanicVectorPauseSet(mechanicVectorId, pause);
    }

    /* solhint-disable code-complexity */
    /**
     * @notice See {IMechanicMintManager-mechanicMintNum}
     */
    function mechanicMintNum(
        bytes32 mechanicVectorId,
        address recipient,
        uint32 numToMint,
        bytes memory data
    ) external payable {
        MechanicVectorMetadata memory _mechanicVectorMetadata = mechanicVectorMetadata[mechanicVectorId];
        address msgSender = _msgSender();

        if (_mechanicVectorMetadata.paused) {
            _revert(MechanicPaused.selector);
        }
        if (_mechanicVectorMetadata.isChoose) {
            _revert(InvalidMechanic.selector);
        }

        uint256 _platformFee = 0;
        // constant gasless mechanic address
        if (_mechanicVectorMetadata.mechanic == _gaslessMechanicAddress) {
            uint256 fee;
            address feeCollector;
            assembly {
                fee := calldataload(sub(calldatasize(), 32))
                feeCollector := shr(96, calldataload(sub(calldatasize(), 72)))
            }

            data = abi.encode(fee, feeCollector, data);
        } else {
            _platformFee = IMintFeeOracle(_mintFeeOracle).getMechanicMintFee(
                mechanicVectorId,
                numToMint,
                _mechanicVectorMetadata.mechanic,
                msgSender
            );
            if (msg.value < _platformFee) {
                _revert(MintFeeTooLow.selector);
            }
        }

        IMechanic(_mechanicVectorMetadata.mechanic).processNumMint{ value: msg.value - _platformFee }(
            mechanicVectorId,
            recipient,
            numToMint,
            msgSender,
            _mechanicVectorMetadata,
            data
        );

        if (_mechanicVectorMetadata.isEditionBased) {
            if (numToMint == 1) {
                IERC721EditionMint(_mechanicVectorMetadata.contractAddress).mintOneToRecipient(
                    _mechanicVectorMetadata.editionId,
                    recipient
                );
            } else {
                IERC721EditionMint(_mechanicVectorMetadata.contractAddress).mintAmountToRecipient(
                    _mechanicVectorMetadata.editionId,
                    recipient,
                    uint256(numToMint)
                );
            }
        } else {
            if (numToMint == 1) {
                IERC721GeneralMint(_mechanicVectorMetadata.contractAddress).mintOneToOneRecipient(recipient);
            } else {
                IERC721GeneralMint(_mechanicVectorMetadata.contractAddress).mintAmountToOneRecipient(
                    recipient,
                    uint256(numToMint)
                );
            }
        }

        emit NumTokenMint(mechanicVectorId, _mechanicVectorMetadata.contractAddress, true, uint256(numToMint));
    }

    /**
     * @notice See {IMechanicMintManager-mechanicMintChoose}
     */
    function mechanicMintChoose(
        bytes32 mechanicVectorId,
        address recipient,
        uint256[] calldata tokenIds,
        bytes memory data
    ) external payable {
        MechanicVectorMetadata memory _mechanicVectorMetadata = mechanicVectorMetadata[mechanicVectorId];
        address msgSender = _msgSender();

        if (_mechanicVectorMetadata.paused) {
            _revert(MechanicPaused.selector);
        }
        if (!_mechanicVectorMetadata.isChoose) {
            _revert(InvalidMechanic.selector);
        }
        uint32 numToMint = uint32(tokenIds.length);
        uint256 _platformFee = IMintFeeOracle(_mintFeeOracle).getMechanicMintFee(
            mechanicVectorId,
            numToMint,
            _mechanicVectorMetadata.mechanic,
            msgSender
        );
        if (msg.value < _platformFee) {
            _revert(MintFeeTooLow.selector);
        }

        // send value without amount needed for mint fee
        IMechanic(_mechanicVectorMetadata.mechanic).processChooseMint{ value: msg.value - _platformFee }(
            mechanicVectorId,
            recipient,
            tokenIds,
            msgSender,
            _mechanicVectorMetadata,
            data
        );

        if (numToMint == 1) {
            IERC721GeneralMint(_mechanicVectorMetadata.contractAddress).mintSpecificTokenToOneRecipient(
                recipient,
                tokenIds[0]
            );
        } else {
            IERC721GeneralMint(_mechanicVectorMetadata.contractAddress).mintSpecificTokensToOneRecipient(
                recipient,
                tokenIds
            );
        }

        emit ChooseTokenMint(mechanicVectorId, _mechanicVectorMetadata.contractAddress, true, tokenIds);
    }

    /* solhint-disable code-complexity */

    /**
     * @notice Let the owner of a collection mint creator reserves
     * @param collection Collection contract address
     * @param isEditionBased If true, collection is edition-based
     * @param editionId Edition ID of collection, if applicable
     * @param numToMint Number of tokens to mint on sequential mints
     * @param tokenIds To reserve mint collector's choice based mints
     * @param isCollectorsChoice If true, mint via collector's choice based paradigm
     * @param recipient Recipient of minted tokens
     */
    function creatorReservesMint(
        address collection,
        bool isEditionBased,
        uint256 editionId,
        uint256 numToMint,
        uint256[] calldata tokenIds,
        bool isCollectorsChoice,
        address recipient
    ) external payable {
        address msgSender = _msgSender();

        uint256 tokenIdsLength = tokenIds.length;
        if (tokenIdsLength > 0) {
            numToMint = tokenIdsLength;
        }

        if (Ownable(collection).owner() == msgSender || msgSender == collection) {
            // platform mint fee deprecated for creator reserves mints
            /*
            uint256 mintFeeAmount = _platformMintFee * numToMint;
            if (mintFeeAmount > msg.value) {
                _revert(InvalidPaymentAmount.selector);
            }
            */

            if (isEditionBased) {
                if (numToMint == 1) {
                    IERC721EditionMint(collection).mintOneToRecipient(editionId, recipient);
                } else {
                    IERC721EditionMint(collection).mintAmountToRecipient(editionId, recipient, numToMint);
                }
            } else {
                if (numToMint == 1) {
                    if (isCollectorsChoice) {
                        IERC721GeneralMint(collection).mintSpecificTokenToOneRecipient(recipient, tokenIds[0]);
                    } else {
                        IERC721GeneralMint(collection).mintOneToOneRecipient(recipient);
                    }
                } else {
                    if (isCollectorsChoice) {
                        IERC721GeneralMint(collection).mintSpecificTokensToOneRecipient(recipient, tokenIds);
                    } else {
                        IERC721GeneralMint(collection).mintAmountToOneRecipient(recipient, numToMint);
                    }
                }
            }

            if (isCollectorsChoice) {
                emit CreatorReservesChooseMint(collection, tokenIds);
            } else {
                emit CreatorReservesNumMint(collection, isEditionBased, editionId, numToMint);
            }
        } else {
            _revert(Unauthorized.selector);
        }
    }

    /* solhint-enable code-complexity */

    /**
     * @notice Mint on a Series with a valid claim where one can choose the tokens to mint
     * @param claim Series Claim
     * @param claimSignature Signed + encoded claim
     * @param mintRecipient Who to mint the NFT(s) to.
     *                      Can't mint to different recipient if tx isn't sent by claim.claimer.
     * @param tokenIds IDs of NFTs to mint
     */
    function gatedSeriesMintChooseToken(
        SeriesClaim calldata claim,
        bytes calldata claimSignature,
        address mintRecipient,
        uint256[] calldata tokenIds
    ) external payable {
        address msgSender = _msgSender();
        uint256 numTokensToMint = tokenIds.length;
        if (claim.claimer != msgSender && mintRecipient != claim.claimer) {
            _revert(UnsafeMintRecipient.selector);
        }

        _verifyAndUpdateSeriesClaim(claim, claimSignature, numTokensToMint);
        _processClassicVectorPayments(
            claim.offchainVectorId,
            numTokensToMint,
            msgSender,
            claim.currency,
            claim.pricePerToken,
            claim.paymentRecipient
        );
        emit ChooseTokenMint(claim.offchainVectorId, claim.contractAddress, false, tokenIds);

        // mint NFT(s)
        if (numTokensToMint == 1) {
            IERC721GeneralMint(claim.contractAddress).mintSpecificTokenToOneRecipient(mintRecipient, tokenIds[0]);
        } else {
            IERC721GeneralMint(claim.contractAddress).mintSpecificTokensToOneRecipient(mintRecipient, tokenIds);
        }
    }

    /**
     * @notice Mint on a collection with sequentially minted token IDs with a valid claim
     * @param claim Claim
     * @param claimSignature Signed + encoded claim
     * @param mintRecipient Who to mint the NFT(s) to.
     *                      Can't mint to different recipient if tx isn't sent by claim.claimer.
     */
    function gatedNumMint(
        Claim calldata claim,
        bytes calldata claimSignature,
        address mintRecipient,
        bool isEditionBased
    ) external payable {
        address msgSender = _msgSender();
        if (claim.claimer != msgSender && mintRecipient != claim.claimer) {
            _revert(UnsafeMintRecipient.selector);
        }

        _verifyAndUpdateClaim(claim, claimSignature);
        _processClassicVectorPayments(
            claim.offchainVectorId,
            claim.numTokensToMint,
            msgSender,
            claim.currency,
            claim.pricePerToken,
            claim.paymentRecipient
        );
        emit NumTokenMint(claim.offchainVectorId, claim.contractAddress, false, claim.numTokensToMint);

        if (isEditionBased) {
            if (claim.numTokensToMint == 1) {
                IERC721EditionMint(claim.contractAddress).mintOneToRecipient(claim.editionId, mintRecipient);
            } else {
                IERC721EditionMint(claim.contractAddress).mintAmountToRecipient(
                    claim.editionId,
                    mintRecipient,
                    claim.numTokensToMint
                );
            }
        } else {
            if (claim.numTokensToMint == 1) {
                IERC721GeneralMint(claim.contractAddress).mintOneToOneRecipient(mintRecipient);
            } else {
                IERC721GeneralMint(claim.contractAddress).mintAmountToOneRecipient(
                    mintRecipient,
                    claim.numTokensToMint
                );
            }
        }
    }

    /**
     * @notice Mint via an abridged vector
     * @param vectorId ID of vector
     * @param numTokensToMint Number of tokens to mint
     * @param mintRecipient Who to mint the NFT(s) to
     */
    function vectorMint721(uint256 vectorId, uint48 numTokensToMint, address mintRecipient) external payable {
        address msgSender = _msgSender();
        address user = mintRecipient;
        if (_useSenderForUserLimit(vectorId)) {
            user = msgSender;
        }

        AbridgedVectorData memory _vector = _abridgedVectors[vectorId];
        uint48 newNumClaimedViaVector = _vector.totalClaimedViaVector + numTokensToMint;
        uint48 newNumClaimedForUser = uint48(userClaims[vectorId][user]) + numTokensToMint;

        if (_vector.allowlistRoot != 0) {
            _revert(AllowlistInvalid.selector);
        }
        if (_vector.requireDirectEOA && msgSender != tx.origin) {
            _revert(SenderNotDirectEOA.selector);
        }

        _abridgedVectors[vectorId].totalClaimedViaVector = newNumClaimedViaVector;
        userClaims[vectorId][user] = uint64(newNumClaimedForUser);

        if (_vector.editionBasedCollection) {
            _vectorMintEdition721(
                vectorId,
                _vector,
                numTokensToMint,
                mintRecipient,
                msgSender,
                newNumClaimedViaVector,
                newNumClaimedForUser
            );
        } else {
            _vectorMintGeneral721(
                vectorId,
                _vector,
                numTokensToMint,
                mintRecipient,
                msgSender,
                newNumClaimedViaVector,
                newNumClaimedForUser
            );
        }
    }

    /**
     * @notice Withdraw native gas token owed to platform
     */
    function withdrawNativeGasToken(uint256 amountToWithdraw) external onlyPlatform {
        (bool sentToPlatform, bytes memory dataPlatform) = _platform.call{ value: amountToWithdraw }("");
        if (!sentToPlatform) {
            _revert(EtherSendFailed.selector);
        }
    }

    /**
     * @notice Update platform payment address
     */
    function updatePlatformAndMintFeeOracle(
        address payable newPlatform,
        address newOracle,
        address gaslessMechanic
    ) external onlyOwner {
        if (newPlatform == address(0)) {
            _revert(Unauthorized.selector);
        }
        _platform = newPlatform;
        if (_mintFeeOracle != newOracle) {
            _mintFeeOracle = newOracle;
        }
        if (_gaslessMechanicAddress != gaslessMechanic) {
            _gaslessMechanicAddress = gaslessMechanic;
        }
    }

    /**
     * @notice Returns if an address is a platform executor
     */
    function isPlatformExecutor(address _executor) external view returns (bool) {
        return _platformExecutors.contains(_executor);
    }

    /**
     * @notice Returns number of NFTs minted by user on vector
     * @param vectorId ID of offchain vector
     * @param user Minting user
     */
    function getNumClaimedPerUserOffchainVector(bytes32 vectorId, address user) external view returns (uint256) {
        return offchainVectorsClaimState[vectorId].numClaimedPerUser[user];
    }

    /**
     * @notice Verify that claim and claim signature are valid for a mint
     * @param claim Claim
     * @param signature Signed + encoded claim
     * @param expectedMsgSender *DEPRECATED*, keep for interface adherence
     */
    function verifyClaim(
        Claim calldata claim,
        bytes calldata signature,
        address expectedMsgSender
    ) external view returns (bool) {
        address signer = _claimSigner(claim, signature);

        return
            _platformExecutors.contains(signer) &&
            !_offchainVectorsToNoncesUsed[claim.offchainVectorId].contains(claim.claimNonce) &&
            block.timestamp <= claim.claimExpiryTimestamp &&
            (claim.maxClaimableViaVector == 0 ||
                claim.numTokensToMint + offchainVectorsClaimState[claim.offchainVectorId].numClaimed <=
                claim.maxClaimableViaVector) &&
            (claim.maxClaimablePerUser == 0 ||
                claim.numTokensToMint +
                    offchainVectorsClaimState[claim.offchainVectorId].numClaimedPerUser[claim.claimer] <=
                claim.maxClaimablePerUser);
    }

    /**
     * @notice Returns if nonce is used for the vector
     * @param vectorId ID of offchain vector
     * @param nonce Nonce being checked
     */
    function isNonceUsed(bytes32 vectorId, bytes32 nonce) external view returns (bool) {
        return _offchainVectorsToNoncesUsed[vectorId].contains(nonce);
    }

    /**
     * @notice See {IAbridgedMintVector-getAbridgedVector}
     */
    function getAbridgedVector(uint256 vectorId) external view returns (AbridgedVector memory) {
        AbridgedVectorData memory data = _abridgedVectors[vectorId];
        return
            AbridgedVector(
                address(data.contractAddress),
                data.startTimestamp,
                data.endTimestamp,
                address(data.paymentRecipient),
                data.maxTotalClaimableViaVector,
                data.totalClaimedViaVector,
                address(data.currency),
                data.tokenLimitPerTx,
                data.maxUserClaimableViaVector,
                data.pricePerToken,
                data.editionId,
                data.editionBasedCollection,
                data.requireDirectEOA,
                data.allowlistRoot
            );
    }

    /**
     * @notice See {IAbridgedMintVector-getAbridgedVectorMetadata}
     */
    function getAbridgedVectorMetadata(uint256 vectorId) external view returns (bool, uint128) {
        return _decomposeAbridgedVectorMetadata(_abridgedVectorMetadata[vectorId]);
    }

    /* solhint-disable no-empty-blocks */
    /**
     * @notice Limit upgrades of contract to MintManager owner
     * @param // New implementation address
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}

    /* solhint-enable no-empty-blocks */

    /**
     * @notice Used for meta-transactions
     */
    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (address sender)
    {
        return ERC2771ContextUpgradeable._msgSender();
    }

    /**
     * @notice Used for meta-transactions
     */
    function _msgData() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    /**
     * @notice Verify, and update the state of a gated mint claim
     * @param claim Claim
     * @param signature Signed + encoded claim
     */
    function _verifyAndUpdateClaim(Claim calldata claim, bytes calldata signature) private {
        address signer = _claimSigner(claim, signature);

        // cannot cache here due to nested mapping
        uint256 expectedNumClaimedViaVector = offchainVectorsClaimState[claim.offchainVectorId].numClaimed +
            claim.numTokensToMint;
        uint256 expectedNumClaimedByUser = offchainVectorsClaimState[claim.offchainVectorId].numClaimedPerUser[
            claim.claimer
        ] + claim.numTokensToMint;

        if (
            !_platformExecutors.contains(signer) ||
            _offchainVectorsToNoncesUsed[claim.offchainVectorId].contains(claim.claimNonce) ||
            block.timestamp > claim.claimExpiryTimestamp ||
            (expectedNumClaimedViaVector > claim.maxClaimableViaVector && claim.maxClaimableViaVector != 0) ||
            (expectedNumClaimedByUser > claim.maxClaimablePerUser && claim.maxClaimablePerUser != 0)
        ) {
            _revert(InvalidClaim.selector);
        }

        _offchainVectorsToNoncesUsed[claim.offchainVectorId].add(claim.claimNonce); // mark claim nonce as used
        // update claim state
        offchainVectorsClaimState[claim.offchainVectorId].numClaimed = expectedNumClaimedViaVector;
        offchainVectorsClaimState[claim.offchainVectorId].numClaimedPerUser[claim.claimer] = expectedNumClaimedByUser;
    }

    /**
     * @notice Verify, and update the state of a gated series mint claim
     * @param claim Series Claim
     * @param signature Signed + encoded claim
     * @param numTokensToMint How many tokens to mint in this series claim
     */
    function _verifyAndUpdateSeriesClaim(
        SeriesClaim calldata claim,
        bytes calldata signature,
        uint256 numTokensToMint
    ) private {
        address signer = _seriesClaimSigner(claim, signature);

        // cannot cache here due to nested mapping
        uint256 expectedNumClaimedViaVector = offchainVectorsClaimState[claim.offchainVectorId].numClaimed +
            numTokensToMint;
        uint256 expectedNumClaimedByUser = offchainVectorsClaimState[claim.offchainVectorId].numClaimedPerUser[
            claim.claimer
        ] + numTokensToMint;

        if (
            !_platformExecutors.contains(signer) ||
            (numTokensToMint > claim.maxPerTxn && claim.maxPerTxn != 0) ||
            _offchainVectorsToNoncesUsed[claim.offchainVectorId].contains(claim.claimNonce) ||
            block.timestamp > claim.claimExpiryTimestamp ||
            (expectedNumClaimedViaVector > claim.maxClaimableViaVector && claim.maxClaimableViaVector != 0) ||
            (expectedNumClaimedByUser > claim.maxClaimablePerUser && claim.maxClaimablePerUser != 0)
        ) {
            _revert(InvalidClaim.selector);
        }

        _offchainVectorsToNoncesUsed[claim.offchainVectorId].add(claim.claimNonce); // mark claim nonce as used
        // update claim state
        offchainVectorsClaimState[claim.offchainVectorId].numClaimed = expectedNumClaimedViaVector;
        offchainVectorsClaimState[claim.offchainVectorId].numClaimedPerUser[claim.claimer] = expectedNumClaimedByUser;
    }

    /**
     * @notice Process a mint on an on-chain vector
     * @param _vectorId ID of vector being minted on
     * @param _vector Vector being minted on
     * @param numTokensToMint Number of NFTs to mint on vector
     * @param newNumClaimedViaVector New number of NFTs minted via vector after this ones
     * @param newNumClaimedForUser New number of NFTs minted by user via vector after this ones
     * @param msgSender Minter
     */
    function _processVectorMint(
        uint256 _vectorId,
        AbridgedVectorData memory _vector,
        uint48 numTokensToMint,
        uint48 newNumClaimedViaVector,
        uint48 newNumClaimedForUser,
        address msgSender
    ) private {
        if (
            (_vector.maxTotalClaimableViaVector < newNumClaimedViaVector && _vector.maxTotalClaimableViaVector != 0) ||
            (_vector.maxUserClaimableViaVector < newNumClaimedForUser && _vector.maxUserClaimableViaVector != 0) ||
            ((_vector.startTimestamp > block.timestamp && _vector.startTimestamp != 0) ||
                (block.timestamp > _vector.endTimestamp && _vector.endTimestamp != 0)) ||
            (numTokensToMint == 0) ||
            (numTokensToMint > _vector.tokenLimitPerTx && _vector.tokenLimitPerTx != 0)
        ) {
            _revert(OnchainVectorMintGuardFailed.selector);
        }

        if (_isVectorPaused(_abridgedVectorMetadata[_vectorId])) {
            _revert(MintPaused.selector);
        }

        _processClassicVectorPayments(
            bytes32(_vectorId),
            uint256(numTokensToMint),
            msgSender,
            address(_vector.currency),
            _vector.pricePerToken,
            payable(address(_vector.paymentRecipient))
        );

        emit NumTokenMint(bytes32(_vectorId), address(_vector.contractAddress), true, numTokensToMint);
    }

    /**
     * @notice Mint on vector pointing to ERC721General collection
     * @param _vectorId ID of vector
     * @param _vector Vector being minted on
     * @param numTokensToMint Number of tokens to mint
     * @param mintRecipient Who to mint the NFT(s) to
     * @param msgSender Minter
     * @param newNumClaimedViaVector New number of NFTs minted via vector after this ones
     * @param newNumClaimedForUser New number of NFTs minted by user via vector after this ones
     */
    function _vectorMintGeneral721(
        uint256 _vectorId,
        AbridgedVectorData memory _vector,
        uint48 numTokensToMint,
        address mintRecipient,
        address msgSender,
        uint48 newNumClaimedViaVector,
        uint48 newNumClaimedForUser
    ) private {
        _processVectorMint(
            _vectorId,
            _vector,
            numTokensToMint,
            newNumClaimedViaVector,
            newNumClaimedForUser,
            msgSender
        );
        if (numTokensToMint == 1) {
            IERC721GeneralMint(address(_vector.contractAddress)).mintOneToOneRecipient(mintRecipient);
        } else {
            IERC721GeneralMint(address(_vector.contractAddress)).mintAmountToOneRecipient(
                mintRecipient,
                numTokensToMint
            );
        }
    }

    /**
     * @notice Mint on vector pointing to ERC721Editions or ERC721SingleEdiion collection
     * @param _vectorId ID of vector
     * @param _vector Vector being minted on
     * @param numTokensToMint Number of tokens to mint
     * @param mintRecipient Who to mint the NFT(s) to
     * @param msgSender Minter
     * @param newNumClaimedViaVector New number of NFTs minted via vector after this ones
     * @param newNumClaimedForUser New number of NFTs minted by user via vector after this ones
     */
    function _vectorMintEdition721(
        uint256 _vectorId,
        AbridgedVectorData memory _vector,
        uint48 numTokensToMint,
        address mintRecipient,
        address msgSender,
        uint48 newNumClaimedViaVector,
        uint48 newNumClaimedForUser
    ) private {
        _processVectorMint(
            _vectorId,
            _vector,
            numTokensToMint,
            newNumClaimedViaVector,
            newNumClaimedForUser,
            msgSender
        );
        if (numTokensToMint == 1) {
            IERC721EditionMint(address(_vector.contractAddress)).mintOneToRecipient(_vector.editionId, mintRecipient);
        } else {
            IERC721EditionMint(address(_vector.contractAddress)).mintAmountToRecipient(
                _vector.editionId,
                mintRecipient,
                numTokensToMint
            );
        }
    }

    /**
     * @notice Process payment in native gas token
     * @param totalAmount Total amount being paid
     * @param recipient Creator recipient of payment
     * @param vectorId ID of vector (on-chain or off-chain)
     */
    function _processNativeGasTokenPayment(uint256 totalAmount, address payable recipient, bytes32 vectorId) private {
        (bool sentToRecipient, ) = recipient.call{ value: totalAmount }("");
        if (!sentToRecipient) {
            _revert(EtherSendFailed.selector);
        }
        emit NativeGasTokenPayment(recipient, vectorId, totalAmount, 10000);
    }

    /**
     * @notice Process payment in ERC20
     * @param totalAmount Total amount being paid
     * @param recipient Creator recipient of payment
     * @param payer Payer
     * @param currency ERC20 currency
     * @param vectorId ID of vector (on-chain or off-chain)
     */
    function _processERC20Payment(
        uint256 totalAmount,
        address recipient,
        address payer,
        address currency,
        bytes32 vectorId
    ) private {
        IERC20(currency).transferFrom(payer, recipient, totalAmount);
        emit ERC20Payment(currency, recipient, vectorId, payer, totalAmount, 10000);
    }

    /**
     * @notice Recover claim signature signer
     * @param claim Claim
     * @param signature Claim signature
     */
    function _claimSigner(Claim calldata claim, bytes calldata signature) private view returns (address) {
        return
            _hashTypedDataV4(
                keccak256(bytes.concat(_claimABIEncoded1(claim), _claimABIEncoded2(claim.offchainVectorId)))
            ).recover(signature);
    }

    /**
     * @notice Recover series claim signature signer
     * @param claim Series Claim
     * @param signature Series Claim signature
     */
    function _seriesClaimSigner(SeriesClaim calldata claim, bytes calldata signature) private view returns (address) {
        return _hashTypedDataV4(keccak256(_seriesClaimABIEncoded(claim))).recover(signature);
    }

    /**
     * @dev Understand whether to use the transaction sender or the nft recipient for per-user limits on onchain vectors
     */
    function _useSenderForUserLimit(uint256 mintVectorId) private view returns (bool) {
        return false;
        /*
            ((block.chainid == 1 && mintVectorId < 19) ||
            (block.chainid == 5 && mintVectorId < 188) ||
            (block.chainid == 42161 && mintVectorId < 6) ||
            (block.chainid == 421613 && mintVectorId < 3) ||
            (block.chainid == 84531 && mintVectorId < 14) ||
            (block.chainid == 8453 && mintVectorId < 60) ||
            (block.chainid == 7777777 && mintVectorId < 20) ||
            (block.chainid == 999 && mintVectorId < 10) ||
            (block.chainid == 10 && mintVectorId < 11) ||
            (block.chainid == 420 && mintVectorId < 3) ||
            (block.chainid == 137 && mintVectorId < 7) ||
            (block.chainid == 80001 && mintVectorId < 16));
        */
    }

    /* solhint-disable code-complexity */
    /**
     * @notice Process payments (sale + mint fee) for classic vectors (direct + gated)
     * @param vectorId Vector ID
     * @param numToMint Number of tokens being minted
     * @param msgSender Minter
     * @param currency Sale currency
     * @param salePrice Sale price
     * @param salePaymentRecipient Sale payment recipient
     */
    function _processClassicVectorPayments(
        bytes32 vectorId,
        uint256 numToMint,
        address msgSender,
        address currency,
        uint256 salePrice,
        address payable salePaymentRecipient
    ) private {
        address _oracle = _mintFeeOracle;
        uint256 mintFeeCap = IMintFeeOracle(_oracle).getClassicVectorMintFeeCap(
            vectorId,
            numToMint,
            msgSender,
            currency
        );
        uint256 mintFeeEtherValue = currency == address(0) ? mintFeeCap : 0;
        uint256 saleAmount = numToMint * salePrice;
        if (currency == address(0)) {
            if (mintFeeEtherValue + saleAmount != msg.value) {
                _revert(InvalidPaymentAmount.selector);
            }
            if (saleAmount > 0) {
                // pay in native gas token
                _processNativeGasTokenPayment(saleAmount, salePaymentRecipient, vectorId);
            }
        } else if (saleAmount > 0) {
            // pay in ERC20
            // tx.origin instead of msgSender for referrals
            _processERC20Payment(saleAmount, salePaymentRecipient, tx.origin, currency, vectorId);
        }

        _processClassicVectorMintFee(
            mintFeeCap,
            msgSender,
            currency,
            _oracle,
            salePaymentRecipient,
            vectorId,
            mintFeeEtherValue,
            salePrice == 0
        );
    }

    /**
     * @notice Helper util to process the classic vector mint fee
     */
    function _processClassicVectorMintFee(
        uint256 mintFeeCap,
        address msgSender,
        address currency,
        address _oracle,
        address salePaymentRecipient,
        bytes32 vectorId,
        uint256 mintFeeEtherValue,
        bool isSaleFree
    ) private {
        if (mintFeeCap > 0) {
            if (currency != address(0)) {
                // send erc20 mint fee cap to the mint fee oracle
                // tx.origin instead of msgSender for referrals
                IERC20(currency).transferFrom(tx.origin, _oracle, mintFeeCap);
            }
            uint256 creatorPayout = IMintFeeOracle(_oracle).processClassicVectorMintFeeCap{ value: mintFeeEtherValue }(
                vectorId,
                isSaleFree,
                salePaymentRecipient,
                currency,
                mintFeeCap,
                msgSender
            );
            if (creatorPayout != 0) {
                emit CreatorRewardPayout(vectorId, currency, salePaymentRecipient, creatorPayout);
            }
        }
    }

    /* solhint-enable code-complexity */

    /**
     * @notice Deterministically produce mechanic vector ID from mechanic vector inputs
     * @param metadata Mechanic vector metadata
     * @param seed Used to seed uniqueness
     */
    function _produceMechanicVectorId(
        MechanicVectorMetadata memory metadata,
        uint96 seed
    ) private pure returns (bytes32 mechanicVectorId) {
        mechanicVectorId = keccak256(
            abi.encodePacked(
                metadata.contractAddress,
                metadata.editionId,
                metadata.mechanic,
                metadata.isEditionBased,
                seed
            )
        );
    }

    /* solhint-disable max-line-length */
    /**
     * @notice Get claim typehash
     */
    function _getClaimTypeHash() private pure returns (bytes32) {
        return
            keccak256(
                "Claim(address currency,address contractAddress,address claimer,address paymentRecipient,uint256 pricePerToken,uint64 numTokensToMint,uint256 maxClaimableViaVector,uint256 maxClaimablePerUser,uint256 editionId,uint256 claimExpiryTimestamp,bytes32 claimNonce,bytes32 offchainVectorId)"
            );
    }

    /**
     * @notice Get series claim typehash
     */
    function _getSeriesClaimTypeHash() private pure returns (bytes32) {
        return
            keccak256(
                "SeriesClaim(address currency,address contractAddress,address claimer,address paymentRecipient,uint256 pricePerToken,uint64 maxPerTxn,uint64 maxClaimableViaVector,uint64 maxClaimablePerUser,uint64 claimExpiryTimestamp,bytes32 claimNonce,bytes32 offchainVectorId)"
            );
    }

    /* solhint-enable max-line-length */

    /**
     * @notice Return abi-encoded claim part one
     * @param claim Claim
     */
    function _claimABIEncoded1(Claim calldata claim) private pure returns (bytes memory) {
        return
            abi.encode(
                _getClaimTypeHash(),
                claim.currency,
                claim.contractAddress,
                claim.claimer,
                claim.paymentRecipient,
                claim.pricePerToken,
                claim.numTokensToMint,
                claim.maxClaimableViaVector,
                claim.maxClaimablePerUser,
                claim.editionId,
                claim.claimExpiryTimestamp,
                claim.claimNonce
            );
    }

    /**
     * @notice Return abi-encoded series claim part one
     * @param claim SeriesClaim
     */
    function _seriesClaimABIEncoded(SeriesClaim calldata claim) private pure returns (bytes memory) {
        return
            abi.encode(
                _getSeriesClaimTypeHash(),
                claim.currency,
                claim.contractAddress,
                claim.claimer,
                claim.paymentRecipient,
                claim.pricePerToken,
                claim.maxPerTxn,
                claim.maxClaimableViaVector,
                claim.maxClaimablePerUser,
                claim.claimExpiryTimestamp,
                claim.claimNonce,
                claim.offchainVectorId
            );
    }

    /**
     * @notice Return abi-encoded claim part two
     * @param offchainVectorId Offchain vector ID of claim
     */
    function _claimABIEncoded2(bytes32 offchainVectorId) private pure returns (bytes memory) {
        return abi.encode(offchainVectorId);
    }

    /**
     * @notice Compose abridged vector metadata into a `uint256`
     * @param paused If the abridged vector is paused
     * @param flexibleData Flexible data
     */
    function _composeAbridgedVectorMetadata(bool paused, uint128 flexibleData) private pure returns (uint256) {
        uint256 metadata = 0;
        if (paused) {
            metadata = metadata | _BITMASK_AV_PAUSED;
        }
        metadata = metadata | (uint256(flexibleData) << 128);

        return metadata;
    }

    /**
     * @notice Decompose abridged vector metadata from a `uint256` into its constituent parts
     * @param packedMetadata Packed abridged vector metadata
     */
    function _decomposeAbridgedVectorMetadata(uint256 packedMetadata) private pure returns (bool, uint128) {
        bool paused = packedMetadata & _BITMASK_AV_PAUSED != 0;
        uint128 flexibleData = uint128(packedMetadata >> _BITPOS_AV_FLEXIBLE_DATA);

        return (paused, flexibleData);
    }

    /**
     * @notice Grab paused status for an onchain abridged mint vector
     * @param packedMetadata Packed abridged vector metadata
     */
    function _isVectorPaused(uint256 packedMetadata) private pure returns (bool) {
        return packedMetadata & _BITMASK_AV_PAUSED != 0;
    }

    /**
     * @dev For more efficient reverts.
     */
    function _revert(bytes4 errorSelector) private pure {
        assembly {
            mstore(0x00, errorSelector)
            revert(0x00, 0x04)
        }
    }
}

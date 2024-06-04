// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./MechanicMintManagerClientUpgradeable.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @notice Highlight <> Verisart mint mechanic
 */
contract VerisartMechanic is MechanicMintManagerClientUpgradeable, UUPSUpgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /**
     * @notice Throw when mint recipient cannot receive the mints, due to hitting the per-vector limit
     */
    error VectorMintLimitExceeded();

    /**
     * @notice Throw when mint recipient cannot receive the mints, due to hitting the per-user limit
     */
    error RecipientUserMintLimitExceeded();

    /**
     * @notice Throw when vector configuration is invalid
     */
    error InvalidVectorConfig();

    /**
     * @notice Throw when caller is unauthorized
     */
    error Unauthorized();

    /**
     * @notice Throw when admin is invalid to add or remove
     */
    error InvalidAdmin();

    /**
     * @notice Throw when minter is invalid to add or remove
     */
    error InvalidMinter();

    /**
     * @notice Throw when signed mint has used claim ID
     */
    error ClaimUsed();

    /**
     * @notice Throw when mechanic ID is invalid (missing mechanic vector on MintManager)
     */
    error InvalidMechanicID();

    /**
     * @notice Throw when attempting to mint via signature on a mint where sig-based mints are disallowed
     */
    error SignedMintingDisabled();

    /**
     * @notice Verisart vector data
     */
    struct VerisartVector {
        uint48 size; // size == 0 means unlimited
        uint48 supply;
        uint32 maxClaimableByUser; // maxClaimableByUser == 0 means unlimited
        bool signedMintingDisabled;
        // remaining slots for future data
    }

    /**
     * @notice Verisart vector update config (used for gas efficiency)
     */
    struct VerisartUpdateConfig {
        bool updateSize;
        bool updateMaxClaimableByUser;
        bool updateSignedMintingDisabled;
    }

    /**
     * @notice Admins
     */
    EnumerableSet.AddressSet private _admins;

    /**
     * @notice Allowed global minters
     */
    EnumerableSet.AddressSet private _globalMinters;

    /**
     * @notice Allowed minters per vector (indexed by hash(mechanicVectorId, minter))
     */
    mapping(bytes32 => bool) private _vectorLevelMinters;

    /**
     * @notice Data per vector
     */
    mapping(bytes32 => VerisartVector) private _vectors;

    /**
     * @notice Track number of mints per recipient per vector
     */
    mapping(bytes32 => mapping(address => uint32)) private _mintsPerRecipient;

    /**
     * @notice Track signed mints to avoid replay attacks
     */
    mapping(bytes32 => bool) private _signedMints;

    /**
     * @notice Constants that help with EIP-712, signature based minting
     */
    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");

    bytes32 private constant _MINT_SIGNED_TYPEHASH =
        keccak256("VerisartMint(address sender,address to,bytes32 mechanicVectorId,bytes32 claimNonce)");

    /**
     * @notice Emitted when vector is created
     */
    event VerisartVectorCreated(bytes32 indexed mechanicVectorId);

    /**
     * @notice Emitted when vector is updated
     */
    event VerisartVectorUpdated(bytes32 indexed mechanicVectorId);

    /**
     * @notice Emitted when mint is processed
     */
    event VerisartMint(
        bytes32 indexed mechanicVectorId,
        address indexed minterOrSigner,
        bool indexed signatureBased,
        address recipient,
        uint32 numToMint
    );

    /**
     * @notice Events emitted during admin and minter re-configurations
     */
    event AdminAdded(address indexed admin, address by);
    event AdminRemoved(address indexed admin, address by);
    event GlobalMinterAdded(address indexed globalMinter, address by);
    event GlobalMinterRemoved(address indexed globalMinter, address by);
    event VectorLevelMinterAdded(bytes32 indexed mechanicVectorId, address indexed vectorLevelMinter, address by);
    event VectorLevelMinterRemoved(bytes32 indexed mechanicVectorId, address indexed vectorLevelMinter, address by);

    /**
     * @notice Enforce caller to be an admin
     */
    modifier onlyAdmin() {
        if (!_admins.contains(msg.sender)) {
            _revert(Unauthorized.selector);
        }
        _;
    }

    /**
     * @notice Enforce caller to be an admin, the collection contract itself, or the collection owner
     */
    modifier onlyVectorAdmin(bytes32 mechanicVectorId) {
        MechanicVectorMetadata memory metadata = _getMechanicVectorMetadata(mechanicVectorId);
        if (metadata.contractAddress == address(0) || metadata.mechanic != address(this)) {
            _revert(InvalidMechanicID.selector);
        }
        if (
            !_admins.contains(msg.sender) &&
            metadata.contractAddress != msg.sender &&
            OwnableUpgradeable(metadata.contractAddress).owner() != msg.sender
        ) {
            _revert(Unauthorized.selector);
        }
        _;
    }

    /**
     * @notice Initialize mechanic contract
     * @param _mintManager Mint manager address
     * @param platform Platform
     * @param initialAdmin Initial admin
     * @param initialGlobalMinter Initial global minter
     */
    function initialize(
        address _mintManager,
        address platform,
        address initialAdmin,
        address initialGlobalMinter
    ) external initializer {
        __MechanicMintManagerClientUpgradeable_initialize(_mintManager, platform);
        if (initialAdmin != address(0)) {
            _admins.add(initialAdmin);
        }
        if (initialGlobalMinter != address(0)) {
            _globalMinters.add(initialGlobalMinter);
        }
    }

    /**
     * @notice Create a Verisart mint vector
     * @param mechanicVectorId Global mechanic vector ID
     * @param vectorData Vector data, to be deserialized into Verisart vector data
     */
    function createVector(bytes32 mechanicVectorId, bytes memory vectorData) external onlyMintManager {
        (uint48 size, uint32 maxClaimableByUser) = abi.decode(vectorData, (uint48, uint32));
        VerisartVector memory _vector = VerisartVector(size, 0, maxClaimableByUser, false);

        if (size != 0 || maxClaimableByUser != 0) {
            _vectors[mechanicVectorId] = _vector;
        }

        emit VerisartVectorCreated(mechanicVectorId);
    }

    /**
     * @notice Update a Verisart mint vector
     * @dev Caller must either be the collection contract itself, the collection owner, or an admin
     * @param mechanicVectorId Global mechanic vector ID
     * @param newVector New vector fields
     * @param updateConfig Config denoting what fields on vector to updatae
     */
    function updateVector(
        bytes32 mechanicVectorId,
        VerisartVector calldata newVector,
        VerisartUpdateConfig calldata updateConfig
    ) external onlyVectorAdmin(mechanicVectorId) {
        // one slot, so load entirety into memory
        VerisartVector memory _vector = _vectors[mechanicVectorId];

        if (updateConfig.updateSize) {
            if (newVector.size < _vector.supply) {
                _revert(InvalidVectorConfig.selector);
            }
            _vector.size = newVector.size;
        }
        if (updateConfig.updateMaxClaimableByUser) {
            _vector.maxClaimableByUser = newVector.maxClaimableByUser;
        }
        if (updateConfig.updateSignedMintingDisabled) {
            _vector.signedMintingDisabled = newVector.signedMintingDisabled;
        }
        _vectors[mechanicVectorId] = _vector;

        emit VerisartVectorUpdated(mechanicVectorId);
    }

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
        _processMint(mechanicVectorId, numToMint, recipient, minter, data);
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
        _processMint(mechanicVectorId, uint32(tokenIds.length), recipient, minter, data);
    }

    /**
     * @notice Add an admin
     * @param admin Admin to add
     */
    function addAdmin(address admin) external onlyOwner {
        if (!_admins.add(admin)) {
            _revert(InvalidAdmin.selector);
        }

        emit AdminAdded(admin, msg.sender);
    }

    /**
     * @notice Remove an admin
     * @param admin Admin to remove
     */
    function removeAdmin(address admin) external onlyOwner {
        if (!_admins.remove(admin)) {
            _revert(InvalidAdmin.selector);
        }

        emit AdminRemoved(admin, msg.sender);
    }

    /**
     * @notice Add a global minter
     * @param globalMinter Global minter to add
     */
    function addGlobalMinter(address globalMinter) external onlyAdmin {
        if (!_globalMinters.add(globalMinter)) {
            _revert(InvalidMinter.selector);
        }

        emit GlobalMinterAdded(globalMinter, msg.sender);
    }

    /**
     * @notice Remove a global minter
     * @param globalMinter Global minter to remove
     */
    function removeGlobalMinter(address globalMinter) external onlyAdmin {
        if (!_globalMinters.remove(globalMinter)) {
            _revert(InvalidMinter.selector);
        }

        emit GlobalMinterRemoved(globalMinter, msg.sender);
    }

    /**
     * @notice Add a vector-level minter
     * @param mechanicVectorId ID of vector to add vector-level minter to
     * @param vectorLevelMinter Vector level minter to add
     */
    function addVectorLevelMinter(
        bytes32 mechanicVectorId,
        address vectorLevelMinter
    ) external onlyVectorAdmin(mechanicVectorId) {
        bytes32 permissionId = keccak256(abi.encodePacked(mechanicVectorId, vectorLevelMinter));
        if (_vectorLevelMinters[permissionId]) {
            _revert(InvalidMinter.selector);
        } else {
            _vectorLevelMinters[permissionId] = true;
        }

        emit VectorLevelMinterAdded(mechanicVectorId, vectorLevelMinter, msg.sender);
    }

    /**
     * @notice Remove a vector-level minter
     * @param mechanicVectorId ID of vector to remove vector-level minter from
     * @param vectorLevelMinter Vector level minter to remove
     */
    function removeVectorLevelMinter(
        bytes32 mechanicVectorId,
        address vectorLevelMinter
    ) external onlyVectorAdmin(mechanicVectorId) {
        bytes32 permissionId = keccak256(abi.encodePacked(mechanicVectorId, vectorLevelMinter));
        if (!_vectorLevelMinters[permissionId]) {
            _revert(InvalidMinter.selector);
        } else {
            _vectorLevelMinters[permissionId] = false;
        }

        emit VectorLevelMinterRemoved(mechanicVectorId, vectorLevelMinter, msg.sender);
    }

    /**
     * @notice Return vector data
     * @param mechanicVectorId Global mechanic vector ID
     */
    function getVectorData(bytes32 mechanicVectorId) external view returns (VerisartVector memory) {
        return _vectors[mechanicVectorId];
    }

    /**
     * @notice Return vector supply
     * @param mechanicVectorId Global mechanic vector ID
     */
    function getVectorSupply(bytes32 mechanicVectorId) external view returns (uint64) {
        return _vectors[mechanicVectorId].supply;
    }

    /**
     * @notice Return vector size
     * @param mechanicVectorId Global mechanic vector ID
     */
    function getVectorSize(bytes32 mechanicVectorId) external view returns (uint64) {
        return _vectors[mechanicVectorId].size;
    }

    /**
     * @notice Returns if signed minting is allowed for the vector
     * @param mechanicVectorId ID of vector to check
     */
    function signedMintingAllowed(bytes32 mechanicVectorId) external view returns (bool) {
        return !_vectors[mechanicVectorId].signedMintingDisabled;
    }

    /**
     * @notice Return global minters
     */
    function globalMinters() external view returns (address[] memory) {
        return _globalMinters.values();
    }

    /**
     * @notice Return admins
     */
    function admins() external view returns (address[] memory) {
        return _admins.values();
    }

    /**
     * @notice Compatible identifier
     */
    function minterType() external pure returns (string memory) {
        return "VerisartHighlightIntegrationMechanic";
    }

    /**
     * @notice Return if a minter is a global minter
     * @param minter Minter to check
     */
    function isGlobalMinter(address minter) public view returns (bool) {
        return _globalMinters.contains(minter);
    }

    /**
     * @notice Return if minter is enabled as a vector-level minter for a given vector
     * @param mechanicVectorId ID of vector
     * @param minter Minter to check
     */
    function isVectorLevelMinter(bytes32 mechanicVectorId, address minter) public view returns (bool) {
        return _vectorLevelMinters[keccak256(abi.encodePacked(mechanicVectorId, minter))];
    }

    /* solhint-disable no-empty-blocks */
    /**
     * @notice Limit upgrades of contract to VerisartMechanic owner
     * @param // New implementation address
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}

    /**
     * @notice Process Verisart mint
     * @param mechanicVectorId Mechanic vector ID
     * @param numToMint Number of tokens to mint
     * @param recipient Mint recipient
     * @param minter Original caller of mint on MintManager or signer of mint
     * @param data Mint signature data (if applicable)
     */
    function _processMint(
        bytes32 mechanicVectorId,
        uint32 numToMint,
        address recipient,
        address minter,
        bytes calldata data
    ) private {
        (bool isSignatureBased, address minterOrSigner) = _validateMinterOrSigner(
            mechanicVectorId,
            minter,
            recipient,
            data
        );
        // one slot, so load entirety into memory
        VerisartVector memory _vector = _vectors[mechanicVectorId];

        if (isSignatureBased && _vector.signedMintingDisabled) {
            _revert(SignedMintingDisabled.selector);
        }
        uint48 newVectorSupply = _vector.supply + numToMint;
        if (newVectorSupply > _vector.size && _vector.size != 0) {
            _revert(VectorMintLimitExceeded.selector);
        }
        uint32 newUserSupply = _mintsPerRecipient[mechanicVectorId][recipient] + numToMint;
        if (newUserSupply > _vector.maxClaimableByUser && _vector.maxClaimableByUser != 0) {
            _revert(RecipientUserMintLimitExceeded.selector);
        }

        _vectors[mechanicVectorId].supply = newVectorSupply;
        _mintsPerRecipient[mechanicVectorId][recipient] = newUserSupply;

        emit VerisartMint(mechanicVectorId, minterOrSigner, isSignatureBased, recipient, numToMint);
    }

    /**
     * @notice Recover address of signer and update relevant state
     * @param args Input to signature
     * @param claimNonce Claim identifier
     * @param signature Signature
     * @param mechanicVectorId ID of vector
     */
    function _checkSigned(
        bytes memory args,
        bytes32 claimNonce,
        bytes memory signature,
        bytes32 mechanicVectorId
    ) private returns (address) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeperator(), keccak256(args)));
        if (_signedMints[claimNonce]) {
            _revert(ClaimUsed.selector);
        }
        _signedMints[claimNonce] = true;
        return ECDSA.recover(digest, signature);
    }

    /**
     * @notice Validate minter or signer
     * @param mechanicVectorId Mechanic vector ID
     * @param minter Original minting address
     * @param recipient Mint recipient
     * @param data Mint signature data (optional)
     */
    function _validateMinterOrSigner(
        bytes32 mechanicVectorId,
        address minter,
        address recipient,
        bytes calldata data
    ) private returns (bool, address) {
        bool isSignatureBased = false;
        if (data.length > 0) {
            isSignatureBased = true;
            (bytes32 claimNonce, bytes memory signature) = abi.decode(data, (bytes32, bytes));

            minter = _checkSigned(
                abi.encode(_MINT_SIGNED_TYPEHASH, minter, recipient, mechanicVectorId, claimNonce),
                claimNonce,
                signature,
                mechanicVectorId
            );
        }
        if (!isGlobalMinter(minter) && !isVectorLevelMinter(mechanicVectorId, minter)) {
            _revert(Unauthorized.selector);
        }
        return (isSignatureBased, minter);
    }

    /**
     * @notice Return EIP712 domain seperator
     */
    function _getDomainSeperator() private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _DOMAIN_TYPEHASH,
                    keccak256("Verisart"),
                    keccak256("1"),
                    block.chainid,
                    address(this),
                    0xf84c063feaae44fa2f4a846cf2dadc08b50b6a5b0b04bed3d70ed9fa1a199edc // verisart salt
                )
            );
    }
}

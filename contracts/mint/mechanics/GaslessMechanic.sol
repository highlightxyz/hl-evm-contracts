// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./MechanicMintManagerClientUpgradeable.sol";
import "../../erc721/interfaces/IEditionCollection.sol";
import "../../erc721/interfaces/IERC721GeneralSupplyMetadata.sol";
import "../../observability/IGengineObservability.sol";
import "./interfaces/IManifold1155Burn.sol";
import "../../erc1155/interfaces/IERC1155Standard.sol";
import "./interfaces/IRelayReceiver.sol";

import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @notice Gasless mechanic
 * @author highlight.xyz
 */
contract GaslessMechanic is MechanicMintManagerClientUpgradeable, UUPSUpgradeable {
    using EnumerableSet for EnumerableSet.UintSet;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    /**
     * @notice Throw when an action is unauthorized
     */
    error Unauthorized();

    /**
     * @notice Throw when signer of signature is invalid
     */
    error InvalidSigner();

    /**
     * @notice Throw when it is invalid to mint on a vector
     */
    error InvalidMint();

    /**
     * @notice Throw when it is invalid to mint a number of tokens
     */
    error InvalidMintAmount();

    /**
     * @notice Throw when it is invalid to sponsor
     */
    error InvalidSponsor();

    /**
     * @notice Throw when a vector is already created with a mechanic vector ID
     */
    error VectorAlreadyCreated();

    /**
     * @notice Throw when the vector update is invalid
     */
    error InvalidUpdate();

    /**
     * @notice Throw when code gets into impossible state
     */
    error ImpossibleState();

    /**
     * @notice Throw when an internal transfer of ether fails
     */
    error EtherSendFailed();

    /**
     * @notice Throw when a claim is invalid
     */
    error InvalidClaim();

    /**
     * @notice Throw when the sponsor amount is invalid
     */
    error InvalidSponsorAmount();

    /**
     * @notice Errors to throw when adding / removing bids from user bid ids
     */
    error BidAlreadyAdded();
    error BidAlreadyReclaimed();

    /**
     * @notice Throw when currency isn't supported
     */
    error CurrencyNotSupported();

    /**
     * @notice Throw when signature is invalid
     */
    error InvalidSignature();

    /**
     * @notice Throw when burn id has been used already
     */
    error UsedBurnId();

    /**
     * @notice Gasless vector
     */
    struct Vector {
        uint64 maxClaimablePerUser;
        uint64 maxClaimableViaVector;
        uint64 numMinted;
        uint64 numSponsored;
    }

    /**
     * @notice Config used to control updating of fields in Vector
     */
    struct VectorUpdateConfig {
        bool updateMaxUserClaimableViaVector;
        bool updateMaxTotalClaimableViaVector;
    }

    /**
     * @notice Sponsor structure
     * @param mechanicVectorId Mechanic vector ID
     * @param pricePerToken Price per token
     * @param mintFeePerToken Mint fee per token
     * @param gasPerToken Gas to deliver token
     * @param currency Currency
     * @param vectorPaymentRecipient Vector payment recipient
     * @param claimExpiryTimestamp Claim expiry timestamp
     * @param chainId Chain id
     */
    struct GaslessSponsorConfig {
        bytes32 mechanicVectorId;
        uint256 pricePerToken;
        uint256 mintFeePerToken;
        uint256 gasPerToken;
        address currency;
        address vectorPaymentRecipient;
        uint48 claimExpiryTimestamp;
        uint48 chainId;
    }

    /**
     * @notice Sponsor structure
     * @param mechanicVectorId Mechanic vector ID
     * @param pricePerToken Price per token
     * @param mintFeePerToken Mint fee per token
     * @param vectorPaymentRecipient Vector payment recipient
     * @param claimExpiryTimestamp Claim expiry timestamp
     * @param chainId Chain id
     * @param txTo Address to send funds to, to top up gas tank
     * @param txValue Value to send gas tank
     * @param numToSponsor Number to sponsor
     * @param txData Data to send to gas tank
     */
    struct GaslessSponsorConfigV2 {
        bytes32 mechanicVectorId;
        uint256 pricePerToken;
        uint256 mintFeePerToken;
        address vectorPaymentRecipient;
        uint48 claimExpiryTimestamp;
        uint48 chainId;
        address txTo;
        uint256 txValue;
        uint64 numToSponsor;
        bytes txData;
    }

    /**
     * @notice Constants that help with EIP-712, signature based minting
     */
    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");

    /* solhint-disable max-line-length */
    bytes32 private constant _GASLESS_SPONSOR_CONFIG_TYPESHASH =
        keccak256(
            "GaslessSponsorConfig(bytes32 mechanicVectorId,uint256 pricePerToken,uint256 mintFeePerToken,uint256 gasPerToken,address currency,address vectorPaymentRecipient,uint48 claimExpiryTimestamp,uint48 chainId)"
        );
    /* solhint-enable max-line-length */

    /**
     * @notice Stores gasless vector, indexed by global mechanic vector id
     */
    mapping(bytes32 => Vector) private vector;

    /**
     * @notice Stores user claims per vector
     */
    mapping(bytes32 => mapping(address => uint64)) private _numUserClaimed;

    /**
     * @notice Stores used burn ids per crosschain redemption vectors
     */
    mapping(bytes32 => EnumerableSet.Bytes32Set) private _usedBurnIds;

    /**
     * @notice Emitted when a mint vector is created
     */
    event GaslessVectorCreated(bytes32 indexed mechanicVectorId);

    /**
     * @notice Emitted when a mint vector is updated
     */
    event GaslessVectorUpdated(bytes32 indexed mechanicVectorId);

    /**
     * @notice Emitted when mints are sponsored
     */
    event GaslessSponsor(
        bytes32 indexed mechanicVectorId,
        address indexed sponsor,
        uint64 numSponsored,
        uint256 pricePerToken,
        uint256 mintFeePerToken,
        uint256 gasPerToken,
        address currency,
        address paymentRecipient
    );

    /**
     * @notice Emitted when sponsored mints are redeemed
     */
    event SponsoredMint(
        bytes32 indexed mechanicVectorId,
        address indexed mintRecipient,
        uint64 indexed initialSponsorId,
        address feeCollector,
        address currency,
        uint256 fee,
        uint32 numMinted
    );

    /**
     * @notice Emitted when crosschain redemption is fulfilled
     */
    event CrosschainRedemption(
        bytes32 indexed mechanicVectorId,
        bytes32 indexed burnId,
        address indexed recipient,
        uint32 numToMint,
        bytes seed
    );

    /**
     * @notice Emitted for the seed based data on mint
     * @param sender contract emitting the event
     * @param contractAddress NFT contract token resides on
     * @param data custom mint data
     */
    event CustomMintData(address indexed sender, address indexed contractAddress, bytes data);

    /**
     * @notice Initialize mechanic contract
     * @param _mintManager Mint manager address
     * @param platform Platform owning the contract
     */
    function initialize(address _mintManager, address platform) external initializer {
        __MechanicMintManagerClientUpgradeable_initialize(_mintManager, platform);
    }

    /**
     * @notice Create a gasless mechanic vector
     * @param mechanicVectorId Global mechanic vector ID
     * @param vectorData Vector data, to be deserialized into gasless vector data
     */
    function createVector(bytes32 mechanicVectorId, bytes memory vectorData) external onlyMintManager {
        (uint64 maxClaimablePerUser, uint64 maxClaimableViaVector) = abi.decode(vectorData, (uint64, uint64));

        Vector memory _vector = Vector(maxClaimablePerUser, maxClaimableViaVector, 0, 0);

        vector[mechanicVectorId] = _vector;

        emit GaslessVectorCreated(mechanicVectorId);
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
        Vector calldata newVector,
        VectorUpdateConfig calldata updateConfig
    ) external {
        MechanicVectorMetadata memory metadata = _getMechanicVectorMetadata(mechanicVectorId);
        if (
            OwnableUpgradeable(metadata.contractAddress).owner() != msg.sender && metadata.contractAddress != msg.sender
        ) {
            _revert(Unauthorized.selector);
        }

        // rather than updating entire vector, update per-field
        if (updateConfig.updateMaxUserClaimableViaVector) {
            vector[mechanicVectorId].maxClaimablePerUser = newVector.maxClaimablePerUser;
        }
        if (updateConfig.updateMaxTotalClaimableViaVector) {
            vector[mechanicVectorId].maxClaimableViaVector = newVector.maxClaimableViaVector;
        }

        emit GaslessVectorUpdated(mechanicVectorId);
    }

    /**
     * @notice Sponsor mints
     */
    function sponsorMints(
        GaslessSponsorConfig calldata sponsorConfig,
        bytes calldata signature,
        uint64 numToSponsor
    ) external payable {
        _validateSponsorConfig(sponsorConfig, signature);

        if (numToSponsor == 0) {
            _revert(InvalidSponsor.selector);
        }

        Vector memory _vector = vector[sponsorConfig.mechanicVectorId];
        uint64 newNumSponsored = _vector.numSponsored + numToSponsor;
        if (newNumSponsored > _vector.maxClaimableViaVector && _vector.maxClaimableViaVector != 0) {
            _revert(InvalidSponsor.selector);
        }
        vector[sponsorConfig.mechanicVectorId].numSponsored = newNumSponsored;

        if (sponsorConfig.currency != address(0)) {
            _revert(InvalidSponsor.selector);
        }

        // validate ether amount, send mint fee to HL, send price to paymentRecipient
        uint256 amountToRecipient = sponsorConfig.pricePerToken * numToSponsor;
        uint256 amountToPlatform = sponsorConfig.mintFeePerToken * numToSponsor;

        if (amountToRecipient == 0) {
            MechanicVectorMetadata memory metadata = _getMechanicVectorMetadata(sponsorConfig.mechanicVectorId);
            amountToRecipient = _is1155(metadata.contractAddress)
                ? ((amountToPlatform * 8) / 10)
                : amountToPlatform / 2;
            amountToPlatform = amountToPlatform - amountToRecipient;
        }

        if (amountToRecipient + amountToPlatform + (sponsorConfig.gasPerToken * numToSponsor) > msg.value) {
            _revert(InvalidSponsorAmount.selector);
        }
        if (amountToRecipient > 0) {
            _sendEther(amountToRecipient, payable(sponsorConfig.vectorPaymentRecipient), "");
        }
        if (amountToPlatform > 0) {
            _sendEther(amountToPlatform, payable(owner()), "");
        }

        emit GaslessSponsor(
            sponsorConfig.mechanicVectorId,
            msg.sender,
            numToSponsor,
            sponsorConfig.pricePerToken,
            sponsorConfig.mintFeePerToken,
            sponsorConfig.gasPerToken,
            sponsorConfig.currency,
            sponsorConfig.vectorPaymentRecipient
        );
    }

    /**
     * @notice Sponsor mints (v2)
     */
    function sponsorMintsV2(GaslessSponsorConfigV2 calldata sponsorConfig, bytes calldata signature) external payable {
        _validateSponsorConfigV2(sponsorConfig, signature);

        if (sponsorConfig.numToSponsor == 0) {
            _revert(InvalidSponsor.selector);
        }

        Vector memory _vector = vector[sponsorConfig.mechanicVectorId];
        uint64 newNumSponsored = _vector.numSponsored + sponsorConfig.numToSponsor;
        if (newNumSponsored > _vector.maxClaimableViaVector && _vector.maxClaimableViaVector != 0) {
            _revert(InvalidSponsor.selector);
        }
        vector[sponsorConfig.mechanicVectorId].numSponsored = newNumSponsored;

        // validate ether amount, send mint fee to HL, send price to paymentRecipient
        uint256 amountToRecipient = sponsorConfig.pricePerToken * sponsorConfig.numToSponsor;
        uint256 amountToPlatform = sponsorConfig.mintFeePerToken * sponsorConfig.numToSponsor;

        // splitting free mints
        if (amountToRecipient == 0) {
            MechanicVectorMetadata memory metadata = _getMechanicVectorMetadata(sponsorConfig.mechanicVectorId);
            amountToRecipient = _is1155(metadata.contractAddress)
                ? ((amountToPlatform * 8) / 10)
                : amountToPlatform / 2;
            amountToPlatform = amountToPlatform - amountToRecipient;
        }

        if (amountToRecipient + amountToPlatform + sponsorConfig.txValue > msg.value) {
            _revert(InvalidSponsorAmount.selector);
        }
        if (amountToRecipient > 0) {
            _sendEther(amountToRecipient, payable(sponsorConfig.vectorPaymentRecipient), "");
        }
        if (amountToPlatform > 0) {
            _sendEther(amountToPlatform, payable(owner()), "");
        }
        if (sponsorConfig.txValue > 0) {
            IRelayReceiver(sponsorConfig.txTo).forward{ value: sponsorConfig.txValue }(sponsorConfig.txData);
        }

        emit GaslessSponsor(
            sponsorConfig.mechanicVectorId,
            msg.sender,
            sponsorConfig.numToSponsor,
            sponsorConfig.pricePerToken,
            sponsorConfig.mintFeePerToken,
            sponsorConfig.txValue,
            sponsorConfig.txTo,
            sponsorConfig.vectorPaymentRecipient
        );
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
        _processMint(mechanicVectorId, minter, recipient, numToMint, data);
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
        _processMint(mechanicVectorId, minter, recipient, uint32(tokenIds.length), data);
    }

    /* solhint-disable no-empty-blocks */
    receive() external payable {}

    fallback() external payable {}

    /**
     * @notice State readers
     */
    function getRawVector(bytes32 mechanicVectorId) external view returns (Vector memory _vector) {
        _vector = vector[mechanicVectorId];
    }

    function getVectorState(
        bytes32 mechanicVectorId
    ) external view returns (Vector memory _vector, uint256 collectionSupply, uint256 collectionSize) {
        _vector = vector[mechanicVectorId];
        (collectionSupply, collectionSize) = _collectionSupplyAndSize(mechanicVectorId);
    }

    function getUserClaimed(bytes32 mechanicVectorId, address user) external view returns (uint64) {
        return _numUserClaimed[mechanicVectorId][user];
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
     * @param minter Minter
     * @param recipient Mint recipient
     * @param numToMint Number of tokens to mint
     * @param data Mechanic mint data (signature)
     */
    function _processMint(
        bytes32 mechanicVectorId,
        address minter,
        address recipient,
        uint32 numToMint,
        bytes calldata data
    ) private {
        // no more fee and fee collector for gelato
        // (uint256 fee, address feeCollector, bytes memory customData) = abi.decode(data, (uint256, address, bytes));

        Vector memory _vector = vector[mechanicVectorId];
        uint64 newNumMinted = _vector.numMinted + numToMint;
        uint64 newNumUserClaimed = _numUserClaimed[mechanicVectorId][recipient] + numToMint;
        if (data.length > 0) {
            _validateCrosschainRedeemSignature(mechanicVectorId, numToMint, recipient, data);
        } else {
            if (newNumMinted > _vector.numSponsored) {
                _revert(InvalidMintAmount.selector);
            }

            if (newNumUserClaimed > _vector.maxClaimablePerUser && _vector.maxClaimablePerUser != 0) {
                _revert(InvalidMintAmount.selector);
            }
        }

        vector[mechanicVectorId].numMinted = newNumMinted;
        _numUserClaimed[mechanicVectorId][recipient] = newNumUserClaimed;

        // no more fee to pay to gelato
        // _sendEther(fee, payable(feeCollector));

        emit SponsoredMint(mechanicVectorId, recipient, _vector.numMinted + 1, address(0), address(0), 0, numToMint);
    }

    /**
     * @notice Send ether to a recipient
     */
    function _sendEther(uint256 amount, address payable recipient, bytes memory txData) private {
        (bool sent, ) = recipient.call{ value: amount }(txData);
        if (!sent) {
            _revert(EtherSendFailed.selector);
        }
    }

    /**
     * @notice Validate sponsor event signature
     * @param sponsorConfig GaslessSponsorConfig
     * @param signature Sponsor config signature
     */
    function _validateSponsorConfig(GaslessSponsorConfig memory sponsorConfig, bytes calldata signature) private {
        bytes32 claimId = keccak256(
            abi.encode(
                _GASLESS_SPONSOR_CONFIG_TYPESHASH,
                sponsorConfig.mechanicVectorId,
                sponsorConfig.pricePerToken,
                sponsorConfig.mintFeePerToken,
                sponsorConfig.gasPerToken,
                sponsorConfig.currency,
                sponsorConfig.vectorPaymentRecipient,
                sponsorConfig.claimExpiryTimestamp,
                sponsorConfig.chainId
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeperator(), claimId));

        address signer = ECDSA.recover(digest, signature);
        if (
            signer == address(0) ||
            !_isPlatformExecutor(signer) ||
            uint48(block.timestamp) > sponsorConfig.claimExpiryTimestamp
        ) {
            _revert(InvalidSignature.selector);
        }

        if (block.chainid != sponsorConfig.chainId) {
            _revert(InvalidClaim.selector);
        }
    }

    /**
     * @notice Validate sponsor event v2 signature
     * @param sponsorConfig GaslessSponsorConfigV2
     * @param signature Sponsor config signature
     */
    function _validateSponsorConfigV2(GaslessSponsorConfigV2 memory sponsorConfig, bytes calldata signature) private {
        bytes32 claimId = keccak256(
            abi.encode(
                _gaslessSponsorConfigV2Typehash(),
                sponsorConfig.mechanicVectorId,
                sponsorConfig.pricePerToken,
                sponsorConfig.mintFeePerToken,
                sponsorConfig.vectorPaymentRecipient,
                sponsorConfig.claimExpiryTimestamp,
                sponsorConfig.chainId,
                sponsorConfig.txTo,
                sponsorConfig.txValue,
                sponsorConfig.numToSponsor,
                sponsorConfig.txData
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeperator(), claimId));

        address signer = ECDSA.recover(digest, signature);
        if (
            signer == address(0) ||
            !_isPlatformExecutor(signer) ||
            uint48(block.timestamp) > sponsorConfig.claimExpiryTimestamp
        ) {
            _revert(InvalidSignature.selector);
        }

        if (block.chainid != sponsorConfig.chainId) {
            _revert(InvalidClaim.selector);
        }
    }

    /**
     * @notice Validate crosschain redeem signature
     */
    function _validateCrosschainRedeemSignature(
        bytes32 mechanicVectorId,
        uint32 numToMint,
        address recipient,
        bytes memory data
    ) private {
        (bytes32 burnId, uint48 claimExpiryTimestamp, bytes memory seed, bytes memory signature) = abi.decode(
            data,
            (bytes32, uint48, bytes, bytes)
        );
        bytes32 redeemId = keccak256(
            abi.encode(
                _crosschainRedeemTypehash(),
                mechanicVectorId,
                numToMint,
                burnId,
                recipient,
                block.chainid,
                claimExpiryTimestamp,
                keccak256(seed)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeperator(), redeemId));

        address signer = ECDSA.recover(digest, signature);
        if (signer == address(0) || !_isPlatformExecutor(signer) || uint48(block.timestamp) > claimExpiryTimestamp) {
            _revert(InvalidSignature.selector);
        }

        if (!_usedBurnIds[mechanicVectorId].add(burnId)) {
            _revert(UsedBurnId.selector);
        }

        if (seed.length > 0) {
            emit CustomMintData(address(this), address(0), seed);
        }
        emit CrosschainRedemption(mechanicVectorId, burnId, recipient, numToMint, seed);
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
     * @notice Return EIP712 domain seperator
     */
    function _getDomainSeperator() private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    _DOMAIN_TYPEHASH,
                    keccak256("GaslessMechanic"),
                    keccak256("1"),
                    block.chainid,
                    address(this),
                    0x954386A2b103A8AD2B933E44Ea148036f73DC4B906c0fea200392fd413d44da0 // gasless mechanic salt
                )
            );
    }

    /**
     * @notice Return EIP712 crosschain redemption typehash
     */
    function _crosschainRedeemTypehash() private view returns (bytes32) {
        /* solhint-disable max-line-length */
        return
            keccak256(
                "CrosschainRedeem(bytes32 mechanicVectorId,uint32 numToMint,bytes32 burnId,address recipient,uint256 chainId,uint48 claimExpiryTimestamp,bytes seed)"
            );
        /* solhint-enable max-line-length */
    }

    function _gaslessSponsorConfigV2Typehash() private view returns (bytes32) {
        /* solhint-disable max-line-length */
        return
            keccak256(
                "GaslessSponsorConfigV2(bytes32 mechanicVectorId,uint256 pricePerToken,uint256 mintFeePerToken,address vectorPaymentRecipient,uint48 claimExpiryTimestamp,uint48 chainId,address txTo,uint256 txValue,uint64 numToSponsor,bytes txData)"
            );
        /* solhint-enable max-line-length */
    }

    /**
     * @notice Return if collection is an ERC1155 contract
     */
    function _is1155(address collectionContract) private view returns (bool) {
        try IERC1155Standard(collectionContract).highlightContractStandardHash() returns (bytes32 standardHash) {
            return standardHash == 0x3a9654d81ac4dafbb9a2fb1cd3efa3de2783ae40b06b17a456bf5922ed02a3a7;
        } catch Error(string memory reason) {
            return false;
        } catch {
            return false;
        }
    }
}

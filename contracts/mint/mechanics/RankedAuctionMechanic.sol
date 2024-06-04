// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./MechanicMintManagerClientUpgradeable.sol";
import "../../erc721/interfaces/IEditionCollection.sol";
import "../../erc721/interfaces/IERC721GeneralSupplyMetadata.sol";
import "../../observability/IGengineObservability.sol";
import "./interfaces/IManifold1155Burn.sol";

import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @notice Ranked auctions
 * @author highlight.xyz
 */
contract RankedAuctionMechanic is MechanicMintManagerClientUpgradeable, UUPSUpgradeable {
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
     * @notice Throw when it is invalid to bid
     */
    error InvalidBid();

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
     * @notice Throw when a claim signature is invalid
     */
    error InvalidSignature();

    /**
     * @notice Errors to throw when adding / removing bids from user bid ids
     */
    error BidAlreadyAdded();
    error BidAlreadyReclaimed();

    /**
     * @notice On-chain mint vector (stored data)
     * @param startTimestamp When minting opens on vector
     * @param endTimestamp When minting ends on vector
     * @param paymentRecipient Payment recipient
     * @param maxUserClaimableViaVector Max number of tokens that can be minted by user via vector
     * @param maxTotalClaimableViaVector Max number of tokens that can be minted via vector
     * @param latestBidId Total number of bids (valid or invalid, deleted or not)
     * @param currency Currency used for payment. Native gas token, if zero address
     * @param bidFundsClaimed Bid funds claimed
     * @param reserveBid Reserve bid
     * @param maxEndTimestamp Maximium time the auction can go till (given extensions)
     * @param actionId Action ID (create / update bid)
     */
    struct Vector {
        uint48 startTimestamp;
        uint48 endTimestamp;
        address payable paymentRecipient;
        uint32 maxUserClaimableViaVector;
        uint32 maxTotalClaimableViaVector;
        uint32 latestBidId;
        address currency;
        bool bidFundsClaimed;
        uint96 reserveBid;
        uint48 maxEndTimestamp;
        uint96 actionId;
    }

    /**
     * @notice Bid
     * @dev Only handles bids below ~10B ether
     * @param bidAmount Amount of bid
     * @param bidder Bidder
     */
    struct Bid {
        uint96 bidAmount;
        address bidder;
    }

    /**
     * @notice User bids' metadata
     * @param numClaimed Number of valid bids redeemed for a token (after mint ends)
     * @param numBids Number of bids by user
     */
    struct UserBidsMetadata {
        uint32 numClaimed;
        uint32 numBids;
    }

    /**
     * @notice Config used to control updating of fields in Vector
     */
    struct VectorUpdateConfig {
        bool updateStartTimestamp;
        bool updateEndTimestamp;
        bool updateMaxEndTimestamp;
        bool updateMaxUserClaimableViaVector;
        bool updateMaxTotalClaimableViaVector;
        bool updatePaymentRecipient;
        bool updateCurrency;
        bool updateReserveBid;
    }

    /**
     * @notice Used to claim funds from an invalid bid, mint tokens + claim rebate if eligible, claim auction earnings
     */
    struct RankedAuctionsClaim {
        bytes32 mechanicVectorId;
        uint256 rebateAmount;
        address claimer;
        uint32 claimerNumValidBids;
        uint48 claimExpiryTimestamp;
        uint256 cumulativeBidAmount;
        uint32 bidId;
        uint8 claimType;
    }

    /**
     * @notice Constants that help with EIP-712, signature based minting
     */
    bytes32 private constant _DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");

    /* solhint-disable max-line-length */
    bytes32 private constant _CLAIM_TYPEHASH =
        keccak256(
            "RankedAuctionsClaim(bytes32 mechanicVectorId,uint256 rebateAmount,address claimer,uint32 claimerNumValidBids,uint48 claimExpiryTimestamp,uint256 cumulativeBidAmount,uint32 bidId,uint8 claimType)"
        );
    /* solhint-enable max-line-length */

    /**
     * @notice Stores seed based vector, indexed by global mechanic vector id
     */
    mapping(bytes32 => Vector) private vector;

    /**
     * @notice Stores vector's current validity hash
     */
    mapping(bytes32 => bytes32) private vectorValidityHash;

    /**
     * @notice System-wide vector ids to bids by their ids
     */
    mapping(bytes32 => mapping(uint32 => Bid)) public bids;

    /**
     * @notice System-wide vector ids to user's bids metadata
     */
    mapping(bytes32 => mapping(address => UserBidsMetadata)) private _userBidsMetadata;

    /**
     * @notice System-wide vector ids to user's bid ids
     */
    mapping(bytes32 => mapping(address => EnumerableSet.UintSet)) private _userBidIds;

    /**
     * @notice System-wide used claims
     */
    mapping(bytes32 => EnumerableSet.Bytes32Set) private _usedClaims;

    /**
     * @notice Emitted when a mint vector is created
     */
    event RankedAuctionCreated(bytes32 indexed mechanicVectorId);

    /**
     * @notice Emitted when a mint vector is updated
     */
    event RankedAuctionUpdated(bytes32 indexed mechanicVectorId);

    /**
     * @notice Emitted when a bid is created or updated
     */
    event BidCreatedOrUpdated(
        bytes32 indexed mechanicVectorId,
        bytes32 indexed newValidityHash,
        uint96 indexed actionId,
        uint32 bidId,
        address bidder,
        uint96 bidAmount,
        address currency,
        bool created
    );

    /**
     * @notice Emitted when bid funds are reclaimed
     */
    event BidReclaimed(bytes32 indexed mechanicVectorId, uint32 indexed bidId, uint96 amount, address currency);

    /**
     * @notice Emitted when bid funds are claimed
     */
    event AuctionEarningsClaimed(
        bytes32 indexed mechanicVectorId,
        uint256 earnings,
        address paymentRecipient,
        address currency
    );

    /**
     * @notice Emitted when auction is lengthened
     */
    event AuctionLengthened(bytes32 indexed mechanicVectorId, uint48 newEndTimestamp);

    /**
     * @notice Initialize mechanic contract
     * @param _mintManager Mint manager address
     * @param platform Platform owning the contract
     */
    function initialize(address _mintManager, address platform) external initializer {
        __MechanicMintManagerClientUpgradeable_initialize(_mintManager, platform);
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
            uint48 maxEndTimestamp,
            address paymentRecipient,
            uint32 maxUserClaimableViaVector,
            uint32 maxTotalClaimableViaVector,
            uint96 reserveBid,
            address currency
        ) = abi.decode(vectorData, (uint48, uint48, uint48, address, uint32, uint32, uint96, address));

        if (maxTotalClaimableViaVector == 0) {
            _revert(InvalidUpdate.selector);
        }

        uint48 st = startTimestamp == 0 ? uint48(block.timestamp) : startTimestamp;
        Vector memory _vector = Vector(
            st,
            endTimestamp == 0 ? uint48(st + 604800) : endTimestamp, // arbitrarily set for a week
            payable(paymentRecipient),
            maxUserClaimableViaVector,
            maxTotalClaimableViaVector,
            0,
            currency,
            false,
            reserveBid,
            maxEndTimestamp,
            0
        );

        vector[mechanicVectorId] = _vector;

        emit RankedAuctionCreated(mechanicVectorId);
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
        if (updateConfig.updateStartTimestamp) {
            vector[mechanicVectorId].startTimestamp = newVector.startTimestamp == 0
                ? uint48(block.timestamp)
                : newVector.startTimestamp;
        }
        if (updateConfig.updateEndTimestamp) {
            if (newVector.endTimestamp == 0) {
                _revert(InvalidUpdate.selector);
            }
            vector[mechanicVectorId].endTimestamp = newVector.endTimestamp;
        }
        if (updateConfig.updateMaxEndTimestamp) {
            if (newVector.maxEndTimestamp == 0) {
                _revert(InvalidUpdate.selector);
            }
            vector[mechanicVectorId].maxEndTimestamp = newVector.maxEndTimestamp;
        }
        if (updateConfig.updateMaxUserClaimableViaVector) {
            vector[mechanicVectorId].maxUserClaimableViaVector = newVector.maxUserClaimableViaVector;
        }
        if (updateConfig.updateMaxTotalClaimableViaVector) {
            if (
                newVector.maxTotalClaimableViaVector == 0 ||
                newVector.maxTotalClaimableViaVector < vector[mechanicVectorId].maxTotalClaimableViaVector
            ) {
                _revert(InvalidUpdate.selector);
            }
            vector[mechanicVectorId].maxTotalClaimableViaVector = newVector.maxTotalClaimableViaVector;
        }
        if (updateConfig.updateCurrency) {
            if (vector[mechanicVectorId].latestBidId > 0) {
                _revert(InvalidUpdate.selector);
            }
            vector[mechanicVectorId].currency = newVector.currency;
        }
        if (updateConfig.updatePaymentRecipient) {
            vector[mechanicVectorId].paymentRecipient = newVector.paymentRecipient;
        }
        if (updateConfig.updateReserveBid) {
            if (vector[mechanicVectorId].latestBidId > 0) {
                _revert(InvalidUpdate.selector);
            }
            vector[mechanicVectorId].reserveBid = newVector.reserveBid;
        }

        emit RankedAuctionUpdated(mechanicVectorId);
    }

    /**
     * @notice Create a new bid
     */
    function bid(bytes32 mechanicVectorId, uint96 bidAmount) external payable {
        Vector memory _vector = vector[mechanicVectorId];
        uint32 newUserNumBids = _userBidsMetadata[mechanicVectorId][msg.sender].numBids + 1;
        if (
            _vector.endTimestamp < uint48(block.timestamp) ||
            _vector.startTimestamp > uint48(block.timestamp) ||
            bidAmount < _vector.reserveBid ||
            bidAmount != msg.value ||
            (_vector.maxUserClaimableViaVector != 0 && newUserNumBids > uint256(_vector.maxUserClaimableViaVector))
        ) {
            _revert(InvalidBid.selector);
        }

        _vector.latestBidId += 1;
        _vector.actionId += 1;

        bids[mechanicVectorId][_vector.latestBidId] = Bid(bidAmount, msg.sender);
        if (!_userBidIds[mechanicVectorId][msg.sender].add(uint256(_vector.latestBidId))) {
            // impossible state
            _revert(BidAlreadyAdded.selector);
        }
        _userBidsMetadata[mechanicVectorId][msg.sender].numBids = newUserNumBids;
        vector[mechanicVectorId].latestBidId = _vector.latestBidId;
        vector[mechanicVectorId].actionId = _vector.actionId;

        if (_vector.endTimestamp - uint48(block.timestamp) <= 300) {
            _vector.endTimestamp = _vector.maxEndTimestamp != 0
                ? (
                    _vector.maxEndTimestamp > uint48(block.timestamp) + 300
                        ? uint48(block.timestamp) + 300
                        : _vector.maxEndTimestamp
                )
                : uint48(block.timestamp) + 300;
            vector[mechanicVectorId].endTimestamp = _vector.endTimestamp;
            emit AuctionLengthened(mechanicVectorId, _vector.endTimestamp);
        }

        bytes32 newValidityHash = _updateValidityHash(mechanicVectorId, _vector.latestBidId, bidAmount);

        emit BidCreatedOrUpdated(
            mechanicVectorId,
            newValidityHash,
            _vector.actionId,
            _vector.latestBidId,
            msg.sender,
            bidAmount,
            _vector.currency,
            true
        );
    }

    /**
     * @notice Update a bid
     */
    function updateBid(bytes32 mechanicVectorId, uint32 bidId, uint96 newBidAmount) external payable {
        Vector memory _vector = vector[mechanicVectorId];
        Bid memory _bid = bids[mechanicVectorId][bidId];
        if (
            newBidAmount <= _bid.bidAmount ||
            _bid.bidder == address(0) ||
            _vector.endTimestamp < uint48(block.timestamp) ||
            _vector.startTimestamp > uint48(block.timestamp) ||
            newBidAmount < _vector.reserveBid ||
            msg.value != newBidAmount - _bid.bidAmount
        ) {
            _revert(InvalidBid.selector);
        }
        if (_bid.bidder != msg.sender) {
            _revert(Unauthorized.selector);
        }

        _vector.actionId += 1;

        bids[mechanicVectorId][bidId].bidAmount = newBidAmount;
        vector[mechanicVectorId].actionId = _vector.actionId;

        if (_vector.endTimestamp - uint48(block.timestamp) <= 300) {
            uint48 newEndTimestamp = _vector.maxEndTimestamp != 0
                ? (
                    _vector.maxEndTimestamp > uint48(block.timestamp) + 300
                        ? uint48(block.timestamp) + 300
                        : _vector.maxEndTimestamp
                )
                : uint48(block.timestamp) + 300;
            vector[mechanicVectorId].endTimestamp = newEndTimestamp;
            emit AuctionLengthened(mechanicVectorId, newEndTimestamp);
        }

        bytes32 newValidityHash = _updateValidityHash(mechanicVectorId, bidId, newBidAmount);

        emit BidCreatedOrUpdated(
            mechanicVectorId,
            newValidityHash,
            _vector.actionId,
            bidId,
            msg.sender,
            newBidAmount,
            _vector.currency,
            false
        );
    }

    /**
     * @notice Claim back funds for a bid that is currently invalid (effectively deleting the bid)
     */
    function reclaimBid(RankedAuctionsClaim calldata claim, bytes calldata claimSignature) external {
        // validate signature
        _validateClaim(claim, msg.sender, 1, claimSignature);

        Bid memory _bid = bids[claim.mechanicVectorId][claim.bidId];
        if (_bid.bidder != claim.claimer) {
            _revert(Unauthorized.selector);
        }

        _sendEther(_bid.bidAmount, payable(_bid.bidder));

        emit BidReclaimed(claim.mechanicVectorId, claim.bidId, _bid.bidAmount, vector[claim.mechanicVectorId].currency);

        // remove bid
        _userBidsMetadata[claim.mechanicVectorId][claim.claimer].numBids -= 1;
        if (!_userBidIds[claim.mechanicVectorId][claim.claimer].remove(claim.bidId)) {
            _revert(BidAlreadyReclaimed.selector);
        }
        delete bids[claim.mechanicVectorId][claim.bidId];
    }

    /**
     * @notice Withdraw auction earnings to payment recipient
     */
    function withdrawAuctionEarnings(RankedAuctionsClaim calldata claim, bytes calldata claimSignature) external {
        _validateClaim(claim, msg.sender, 2, claimSignature);

        Vector memory _vector = vector[claim.mechanicVectorId];
        // currently, only native gas token supported
        if (
            uint48(block.timestamp) <= _vector.endTimestamp || _vector.currency != address(0) || _vector.bidFundsClaimed
        ) {
            _revert(InvalidClaim.selector);
        }

        // 5% to platform
        uint256 platformAmount = (claim.cumulativeBidAmount * 500) / 10000;
        _sendEther(platformAmount, payable(owner()));
        _sendEther(claim.cumulativeBidAmount - platformAmount, _vector.paymentRecipient);

        vector[claim.mechanicVectorId].bidFundsClaimed = true;

        emit AuctionEarningsClaimed(
            claim.mechanicVectorId,
            claim.cumulativeBidAmount,
            _vector.paymentRecipient,
            _vector.currency
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
        _processMint(mechanicVectorId, minter, numToMint, data);
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
     * @notice State readers
     */
    function getRawVector(bytes32 mechanicVectorId) external view returns (Vector memory _vector) {
        _vector = vector[mechanicVectorId];
    }

    function getVectorState(
        bytes32 mechanicVectorId
    )
        external
        view
        returns (Vector memory _vector, bytes32 validityHash, uint256 collectionSupply, uint256 collectionSize)
    {
        _vector = vector[mechanicVectorId];
        validityHash = vectorValidityHash[mechanicVectorId];
        (collectionSupply, collectionSize) = _collectionSupplyAndSize(mechanicVectorId);
    }

    function getBids(bytes32 mechanicVectorId, uint32[] calldata bidIds) external view returns (Bid[] memory) {
        uint256 bidIdsLength = bidIds.length;
        Bid[] memory _bids = new Bid[](bidIdsLength);
        for (uint256 i = 0; i < bidIdsLength; i++) {
            _bids[i] = bids[mechanicVectorId][bidIds[i]];
        }
        return _bids;
    }

    function getUserBids(
        bytes32 mechanicVectorId,
        address user
    ) external view returns (Bid[] memory, uint256[] memory bidIds, uint32 numBids, uint32 numClaimed) {
        UserBidsMetadata memory metadata = _userBidsMetadata[mechanicVectorId][user];

        uint256[] memory _bidIds = _userBidIds[mechanicVectorId][user].values();
        uint256 bidIdsLength = _bidIds.length;
        Bid[] memory _bids = new Bid[](bidIdsLength);

        for (uint256 i = 0; i < bidIdsLength; i++) {
            _bids[i] = bids[mechanicVectorId][uint32(_bidIds[i])];
        }

        return (_bids, _bidIds, metadata.numBids, metadata.numClaimed);
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
     * @param numToMint Number of tokens to mint
     * @param data Mechanic mint data (signature)
     */
    function _processMint(bytes32 mechanicVectorId, address minter, uint32 numToMint, bytes calldata data) private {
        (RankedAuctionsClaim memory _claim, bytes memory claimSignature) = _unwrapRankedAuctionClaim(
            mechanicVectorId,
            data
        );

        _validateClaim(_claim, minter, 3, claimSignature);

        if (vector[mechanicVectorId].endTimestamp >= uint48(block.timestamp)) {
            _revert(InvalidMint.selector);
        }
        uint32 numClaimed = _userBidsMetadata[mechanicVectorId][minter].numClaimed;
        if (numToMint + numClaimed > _claim.claimerNumValidBids) {
            _revert(InvalidMintAmount.selector);
        }
        _userBidsMetadata[mechanicVectorId][minter].numClaimed = numClaimed + numToMint;

        // handle rebate
        if (_claim.rebateAmount > 0) {
            _sendEther(_claim.rebateAmount, payable(_claim.claimer));
        }
    }

    /**
     * @notice Send ether to a recipient
     */
    function _sendEther(uint256 amount, address payable recipient) private {
        (bool sent, ) = recipient.call{ value: amount }("");
        if (!sent) {
            _revert(EtherSendFailed.selector);
        }
    }

    /**
     * @notice Update vector's validity hash
     */
    function _updateValidityHash(bytes32 mechanicVectorId, uint32 bidId, uint96 bidAmount) private returns (bytes32) {
        bytes32 newValidityHash = keccak256(
            abi.encodePacked(vectorValidityHash[mechanicVectorId], mechanicVectorId, bidId, bidAmount)
        );
        vectorValidityHash[mechanicVectorId] = newValidityHash;
        return newValidityHash;
    }

    /**
     * @notice Validate claim
     * @param claim Claim
     * @param expectedClaimer Expected claimer
     * @param expectedClaimType Expected claim type
     * @param claimSignature Claim signature
     */
    function _validateClaim(
        RankedAuctionsClaim memory claim,
        address expectedClaimer,
        uint8 expectedClaimType,
        bytes memory claimSignature
    ) private {
        if (claim.claimer != expectedClaimer) {
            _revert(Unauthorized.selector);
        }
        if (claim.claimType != expectedClaimType) {
            _revert(InvalidClaim.selector);
        }
        bytes32 claimId = keccak256(
            abi.encode(
                _CLAIM_TYPEHASH,
                claim.mechanicVectorId,
                claim.rebateAmount,
                claim.claimer,
                claim.claimerNumValidBids,
                claim.claimExpiryTimestamp,
                claim.cumulativeBidAmount,
                claim.bidId,
                claim.claimType
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _getDomainSeperator(), claimId));

        address signer = ECDSA.recover(digest, claimSignature);
        if (
            signer == address(0) || !_isPlatformExecutor(signer) || uint48(block.timestamp) > claim.claimExpiryTimestamp
        ) {
            _revert(InvalidSignature.selector);
        }
        if (!_usedClaims[claim.mechanicVectorId].add(claimId)) {
            // claim already used
            _revert(InvalidClaim.selector);
        }
    }

    /**
     * @notice Validate mint claim
     * @param mechanicVectorId Mechanic vector id
     * @param data Mint data
     */
    function _unwrapRankedAuctionClaim(
        bytes32 mechanicVectorId,
        bytes calldata data
    ) private returns (RankedAuctionsClaim memory, bytes memory) {
        (
            uint256 rebateAmount,
            address claimer,
            uint32 claimerNumValidBids,
            uint48 claimExpiryTimestamp,
            uint256 cumulativeBidAmount,
            uint32 bidId,
            uint8 claimType,
            bytes memory claimSignature
        ) = abi.decode(data, (uint256, address, uint32, uint48, uint256, uint32, uint8, bytes));

        return (
            RankedAuctionsClaim(
                mechanicVectorId,
                rebateAmount,
                claimer,
                claimerNumValidBids,
                claimExpiryTimestamp,
                cumulativeBidAmount,
                bidId,
                claimType
            ),
            claimSignature
        );
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
                    keccak256("RankedAuctionMechanic"),
                    keccak256("1"),
                    block.chainid,
                    address(this),
                    0x960bb3ecd14c38754109e5fe3a3b72aa0434091106c0fea200392fd413d44da0 // ranked auction mechanic salt
                )
            );
    }
}

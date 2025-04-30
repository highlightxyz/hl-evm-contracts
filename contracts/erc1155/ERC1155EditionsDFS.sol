// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./interfaces/IERC1155EditionsDFS.sol";
import "./ERC1155Base.sol";
import "../utils/Ownable.sol";
import "../metadata/interfaces/IMetadataRenderer.sol";
import "../metadata/interfaces/IEditionsMetadataRenderer.sol";
import "../auction/interfaces/IAuctionManager.sol";
import "../erc721/interfaces/IEditionCollection.sol";

import "../tokenManager/interfaces/IPostTransfer.sol";
import "../tokenManager/interfaces/IPostBurn.sol";
import "../tokenManager/interfaces/ITokenManagerEditions.sol";
import "../erc721/interfaces/IERC721EditionMint.sol";
import "../utils/ERC1155/ERC1155Upgradeable.sol";
import "../mint/interfaces/IAbridgedMintVector.sol";
import "../mint/mechanics/interfaces/IMechanicMintManager.sol";
import "./interfaces/IERC1155Standard.sol";

/**
 * @title ERC1155 Editions
 * @author highlight.xyz
 * @notice Multiple Editions Per Collection
 * @dev Using Decentralized File Storage
 */
contract ERC1155EditionsDFS is
    IEditionCollection,
    IERC1155EditionsDFS,
    IERC721EditionMint,
    ERC1155Base,
    ERC1155Upgradeable,
    IERC1155Standard
{
    using EnumerableSet for EnumerableSet.AddressSet;

    /**
     * @notice Throw when edition doesn't exist
     */
    error EditionDoesNotExist();

    /**
     * @notice Throw when token doesn't exist
     */
    error TokenDoesNotExist();

    /**
     * @notice Throw when attempting to mint, while mint is frozen
     */
    error MintFrozen();

    /**
     * @notice Throw when tokens on edition are sold out
     */
    error SoldOut();

    /**
     * @notice Throw when edition size is invalid
     */
    error InvalidSize();

    /**
     * @notice Throw when edition burn is invalid
     */
    error InvalidBurn();

    /**
     * @notice Throw when edition metadata update is blocked
     */
    error MetadataUpdateBlocked();

    /**
     * @notice Throw when edition size update is invalid
     */
    error InvalidEditionSizeUpdate();

    /**
     * @notice Throw when edition size is updated
     */
    event HighlightUpdated1155EditionSize(uint256 indexed editionId, uint128 oldSize, uint128 newSize);

    /**
     * @notice Track each token's current supply and max supply
     */
    struct EditionSupply {
        uint128 currentSupply;
        uint128 maxSupply;
    }

    /**
     * @notice Contract metadata
     */
    string public contractURI;
    string public name;
    string public symbol;

    /**
     * @notice Keeps track of next token ID
     */
    uint256 public nextTokenId;

    /**
     * @notice Tracks each edition/token's supply
     */
    mapping(uint256 => EditionSupply) public editionSupply;

    /**
     * @notice Track metadata per edition
     */
    mapping(uint256 => string) private _editionURI;

    /**
     * @notice Emitted when edition is created
     * @param editionId Edition/token ID
     * @param size Edition size
     * @param editionTokenManager Token manager for edition
     */
    event EditionCreated(uint256 indexed editionId, uint256 indexed size, address indexed editionTokenManager);

    /**
     * @notice Initialize the contract
     * @param creator Creator/owner of contract
     * @param data Contract initialization data
     * @ param _contractURI Contract metadata
     * @ param _name Name of token edition
     * @ param _symbol Symbol of the token edition
     * @ param trustedForwarder Trusted minimal forwarder
     * @ param initialMinters Initial minters to register
     * @ param useMarketplaceFiltererRegistry Denotes whether to use marketplace filterer registry
     * @ param _observability Observability contract address
     */
    function initialize(address creator, bytes memory data) external initializer {
        (
            string memory _contractURI,
            string memory _name,
            string memory _symbol,
            address trustedForwarder,
            address[] memory initialMinters,
            bool useMarketplaceFiltererRegistry,
            address _observability
        ) = abi.decode(data, (string, string, string, address, address[], bool, address));

        IRoyaltyManager.Royalty memory _defaultRoyalty = IRoyaltyManager.Royalty(address(0), 0);
        _initialize(
            creator,
            _defaultRoyalty,
            address(0),
            _contractURI,
            _name,
            _symbol,
            trustedForwarder,
            initialMinters,
            useMarketplaceFiltererRegistry,
            _observability
        );
    }

    /**
     * @notice Create edition
     * @param _editionUri Edition uri (metadata)
     * @param _editionSize Size of the Edition
     * @param _editionTokenManager Edition's token manager
     * @param editionRoyalty Edition royalty object for contract (optional)
     * @param mintVectorData Direct mint vector data
     * @notice Used to create a new Edition within the Collection
     */
    function createEdition(
        string memory _editionUri,
        uint256 _editionSize,
        address _editionTokenManager,
        IRoyaltyManager.Royalty memory editionRoyalty,
        bytes calldata mintVectorData
    ) external onlyOwner nonReentrant returns (uint256) {
        uint256 editionId = _createEdition(_editionUri, _editionSize, _editionTokenManager);
        if (editionRoyalty.recipientAddress != address(0)) {
            _royalties[editionId] = editionRoyalty;
        }

        if (mintVectorData.length > 0) {
            (
                address mintManager,
                address paymentRecipient,
                uint48 startTimestamp,
                uint48 endTimestamp,
                uint192 pricePerToken,
                uint48 tokenLimitPerTx,
                uint48 maxTotalClaimableViaVector,
                uint48 maxUserClaimableViaVector,
                address currency
            ) = abi.decode(
                    mintVectorData,
                    (address, address, uint48, uint48, uint192, uint48, uint48, uint48, address)
                );

            IAbridgedMintVector(mintManager).createAbridgedVector(
                IAbridgedMintVector.AbridgedVectorData(
                    uint160(address(this)),
                    startTimestamp,
                    endTimestamp,
                    uint160(paymentRecipient),
                    maxTotalClaimableViaVector,
                    0,
                    uint160(currency),
                    tokenLimitPerTx,
                    maxUserClaimableViaVector,
                    pricePerToken,
                    uint48(editionId), // cast down
                    true,
                    false,
                    0
                )
            );
        }

        return editionId;
    }

    /**
     * @notice Used to create a new Edition within the Collection
     * @param _editionUri Edition uri (metadata)
     * @param _editionSize Size of the Edition
     * @param _editionTokenManager Edition's token manager
     * @param editionRoyalty Edition royalty object for contract (optional)
     * @param mechanicVectorData Mechanic mint vector data
     * @ param mechanicVectorId Global mechanic vector ID
     * @ param mechanic Mechanic address
     * @ param mintManager Mint manager address
     * @ param vectorData Vector data
     */
    function createEditionWithMechanicVector(
        string memory _editionUri,
        uint256 _editionSize,
        address _editionTokenManager,
        IRoyaltyManager.Royalty memory editionRoyalty,
        bytes calldata mechanicVectorData
    ) external onlyOwner nonReentrant returns (uint256) {
        uint256 editionId = _createEdition(_editionUri, _editionSize, _editionTokenManager);
        if (editionRoyalty.recipientAddress != address(0)) {
            _royalties[editionId] = editionRoyalty;
        }

        if (mechanicVectorData.length > 0) {
            (uint96 seed, address mechanic, address mintManager, bytes memory vectorData) = abi.decode(
                mechanicVectorData,
                (uint96, address, address, bytes)
            );

            IMechanicMintManager(mintManager).registerMechanicVector(
                IMechanicData.MechanicVectorMetadata(address(this), uint96(editionId), mechanic, true, false, false),
                seed,
                vectorData
            );
        }

        return editionId;
    }

    /**
     * @notice Used to create a new Edition within the Collection
     * @param _editionUri Edition uri (metadata)
     * @param _editionSize Size of the Edition
     * @param _editionTokenManager Edition's token manager
     * @param editionRoyalty Edition royalty object for contract (optional)
     * @param mintVectorData Direct mint vector data
     * @param mechanicVectorData Mechanic mint vector data
     * @ param mechanicVectorId Global mechanic vector ID
     * @ param mechanic Mechanic address
     * @ param mintManager Mint manager address
     * @ param vectorData Vector data
     */
    function createEditionWithMechanicVectorAndPublicFixedPriceVector(
        string memory _editionUri,
        uint256 _editionSize,
        address _editionTokenManager,
        IRoyaltyManager.Royalty memory editionRoyalty,
        bytes calldata mintVectorData,
        bytes calldata mechanicVectorData
    ) external onlyOwner nonReentrant returns (uint256) {
        uint256 editionId = _createEdition(_editionUri, _editionSize, _editionTokenManager);
        if (editionRoyalty.recipientAddress != address(0)) {
            _royalties[editionId] = editionRoyalty;
        }

        if (mintVectorData.length > 0) {
            (
                address mintManager,
                address paymentRecipient,
                uint48 startTimestamp,
                uint48 endTimestamp,
                uint192 pricePerToken,
                uint48 tokenLimitPerTx,
                uint48 maxTotalClaimableViaVector,
                uint48 maxUserClaimableViaVector,
                address currency
            ) = abi.decode(
                    mintVectorData,
                    (address, address, uint48, uint48, uint192, uint48, uint48, uint48, address)
                );

            IAbridgedMintVector(mintManager).createAbridgedVector(
                IAbridgedMintVector.AbridgedVectorData(
                    uint160(address(this)),
                    startTimestamp,
                    endTimestamp,
                    uint160(paymentRecipient),
                    maxTotalClaimableViaVector,
                    0,
                    uint160(currency),
                    tokenLimitPerTx,
                    maxUserClaimableViaVector,
                    pricePerToken,
                    uint48(editionId), // cast down
                    true,
                    false,
                    0
                )
            );
        }

        if (mechanicVectorData.length > 0) {
            (uint96 seed, address mechanic, address mintManager, bytes memory vectorData) = abi.decode(
                mechanicVectorData,
                (uint96, address, address, bytes)
            );

            IMechanicMintManager(mintManager).registerMechanicVector(
                IMechanicData.MechanicVectorMetadata(address(this), uint96(editionId), mechanic, true, false, false),
                seed,
                vectorData
            );
        }

        return editionId;
    }

    /**
     * @notice See {IERC721EditionMint-mintOneToRecipient}
     */
    function mintOneToRecipient(
        uint256 editionId,
        address recipient
    ) external onlyMinter nonReentrant returns (uint256) {
        if (!_editionExists(editionId)) {
            _revert(EditionDoesNotExist.selector);
        }

        return _mintEditionsToOne(editionId, recipient, 1);
    }

    /**
     * @notice See {IERC721EditionMint-mintAmountToRecipient}
     */
    function mintAmountToRecipient(
        uint256 editionId,
        address recipient,
        uint256 amount
    ) external onlyMinter nonReentrant returns (uint256) {
        if (!_editionExists(editionId)) {
            _revert(EditionDoesNotExist.selector);
        }

        return _mintEditionsToOne(editionId, recipient, amount);
    }

    /**
     * @notice See {IERC721EditionMint-mintOneToRecipients}
     */
    function mintOneToRecipients(
        uint256 editionId,
        address[] memory recipients
    ) external onlyMinter nonReentrant returns (uint256) {
        if (!_editionExists(editionId)) {
            _revert(EditionDoesNotExist.selector);
        }

        return _mintEditions(editionId, recipients, 1);
    }

    /**
     * @notice See {IERC721EditionMint-mintAmountToRecipients}
     */
    function mintAmountToRecipients(
        uint256 editionId,
        address[] memory recipients,
        uint256 amount
    ) external onlyMinter nonReentrant returns (uint256) {
        if (!_editionExists(editionId)) {
            _revert(EditionDoesNotExist.selector);
        }

        return _mintEditions(editionId, recipients, amount);
    }

    /**
     * @notice Set contract name
     * @param newName New name
     * @param newSymbol New symbol
     * @param newContractUri New contractURI
     */
    function setContractMetadata(
        string calldata newName,
        string calldata newSymbol,
        string calldata newContractUri
    ) external onlyOwner {
        _setContractMetadata(newName, newSymbol);
        contractURI = newContractUri;

        observability.emitContractMetadataSet(newName, newSymbol, newContractUri);
    }

    /**
     * @notice Set an Edition's uri
     * @param editionId Edition to set uri for
     * @param _uri Uri to set on editions
     */
    function setEditionURI(uint256 editionId, string calldata _uri) external {
        address _manager = tokenManager(editionId);
        address msgSender = _msgSender();

        if (_manager == address(0)) {
            address tempOwner = owner();
            if (msgSender != tempOwner) {
                _revert(Unauthorized.selector);
            }
        } else {
            if (
                !ITokenManagerEditions(_manager).canUpdateEditionsMetadata(
                    address(this),
                    msgSender,
                    editionId,
                    bytes(_uri),
                    ITokenManagerEditions.FieldUpdated.other
                )
            ) {
                _revert(MetadataUpdateBlocked.selector);
            }
        }

        _editionURI[editionId] = _uri;

        uint256[] memory _ids = new uint256[](1);
        _ids[0] = editionId;
        string[] memory _uris = new string[](1);
        _uris[0] = _uri;
        observability.emitTokenURIsSet(_ids, _uris);
    }

    /**
     * @notice Set the edition size
     */
    function setEditionSize(uint256 editionId, uint128 newSize) external onlyOwner {
        if (!_editionExists(editionId)) {
            _revert(EditionDoesNotExist.selector);
        }
        EditionSupply memory editionMetadata = editionSupply[editionId];
        // cannot:
        // - currently update the size of an open edition
        // - currently update a limited edition to an open edition
        // update the size to a value lower than the current supply
        if (
            editionMetadata.maxSupply == 0 ||
            (editionMetadata.maxSupply != 0 && newSize == 0) ||
            newSize < editionMetadata.currentSupply
        ) {
            _revert(InvalidEditionSizeUpdate.selector);
        }

        emit HighlightUpdated1155EditionSize(editionId, editionMetadata.maxSupply, newSize);
        editionSupply[editionId].maxSupply = newSize;
    }

    /**
     * @notice See {IERC1155Standard-highlightContractStandardHash}
     */
    function highlightContractStandardHash() external view returns (bytes32) {
        return 0x3a9654d81ac4dafbb9a2fb1cd3efa3de2783ae40b06b17a456bf5922ed02a3a7;
    }

    /**
     * @notice See {IEditionCollection-getEditionDetails}
     */
    function getEditionDetails(uint256 editionId) external view returns (EditionDetails memory) {
        if (!_editionExists(editionId)) {
            _revert(EditionDoesNotExist.selector);
        }
        return _getEditionDetails(editionId);
    }

    /**
     * @notice See {IEditionCollection-getEditionsDetailsAndUri}
     */
    function getEditionsDetailsAndUri(
        uint256[] calldata editionIds
    ) external view returns (EditionDetails[] memory, string[] memory) {
        uint256 editionIdsLength = editionIds.length;
        EditionDetails[] memory editionsDetails = new EditionDetails[](editionIdsLength);
        string[] memory uris = new string[](editionIdsLength);

        for (uint256 i = 0; i < editionIdsLength; i++) {
            uris[i] = editionURI(editionIds[i]);
            editionsDetails[i] = _getEditionDetails(editionIds[i]);
        }

        return (editionsDetails, uris);
    }

    /**
     * @notice Total supply of NFTs on the Editions
     */
    function totalSupply() external view returns (uint256) {
        return nextTokenId - 1;
    }

    /**
     * @notice See {IERC1155-burn}. Overrides default behaviour to check associated tokenManager.
     */
    function burn(address from, uint256 tokenId, uint256 amount) public nonReentrant {
        address _manager = tokenManager(tokenId);
        address msgSender = _msgSender();
        uint128 _currentSupply = editionSupply[tokenId].currentSupply;
        if (amount > _currentSupply) {
            _revert(InvalidBurn.selector);
        }

        if (_manager != address(0) && IERC165Upgradeable(_manager).supportsInterface(type(IPostBurn).interfaceId)) {
            IPostBurn(_manager).postBurn(msgSender, from, tokenId);
        } else {
            // default to restricting burn to owner or operator if a valid TM isn't present
            if (!(isApprovedForAll(from, msgSender) || msgSender == from)) {
                _revert(Unauthorized.selector);
            }
        }

        _burn(from, tokenId, amount);
        editionSupply[tokenId].currentSupply = _currentSupply - uint128(amount);

        observability.emitTransferSingle(msgSender, from, address(0), tokenId, amount);
    }

    /**
     * @notice Conforms to ERC-2981.
     * @param _tokenId Token id
     * @param _salePrice Sale price of token
     */
    function royaltyInfo(
        uint256 _tokenId,
        uint256 _salePrice
    ) public view virtual override returns (address receiver, uint256 royaltyAmount) {
        return ERC1155Base.royaltyInfo(_tokenId, _salePrice);
    }

    /**
     * @notice See {IEditionCollection-getEditionId}
     */
    function getEditionId(uint256 tokenId) public view returns (uint256) {
        if (!_editionExists(tokenId)) {
            _revert(TokenDoesNotExist.selector);
        }
        return tokenId;
    }

    /**
     * @notice Used to get token manager of token id
     * @param tokenId ID of the token
     */
    function tokenManagerByTokenId(uint256 tokenId) public view returns (address) {
        return tokenManager(tokenId);
    }

    /**
     * @notice Get URI for given edition id
     * @param editionId edition id to get uri for
     */
    function editionURI(uint256 editionId) public view returns (string memory) {
        if (!_editionExists(editionId)) {
            _revert(EditionDoesNotExist.selector);
        }
        return _editionURI[editionId];
    }

    /**
     * @notice Get URI for given token id
     * @param tokenId token id to get uri for
     */
    function tokenURI(uint256 tokenId) public view returns (string memory) {
        if (!_editionExists(tokenId)) {
            _revert(TokenDoesNotExist.selector);
        }
        return _editionURI[tokenId];
    }

    /**
     * @notice Get URI for given token id
     * @param tokenId token id to get uri for
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        return tokenURI(tokenId);
    }

    /**
     * @notice See {IERC1155Upgradeable-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165Upgradeable, ERC1155Upgradeable) returns (bool) {
        return ERC1155Upgradeable.supportsInterface(interfaceId);
    }

    /**
     * @notice Private function to mint without any access checks. Called by the public edition minting functions.
     * @param editionId Edition being minted on
     * @param recipients Recipients of newly minted tokens
     * @param _amount Amount minted to each recipient
     */
    function _mintEditions(uint256 editionId, address[] memory recipients, uint256 _amount) internal returns (uint256) {
        uint256 recipientsLength = recipients.length;
        EditionSupply memory _editionSupply = editionSupply[editionId];
        uint256 newSupply = _editionSupply.currentSupply + (recipientsLength * _amount);

        if (_editionSupply.maxSupply > 0 && newSupply > _editionSupply.maxSupply) {
            _revert(SoldOut.selector);
        }

        for (uint256 i = 0; i < recipientsLength; i++) {
            _mint(recipients[i], editionId, _amount, "");
        }

        editionSupply[editionId].currentSupply = uint128(newSupply);

        return newSupply;
    }

    /**
     * @notice Private function to mint without any access checks. Called by the public edition minting functions.
     * @param editionId Edition being minted on
     * @param recipient Recipient of newly minted token
     * @param _amount Amount minted to recipient
     */
    function _mintEditionsToOne(uint256 editionId, address recipient, uint256 _amount) internal returns (uint256) {
        EditionSupply memory _editionSupply = editionSupply[editionId];
        uint256 newSupply = _editionSupply.currentSupply + _amount;

        if (_editionSupply.maxSupply > 0 && newSupply > _editionSupply.maxSupply) {
            _revert(SoldOut.selector);
        }

        _mint(recipient, editionId, _amount, "");

        editionSupply[editionId].currentSupply = uint128(newSupply);

        return newSupply;
    }

    /**
     * @notice Hook called after transfers
     * @param from Account token is being transferred from
     * @param to Account token is being transferred to
     * @param ids IDs of tokens being transferred
     * @param amounts Amounts of tokens being transferred
     * @ param data Data associated with transfer
     */
    function _afterTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory /* data */
    ) internal override {
        address msgSender = operator;
        uint256 idsLength = ids.length;

        for (uint256 i = 0; i < idsLength; i++) {
            address _manager = tokenManagerByTokenId(ids[i]);
            if (
                _manager != address(0) &&
                IERC165Upgradeable(_manager).supportsInterface(type(IPostTransfer).interfaceId)
            ) {
                IPostTransfer(_manager).postTransferFrom(msgSender, from, to, ids[i]);
            }
        }

        if (idsLength == 1) {
            observability.emitTransferSingle(msgSender, from, to, ids[0], amounts[0]);
        } else {
            observability.emitTransferBatch(msgSender, from, to, ids, amounts);
        }
    }

    /**
     * @notice Returns whether `editionId` exists.
     * @param editionId Id of edition being checked
     */
    function _editionExists(uint256 editionId) internal view returns (bool) {
        return editionId < nextTokenId;
    }

    /**
     * @notice Used for meta-transactions
     */
    function _msgSender() internal view override(ERC1155Base, ContextUpgradeable) returns (address sender) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    /**
     * @notice Used for meta-transactions
     */
    function _msgData() internal view override(ERC1155Base, ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    /**
     * @dev For more efficient reverts.
     */
    function _revert(bytes4 errorSelector) internal pure override(ERC1155Base, ERC1155Upgradeable) {
        ERC1155Base._revert(errorSelector);
    }

    /**
     * @notice Initialize the contract
     * @param creator Creator/owner of contract
     * @param defaultRoyalty Default royalty object for contract (optional)
     * @param _defaultTokenManager Default token manager for contract (optional)
     * @param _contractURI Contract metadata
     * @param _name Name of token edition
     * @param _symbol Symbol of the token edition
     * @param trustedForwarder Trusted minimal forwarder
     * @param initialMinters Initial minters to register
     * @param useMarketplaceFiltererRegistry Denotes whether to use marketplace filterer registry
     * @param _observability Observability contract address
     */
    function _initialize(
        address creator,
        IRoyaltyManager.Royalty memory defaultRoyalty,
        address _defaultTokenManager,
        string memory _contractURI,
        string memory _name,
        string memory _symbol,
        address trustedForwarder,
        address[] memory initialMinters,
        bool useMarketplaceFiltererRegistry,
        address _observability
    ) private {
        __ERC1155Base_initialize(creator, defaultRoyalty, _defaultTokenManager);
        _setContractMetadata(_name, _symbol);
        __ERC2771ContextUpgradeable__init__(trustedForwarder);
        // deprecate but keep input for backwards-compatibility:
        // __MarketplaceFilterer__init__(useMarketplaceFiltererRegistry);
        uint256 initialMintersLength = initialMinters.length;
        for (uint256 i = 0; i < initialMintersLength; i++) {
            _minters.add(initialMinters[i]);
        }
        nextTokenId = 1;
        contractURI = _contractURI;
        IObservabilityV3(_observability).emitEditions1155Deployed(address(this));
        observability = IObservabilityV3(_observability);
    }

    /**
     * @notice Create edition
     * @param _editionUri Edition uri (metadata)
     * @param _editionSize Size of the Edition
     * @param _editionTokenManager Edition's token manager
     * @notice Used to create a new Edition within the Collection
     */
    function _createEdition(
        string memory _editionUri,
        uint256 _editionSize,
        address _editionTokenManager
    ) private returns (uint256) {
        uint256 editionId = nextTokenId;
        nextTokenId = editionId + 1;
        editionSupply[editionId] = EditionSupply(0, uint128(_editionSize));
        _editionURI[editionId] = _editionUri;

        if (_editionTokenManager != address(0)) {
            if (!_isValidTokenManager(_editionTokenManager)) {
                _revert(InvalidManager.selector);
            }
            _managers[editionId] = _editionTokenManager;
        }

        emit EditionCreated(editionId, _editionSize, _editionTokenManager);

        return editionId;
    }

    /**
     * @dev Set name / symbol
     */
    function _setContractMetadata(string memory newName, string memory newSymbol) private {
        name = newName;
        symbol = newSymbol;
    }

    /**
     * @notice Get edition details
     * @param editionId Id of edition to get details for
     */
    function _getEditionDetails(uint256 editionId) private view returns (EditionDetails memory) {
        return
            EditionDetails("", editionSupply[editionId].maxSupply, editionSupply[editionId].currentSupply, editionId);
    }
}

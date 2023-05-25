// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./ERC721Base.sol";
import "../metadata/MetadataEncryption.sol";
import "../tokenManager/interfaces/IPostTransfer.sol";
import "../tokenManager/interfaces/IPostBurn.sol";
import "./interfaces/IERC721GeneralMint.sol";
import "../utils/ERC721/ERC721URIStorageUpgradeable.sol";
import "./MarketplaceFilterer/MarketplaceFilterer.sol";

/**
 * @title Generalized Base ERC721
 * @author highlight.xyz
 * @notice Generalized Base NFT smart contract
 */
abstract contract ERC721GeneralBase is
    ERC721Base,
    ERC721URIStorageUpgradeable,
    IERC721GeneralMint,
    MarketplaceFilterer
{
    using EnumerableSet for EnumerableSet.AddressSet;

    /**
     * @notice Total tokens minted
     */
    uint256 public supply;

    /**
     * @notice Contract metadata
     */
    string public contractURI;

    /**
     * @notice Limit the supply to take advantage of over-promising in summation with multiple mint vectors
     */
    uint256 public limitSupply;

    /**
     * @notice Emitted when uris are set for tokens
     * @param ids IDs of tokens to set uris for
     * @param uris Uris to set on tokens
     */
    event TokenURIsSet(uint256[] ids, string[] uris);

    /**
     * @notice Emitted when limit supply is set
     * @param newLimitSupply Limit supply to set
     */
    event LimitSupplySet(uint256 indexed newLimitSupply);

    /**
     * @notice See {IERC721GeneralMint-mintOneToOneRecipient}
     */
    function mintOneToOneRecipient(address recipient) external onlyMinter nonReentrant returns (uint256) {
        require(_mintFrozen == 0, "Mint frozen");

        uint256 tempSupply = supply;
        tempSupply++;
        _requireLimitSupply(tempSupply);

        _mint(recipient, tempSupply);
        supply = tempSupply;

        return tempSupply;
    }

    /**
     * @notice See {IERC721GeneralMint-mintAmountToOneRecipient}
     */
    function mintAmountToOneRecipient(address recipient, uint256 amount) external onlyMinter nonReentrant {
        require(_mintFrozen == 0, "Mint frozen");
        uint256 tempSupply = supply; // cache

        for (uint256 i = 0; i < amount; i++) {
            tempSupply++;
            _mint(recipient, tempSupply);
        }

        _requireLimitSupply(tempSupply);
        supply = tempSupply;
    }

    /**
     * @notice See {IERC721GeneralMint-mintOneToMultipleRecipients}
     */
    function mintOneToMultipleRecipients(address[] calldata recipients) external onlyMinter nonReentrant {
        require(_mintFrozen == 0, "Mint frozen");
        uint256 recipientsLength = recipients.length;
        uint256 tempSupply = supply; // cache

        for (uint256 i = 0; i < recipientsLength; i++) {
            tempSupply++;
            _mint(recipients[i], tempSupply);
        }

        _requireLimitSupply(tempSupply);
        supply = tempSupply;
    }

    /**
     * @notice See {IERC721GeneralMint-mintSameAmountToMultipleRecipients}
     */
    function mintSameAmountToMultipleRecipients(
        address[] calldata recipients,
        uint256 amount
    ) external onlyMinter nonReentrant {
        require(_mintFrozen == 0, "Mint frozen");
        uint256 recipientsLength = recipients.length;
        uint256 tempSupply = supply; // cache

        for (uint256 i = 0; i < recipientsLength; i++) {
            for (uint256 j = 0; j < amount; j++) {
                tempSupply++;
                _mint(recipients[i], tempSupply);
            }
        }

        _requireLimitSupply(tempSupply);
        supply = tempSupply;
    }

    /**
     * @notice See {IERC721GeneralMint-mintSpecificTokenToOneRecipient}
     */
    function mintSpecificTokenToOneRecipient(address recipient, uint256 tokenId) external onlyMinter nonReentrant {
        require(_mintFrozen == 0, "Mint frozen");

        uint256 tempSupply = supply;
        tempSupply++;

        uint256 _limitSupply = limitSupply;
        if (_limitSupply != 0) {
            require(tokenId <= _limitSupply, "Token not in range");
        }

        _mint(recipient, tokenId);
        supply = tempSupply;
    }

    /**
     * @notice See {IERC721GeneralMint-mintSpecificTokensToOneRecipient}
     */
    function mintSpecificTokensToOneRecipient(
        address recipient,
        uint256[] calldata tokenIds
    ) external onlyMinter nonReentrant {
        require(_mintFrozen == 0, "Mint frozen");

        uint256 tempSupply = supply;

        uint256 tokenIdsLength = tokenIds.length;
        uint256 _limitSupply = limitSupply;
        if (_limitSupply == 0) {
            // don't check that token id is within range, since _limitSupply being 0 implies unlimited range
            for (uint256 i = 0; i < tokenIdsLength; i++) {
                _mint(recipient, tokenIds[i]);
                tempSupply++;
            }
        } else {
            // check that token id is within range
            for (uint256 i = 0; i < tokenIdsLength; i++) {
                require(tokenIds[i] <= limitSupply, "Token not in range");
                _mint(recipient, tokenIds[i]);
                tempSupply++;
            }
        }

        supply = tempSupply;
    }

    /**
     * @notice Override base URI system for select tokens, with custom per-token metadata
     * @param ids IDs of tokens to override base uri system for with custom uris
     * @param uris Custom uris
     */
    function setTokenURIs(uint256[] calldata ids, string[] calldata uris) external nonReentrant {
        uint256 idsLength = ids.length;
        require(idsLength == uris.length, "Mismatched array lengths");

        for (uint256 i = 0; i < idsLength; i++) {
            _setTokenURI(ids[i], uris[i]);
        }

        emit TokenURIsSet(ids, uris);
        observability.emitTokenURIsSet(ids, uris);
    }

    /**
     * @notice Set base uri
     * @param newBaseURI New base uri to set
     */
    function setBaseURI(string calldata newBaseURI) external nonReentrant {
        require(bytes(newBaseURI).length > 0, "Empty string");

        address _manager = defaultManager;

        if (_manager == address(0)) {
            require(_msgSender() == owner(), "Not owner");
        } else {
            require(
                ITokenManager(_manager).canUpdateMetadata(_msgSender(), 0, bytes(newBaseURI)),
                "Can't update base uri"
            );
        }

        _setBaseURI(newBaseURI);
        observability.emitBaseUriSet(newBaseURI);
    }

    /**
     * @notice Set limit supply
     * @param _limitSupply Limit supply to set
     */
    function setLimitSupply(uint256 _limitSupply) external onlyOwner nonReentrant {
        // allow it to be 0, for post-mint
        limitSupply = _limitSupply;

        emit LimitSupplySet(_limitSupply);
        observability.emitLimitSupplySet(_limitSupply);
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
     * @notice Total supply of NFTs on the contract
     */
    function totalSupply() external view returns (uint256) {
        return supply;
    }

    /**
     * @notice See {IERC721-transferFrom}. Overrides default behaviour to check associated tokenManager.
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override nonReentrant onlyAllowedOperator(from) {
        ERC721Upgradeable.transferFrom(from, to, tokenId);

        address _manager = tokenManager(tokenId);
        if (_manager != address(0) && IERC165Upgradeable(_manager).supportsInterface(type(IPostTransfer).interfaceId)) {
            IPostTransfer(_manager).postTransferFrom(_msgSender(), from, to, tokenId);
        }

        observability.emitTransfer(from, to, tokenId);
    }

    /**
     * @notice See {IERC721-safeTransferFrom}. Overrides default behaviour to check associated tokenManager.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public virtual override nonReentrant onlyAllowedOperator(from) {
        ERC721Upgradeable.safeTransferFrom(from, to, tokenId, data);

        address _manager = tokenManager(tokenId);
        if (_manager != address(0) && IERC165Upgradeable(_manager).supportsInterface(type(IPostTransfer).interfaceId)) {
            IPostTransfer(_manager).postSafeTransferFrom(_msgSender(), from, to, tokenId, data);
        }

        observability.emitTransfer(from, to, tokenId);
    }

    /**
     * @notice See {IERC721-setApprovalForAll}.
     *         Overrides default behaviour to check MarketplaceFilterer allowed operators.
     */
    function setApprovalForAll(address operator, bool approved) public override onlyAllowedOperatorApproval(operator) {
        super.setApprovalForAll(operator, approved);
    }

    /**
     * @notice See {IERC721-approve}.
     *         Overrides default behaviour to check MarketplaceFilterer allowed operators.
     */
    function approve(address operator, uint256 tokenId) public override onlyAllowedOperatorApproval(operator) {
        super.approve(operator, tokenId);
    }

    /**
     * @notice See {IERC721-burn}. Overrides default behaviour to check associated tokenManager.
     */
    function burn(uint256 tokenId) public nonReentrant {
        address _manager = tokenManager(tokenId);
        address msgSender = _msgSender();

        if (_manager != address(0) && IERC165Upgradeable(_manager).supportsInterface(type(IPostBurn).interfaceId)) {
            address owner = ownerOf(tokenId);
            IPostBurn(_manager).postBurn(msgSender, owner, tokenId);
        } else {
            // default to restricting burn to owner or operator if a valid TM isn't present
            require(_isApprovedOrOwner(msgSender, tokenId), "Not owner or operator");
        }

        _burn(tokenId);

        observability.emitTransfer(msgSender, address(0), tokenId);
    }

    /**
     * @notice Overrides tokenURI to first rotate the token id
     * @param tokenId ID of token to get uri for
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        return ERC721URIStorageUpgradeable.tokenURI(tokenId);
    }

    /**
     * @notice See {IERC165-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165Upgradeable, ERC721Upgradeable) returns (bool) {
        return ERC721Upgradeable.supportsInterface(interfaceId);
    }

    /**
     * @notice Used for meta-transactions
     */
    function _msgSender() internal view override(ERC721Base, ContextUpgradeable) returns (address sender) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    /**
     * @notice Used for meta-transactions
     */
    function _msgData() internal view override(ERC721Base, ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    /**
     * @notice Override base URI system for select tokens, with custom per-token metadata
     * @param tokenId Token to set uri for
     * @param _uri Uri to set on token
     */
    function _setTokenURI(uint256 tokenId, string calldata _uri) private {
        address _manager = tokenManager(tokenId);
        address msgSender = _msgSender();

        address tempOwner = owner();
        if (_manager == address(0)) {
            require(msgSender == tempOwner, "Not owner");
        } else {
            require(ITokenManager(_manager).canUpdateMetadata(msgSender, tokenId, bytes(_uri)), "Can't update");
        }

        _tokenURIs[tokenId] = _uri;
    }

    /**
     * @notice Require the new supply of tokens after mint to be less than limit supply
     * @param newSupply New supply
     */
    function _requireLimitSupply(uint256 newSupply) private view {
        uint256 _limitSupply = limitSupply;
        require(_limitSupply == 0 || newSupply <= _limitSupply, "Over limit supply");
    }
}

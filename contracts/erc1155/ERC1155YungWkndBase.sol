// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./ERC1155Base.sol";
import "../metadata/MetadataEncryption.sol";
import "../tokenManager/interfaces/IPostTransfer.sol";
import "../tokenManager/interfaces/IPostBurn.sol";
import "./interfaces/IHighlightRenderer.sol";
import "../utils/ERC1155/ERC1155URIStorageUpgradeable.sol";
import "./interfaces/IERC1155YungWkndMint.sol";

/**
 * @title Generalized Base ERC1155
 * @author highlight.xyz
 * @notice Generalized Base NFT smart contract
 */
abstract contract ERC1155YungWkndBase is ERC1155Base, ERC1155URIStorageUpgradeable, IERC1155YungWkndMint {
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 _tokenCount;

    /**
     * @notice Throw when attempting to mint, while mint is frozen
     */
    error MintFrozen();

    /**
     * @notice Throw when requested token is not in range within bounds of limit supply
     */
    error TokenNotInRange();

    /**
     * @notice Throw when new supply is over limit supply
     */
    error OverLimitSupply();

    /**
     * @notice Throw when array lengths are mismatched
     */
    error MismatchedArrayLengths();

    /**
     * @notice Throw when string is empty
     */
    error EmptyString();

    /**
     * @notice Custom renderer config, used for collections where metadata is rendered "in-chain"
     * @param renderer Renderer address
     * @param processMintDataOnRenderer If true, process mint data on renderer
     */
    struct CustomRendererConfig {
        address renderer;
        bool processMintDataOnRenderer;
    }

    /**
     * @notice Contract metadata
     */
    string public contractURI;

    /**
     * @notice Limit the supply to take advantage of over-promising in summation with multiple mint vectors
     */
    uint256 public limitSupply;

    /**
     * @notice Custom renderer config
     */
    CustomRendererConfig public customRendererConfig;

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
     * @notice See {IERC1155GeneralMint-mintOneToOneRecipient}
     */
    function mintOneToOneRecipient(address recipient) external virtual onlyMinter nonReentrant returns (uint256) {
        if (_mintFrozen == 1) {
            _revert(MintFrozen.selector);
        }

        uint256 tempSupply = _tokenCount;
        _requireLimitSupply(tempSupply);

        _mint(recipient, _tokenCount, 1, "");

        // process mint on custom renderer if present
        CustomRendererConfig memory _customRendererConfig = customRendererConfig;
        if (_customRendererConfig.processMintDataOnRenderer) {
            IHighlightRenderer(_customRendererConfig.renderer).processOneRecipientMint(tempSupply, 1, recipient);
        }

        return tempSupply;
    }

    /**
     * @notice See {IERC1155GeneralMint-mintExistingOneToOneRecipient}
     */
    function mintExistingOneToOneRecipient(address recipient, uint256 tokenId) external virtual onlyMinter nonReentrant returns (uint256) {
        revert("Not supported.");
    }

    /**
     * @notice See {IERC1155GeneralMint-mintSeedToOneRecipient}
     */
    function mintSeedToOneRecipient(address recipient, bytes32 seed) external virtual onlyMinter nonReentrant returns (uint256) {
        revert("Not supported.");
    }

    /**
     * @notice Set custom renderer and processing config
     * @param _customRendererConfig New custom renderer config
     */
    function setCustomRenderer(CustomRendererConfig calldata _customRendererConfig) external onlyOwner {
        require(_customRendererConfig.renderer != address(0), "Invalid input");
        customRendererConfig = _customRendererConfig;
    }

    /**
     * @notice Override base URI system for select tokens, with custom per-token metadata
     * @param ids IDs of tokens to override base uri system for with custom uris
     * @param uris Custom uris
     */
    function setTokenURIs(uint256[] calldata ids, string[] calldata uris) external nonReentrant {
        uint256 idsLength = ids.length;
        if (idsLength != uris.length) {
            _revert(MismatchedArrayLengths.selector);
        }

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
        if (bytes(newBaseURI).length == 0) {
            _revert(EmptyString.selector);
        }

        address _manager = defaultManager;

        if (_manager == address(0)) {
            if (_msgSender() != owner()) {
                _revert(Unauthorized.selector);
            }
        } else {
            if (!ITokenManager(_manager).canUpdateMetadata(_msgSender(), 0, bytes(newBaseURI))) {
                _revert(Unauthorized.selector);
            }
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
     * @notice Return the total number of minted tokens on the collection
     */
    function supply() external view returns (uint256) {
        return _tokenCount;
    }

    /**
     * @notice See {IERC1155-burn}. Overrides default behaviour to check associated tokenManager.
     */
    function burn(address from, uint256 id, uint256 amount) public nonReentrant {
        address _manager = tokenManager(id);
        address msgSender = _msgSender();

        if (_manager != address(0) && IERC165Upgradeable(_manager).supportsInterface(type(IPostBurn).interfaceId)) {
            IPostBurn(_manager).postBurn(msgSender, msgSender, id);
        } else {
            // default to restricting burn to owner or operator if a valid TM isn't present
            if (!isApprovedForAll(msgSender, address(this))) {
                _revert(Unauthorized.selector);
            }
        }

        _burn(from, id, amount);

        observability.emitTransfer(msgSender, address(0), id);
    }

    /**
     * @notice Overrides tokenURI to first rotate the token id
     * @param tokenId ID of token to get uri for
     */
    function uri(uint256 tokenId) public view virtual override returns (string memory) {
        if (customRendererConfig.renderer != address(0)) {
            return IHighlightRenderer(customRendererConfig.renderer).tokenURI(tokenId);
        }
        return ERC1155URIStorageUpgradeable.uri(tokenId);
    }

    /**
     * @notice See {IERC165-supportsInterface}.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(IERC165Upgradeable, ERC1155Upgradeable) returns (bool) {
        return ERC1155Upgradeable.supportsInterface(interfaceId);
    }

    /**
     * @notice Hook called after transfers
     * @param operator Address which called the function
     * @param from Account token is being transferred from
     * @param to Account token is being transferred to
     * @param ids IDs of tokens being transferred
     * @param amounts Amounts of tokens being transferred
     * @param data Additional data passed to hook
     */
    function _afterTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override {
        for (uint i = 0; i < ids.length; i++) {
            uint tokenId = ids[i];
            address _manager = tokenManager(tokenId);
            if (_manager != address(0) && IERC165Upgradeable(_manager).supportsInterface(type(IPostTransfer).interfaceId)) {
                IPostTransfer(_manager).postSafeTransferFrom(_msgSender(), from, to, tokenId, "");
            }

            observability.emitTransfer(from, to, tokenId);
        }
    }

    /**
     * @notice Used for meta-transactions
     */
    function _msgSender() internal view virtual override(ERC1155Base, ContextUpgradeable) returns (address sender) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    /**
     * @notice Used for meta-transactions
     */
    function _msgData() internal view virtual override(ERC1155Base, ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    /**
     * @dev For more efficient reverts.
     */
    function _revert(bytes4 errorSelector) internal pure virtual override(ERC1155Upgradeable, ERC1155Base) {
        ERC1155Upgradeable._revert(errorSelector);
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
            if (msgSender != tempOwner) {
                _revert(Unauthorized.selector);
            }
        } else {
            if (!ITokenManager(_manager).canUpdateMetadata(msgSender, tokenId, bytes(_uri))) {
                _revert(Unauthorized.selector);
            }
        }

        _tokenURIs[tokenId] = _uri;
    }

    /**
     * @notice Require the new supply of tokens after mint to be less than limit supply
     * @param newSupply New supply
     */
    function _requireLimitSupply(uint256 newSupply) internal view {
        uint256 _limitSupply = limitSupply;
        if (_limitSupply != 0 && newSupply > _limitSupply) {
            _revert(OverLimitSupply.selector);
        }
    }
}

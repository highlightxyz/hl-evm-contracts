//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./ERC721RazorWorksBase.sol";
import "../../../utils/forma/JSON.sol";
import "./interfaces/IRazorWorksRenderer.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @title Generative ERC721
 * @dev Adheres to Forma-native token metadata standards
 * @author highlight.xyz
 * @notice Generative NFT smart contract
 */
contract ERC721RazorWorks is ERC721RazorWorksBase {
    using EnumerableSet for EnumerableSet.AddressSet;

    /**
     * @notice Forma native token metadata template
     */
    struct TokenMetadataTemplate {
        bool set;
        string nameBase;
        string description;
        string imageUrlBase;
        string externalUrlBase;
    }

    /**
     * @notice Generative Code URI
     */
    string private _generativeCodeURI;

    /**
     * @notice Token metadata template
     */
    TokenMetadataTemplate private _tokenMetadataTemplate;

    /**
     * @notice Initialize the contract
     * @param data Data to initialize the contract
     * @ param creator Creator/owner of contract
     * @ param _contractURI Contract metadata
     * @ param defaultRoyalty Default royalty object for contract (optional)
     * @ param _defaultTokenManager Default token manager for contract (optional)
     * @ param _name Name of token edition
     * @ param _symbol Symbol of the token edition
     * @ param trustedForwarder Trusted minimal forwarder
     * @ param initialMinter Initial minter to register
     * @ param _generativeCodeURI Generative code URI
     * @ param newBaseURI Base URI for contract
     * @ param _limitSupply Initial limit supply
     * @ param useMarketplaceFiltererRegistry Denotes whether to use marketplace filterer registry
     * @param _observability Observability contract address
     */
    function initialize(bytes calldata data, address _observability) external initializer {
        (
            address creator,
            string memory _contractURI,
            IRoyaltyManager.Royalty memory defaultRoyalty,
            address _defaultTokenManager,
            string memory _name,
            string memory _symbol,
            address trustedForwarder,
            address initialMinter,
            string memory _codeURI,
            string memory newBaseURI,
            uint256 _limitSupply,
            bool useMarketplaceFiltererRegistry
        ) = abi.decode(
                data,
                (
                    address,
                    string,
                    IRoyaltyManager.Royalty,
                    address,
                    string,
                    string,
                    address,
                    address,
                    string,
                    string,
                    uint256,
                    bool
                )
            );

        __ERC721URIStorage_init();
        __ERC721Base_initialize(creator, defaultRoyalty, _defaultTokenManager);
        __ERC2771ContextUpgradeable__init__(trustedForwarder);
        __ERC721A_init(_name, _symbol);
        // deprecate but keep input for backwards-compatibility:
        // __MarketplaceFilterer__init__(useMarketplaceFiltererRegistry);
        _minters.add(initialMinter);
        contractURI = _contractURI;
        _generativeCodeURI = _codeURI;
        IObservabilityV3(_observability).emitGenerativeSeriesDeployed(address(this));
        observability = IObservabilityV3(_observability);

        if (bytes(newBaseURI).length > 0) {
            _setBaseURI(newBaseURI);
            // don't emit on observability contract here
        }

        if (_limitSupply > 0) {
            limitSupply = _limitSupply;
            // don't emit on observability contract here
        }
    }

    /**
     * @notice Set Forma-native token metadata template
     */
    function setFormaTokenMetadataTemplate(TokenMetadataTemplate calldata tokenMetadataTemplate) external onlyOwner {
        _tokenMetadataTemplate = tokenMetadataTemplate;
    }

    function generativeCodeUri() external view returns (string memory) {
        return _generativeCodeURI;
    }

    /**
     * @notice Get token URI
     */
    function uri(uint256 _tokenId) external view returns (string memory) {
        return this.tokenURI(_tokenId);
    }

    /**
     * @notice Return if token exists
     */
    function exists(uint256 _tokenId) external view returns (bool) {
        return _exists(_tokenId);
    }

    /**
     * @notice Get token metadata (Forma-native)
     */
    function getTokenMetadata(uint256 _tokenId) public view returns (string memory) {
        string memory metadata = "{}";

        bytes32 blockHash = IRazorWorksRenderer(0x1beC8F6aa0434b67fF531926Bd971a9b68766F2C).previousBlockHash(
            address(this),
            _tokenId
        );

        string[] memory paths = new string[](5);
        paths[0] = "name";
        paths[1] = "description";
        paths[2] = "image";
        paths[3] = "animation_url";
        paths[4] = "external_url";
        string[] memory values = new string[](5);
        values[0] = string(abi.encodePacked(_tokenMetadataTemplate.nameBase, " #", _toString(_tokenId)));
        values[1] = _tokenMetadataTemplate.description;
        values[2] = string(abi.encodePacked(_tokenMetadataTemplate.imageUrlBase, "/", _toString(_tokenId), ".png"));
        values[3] = string(
            abi.encodePacked(
                _generativeCodeURI,
                "/index.html",
                "?&tid=",
                _toString(_tokenId),
                "&bh=",
                Strings.toHexString(uint256(blockHash))
            )
        );
        values[4] = string(abi.encodePacked(_tokenMetadataTemplate.externalUrlBase, "/", _toString(_tokenId)));
        metadata = JSON.JSON_UTIL.set(metadata, paths, values);

        return metadata;
    }

    /**
     * @notice Get token uri
     * @dev Base64 encoded metadata json
     */
    function tokenURI(uint256 _tokenId) public view override returns (string memory) {
        if (_tokenMetadataTemplate.set) {
            return
                string(
                    abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(getTokenMetadata(_tokenId))))
                );
        } else {
            return super.tokenURI(_tokenId);
        }
    }
}

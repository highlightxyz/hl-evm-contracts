// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./ERC721Base.sol";
import "../metadata/MetadataEncryption.sol";
import "../tokenManager/interfaces/IPostTransfer.sol";
import "../tokenManager/interfaces/IPostBurn.sol";
import "./interfaces/IERC721GeneralMint.sol";
import "./ERC721GeneralSequenceBase.sol";
import "./onchain/OnchainFileStorage.sol";

/**
 * @title Generalized ERC721 that expects tokenIds to increment in a monotonically increasing sequence
 * @author highlight.xyz
 * @notice Generalized NFT smart contract
 */
contract ERC721GeneralSequence is MetadataEncryption, ERC721GeneralSequenceBase, OnchainFileStorage {
    using EnumerableSet for EnumerableSet.AddressSet;

    /**
     * @notice Initialize the contract
     * @param creator Creator/owner of contract
     * @param _contractURI Contract metadata
     * @param defaultRoyalty Default royalty object for contract (optional)
     * @param _defaultTokenManager Default token manager for contract (optional)
     * @param _name Name of token edition
     * @param _symbol Symbol of the token edition
     * @param trustedForwarder Trusted minimal forwarder
     * @param initialMinter Initial minter to register
     * @param newBaseURI Base URI for contract
     * @param _limitSupply Initial limit supply
     * @param useMarketplaceFiltererRegistry Denotes whether to use marketplace filterer registry
     * @param _observability Observability contract address
     */
    function initialize(
        address creator,
        string memory _contractURI,
        IRoyaltyManager.Royalty memory defaultRoyalty,
        address _defaultTokenManager,
        string memory _name,
        string memory _symbol,
        address trustedForwarder,
        address initialMinter,
        string memory newBaseURI,
        uint256 _limitSupply,
        bool useMarketplaceFiltererRegistry,
        address _observability
    ) external initializer {
        _initialize(
            creator,
            _contractURI,
            defaultRoyalty,
            _defaultTokenManager,
            _name,
            _symbol,
            trustedForwarder,
            initialMinter,
            newBaseURI,
            _limitSupply,
            useMarketplaceFiltererRegistry,
            _observability
        );
    }

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
     * @ param newBaseURI Base URI for contract
     * @ param _limitSupply Initial limit supply
     * @ param useMarketplaceFiltererRegistry Denotes whether to use marketplace filterer registry
     * @ param _observability Observability contract address
     */
    function initialize(bytes calldata data) external initializer {
        (
            address creator,
            string memory _contractURI,
            IRoyaltyManager.Royalty memory defaultRoyalty,
            address _defaultTokenManager,
            string memory _name,
            string memory _symbol,
            address trustedForwarder,
            address initialMinter,
            string memory newBaseURI,
            uint256 _limitSupply,
            bool useMarketplaceFiltererRegistry,
            address _observability
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
                    uint256,
                    bool,
                    address
                )
            );

        _initialize(
            creator,
            _contractURI,
            defaultRoyalty,
            _defaultTokenManager,
            _name,
            _symbol,
            trustedForwarder,
            initialMinter,
            newBaseURI,
            _limitSupply,
            useMarketplaceFiltererRegistry,
            _observability
        );
    }

    /**
     * @notice Used for meta-transactions
     */
    function _msgSender()
        internal
        view
        virtual
        override(ERC721GeneralSequenceBase, ContextUpgradeable)
        returns (address sender)
    {
        return ERC721GeneralSequenceBase._msgSender();
    }

    /**
     * @notice Used for meta-transactions
     */
    function _msgData()
        internal
        view
        virtual
        override(ERC721GeneralSequenceBase, ContextUpgradeable)
        returns (bytes calldata)
    {
        return ERC721GeneralSequenceBase._msgData();
    }

    /**
     * @dev For more efficient reverts.
     */
    function _revert(bytes4 errorSelector) internal pure override(ERC721GeneralSequenceBase, OnchainFileStorage) {
        assembly {
            mstore(0x00, errorSelector)
            revert(0x00, 0x04)
        }
    }

    /**
     * @notice Initialize the contract
     * @param creator Creator/owner of contract
     * @param _contractURI Contract metadata
     * @param defaultRoyalty Default royalty object for contract (optional)
     * @param _defaultTokenManager Default token manager for contract (optional)
     * @param _name Name of token edition
     * @param _symbol Symbol of the token edition
     * @param trustedForwarder Trusted minimal forwarder
     * @param initialMinter Initial minter to register
     * @param newBaseURI Base URI for contract
     * @param _limitSupply Initial limit supply
     * @param useMarketplaceFiltererRegistry Denotes whether to use marketplace filterer registry
     * @param _observability Observability contract address
     */
    function _initialize(
        address creator,
        string memory _contractURI,
        IRoyaltyManager.Royalty memory defaultRoyalty,
        address _defaultTokenManager,
        string memory _name,
        string memory _symbol,
        address trustedForwarder,
        address initialMinter,
        string memory newBaseURI,
        uint256 _limitSupply,
        bool useMarketplaceFiltererRegistry,
        address _observability
    ) private {
        __ERC721URIStorage_init();
        __ERC721Base_initialize(creator, defaultRoyalty, _defaultTokenManager);
        __ERC2771ContextUpgradeable__init__(trustedForwarder);
        __ERC721A_init(_name, _symbol);
        // deprecate but keep input for backwards-compatibility:
        // __MarketplaceFilterer__init__(useMarketplaceFiltererRegistry);
        _minters.add(initialMinter);
        contractURI = _contractURI;
        IObservability(_observability).emitSeriesDeployed(address(this));
        observability = IObservability(_observability);

        if (bytes(newBaseURI).length > 0) {
            _setBaseURI(newBaseURI);
            // don't emit on observability contract here
        }

        if (_limitSupply > 0) {
            limitSupply = _limitSupply;
            // don't emit on observability contract here
        }
    }
}

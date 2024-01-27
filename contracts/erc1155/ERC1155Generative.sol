//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./ERC1155Base.sol";
import "../tokenManager/interfaces/IPostTransfer.sol";
import "../tokenManager/interfaces/IPostBurn.sol";
import "./interfaces/IERC1155GeneralMint.sol";
import "./ERC1155GeneralSequenceBase.sol";

/**
 * @title Generative ERC1155
 * @author highlight.xyz
 * @notice Generative NFT smart contract
 */
contract ERC1155Generative is ERC1155GeneralSequenceBase {
    using EnumerableSet for EnumerableSet.AddressSet;

    /**
     * @notice Generative Code URI
     */
    string private _generativeCodeURI;

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

        __ERC1155URIStorage_init();
        __ERC1155Base_initialize(creator, defaultRoyalty, _defaultTokenManager);
        __ERC2771ContextUpgradeable__init__(trustedForwarder);
        __ERC1155A_init(_name, _symbol);
        // deprecate but keep input for backwards-compatibility:
        // __MarketplaceFilterer__init__(useMarketplaceFiltererRegistry);
        _minters.add(initialMinter);
        contractURI = _contractURI;
        _generativeCodeURI = _codeURI;
        IObservability(_observability).emitGenerativeSeriesDeployed(address(this));
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

    function generativeCodeUri() external view returns (string memory) {
        return _generativeCodeURI;
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

/**
 * @title IGengineObservability
 * @author highlight.xyz
 * @notice Interface to interact with the Highlight Gengine observability singleton
 * @dev Singleton to coalesce select Highlight Gengine protocol events
 */
interface IGengineObservability {
    /**
     * @notice Emitted when contract metadata is set
     * @param contractAddress Initial contract that emitted event
     * @param name New name
     * @param symbol New symbol
     * @param contractURI New contract uri
     */
    event ContractMetadataSet(address indexed contractAddress, string name, string symbol, string contractURI);

    /**
     * @notice Emitted when limit supply is set
     * @param contractAddress Initial contract that emitted event
     * @param newLimitSupply Limit supply to set
     */
    event LimitSupplySet(address indexed contractAddress, uint256 indexed newLimitSupply);

    /**
     * @notice Emits when a series collection has its base uri set
     * @param contractAddress Contract with updated base uri
     * @param newBaseUri New base uri
     */
    event BaseUriSet(address indexed contractAddress, string newBaseUri);

    /**************************
      Deployment events
     **************************/

    /**
     * @notice Emitted when Generative Series contract is deployed
     * @param deployer Contract deployer
     * @param contractAddress Address of contract that was deployed
     */
    event GenerativeSeriesDeployed(address indexed deployer, address indexed contractAddress);

    /**
     * @notice Emitted when Series contract is deployed
     * @param deployer Contract deployer
     * @param contractAddress Address of contract that was deployed
     */
    event SeriesDeployed(address indexed deployer, address indexed contractAddress);

    /**************************
      ERC721 events
     **************************/

    /**
     * @notice Emitted on a mint where a number of tokens are minted
     * @param contractAddress Address of contract being minted on
     * @param numMinted Number of tokens minted
     */
    event TokenMint(address indexed contractAddress, address indexed to, uint256 indexed numMinted);

    /**
     * @notice Emitted whenever the metadata for the token is updated
     * @param contractAddress NFT contract token resides on
     * @param tokenId Token being updated
     */
    event TokenUpdated(address indexed contractAddress, uint256 indexed tokenId);

    /**
     * @notice Emitted when `tokenId` token is transferred from `from` to `to` on contractAddress
     * @param contractAddress NFT contract token resides on
     * @param from Token sender
     * @param to Token receiver
     * @param tokenId Token being sent
     */
    event Transfer(address indexed contractAddress, address indexed from, address to, uint256 indexed tokenId);

    /**
     * @notice Emitted for the seed based data on mint
     * @param sender contract emitting the event
     * @param contractAddress NFT contract token resides on
     * @param data custom mint data
     */
    event CustomMintData(address indexed sender, address indexed contractAddress, bytes data);

    /**
     * @notice Emitted to regenerate the generative art for a token
     * @param sender contract emitting the event
     * @param collection NFT contract token resides on
     * @param tokenId Token ID
     */
    event HighlightRegenerate(address indexed sender, address indexed collection, uint256 indexed tokenId);

    /**
     * @notice Emit ContractMetadataSet
     */
    function emitContractMetadataSet(
        string calldata name,
        string calldata symbol,
        string calldata contractURI
    ) external;

    /**
     * @notice Emit LimitSupplySet
     */
    function emitLimitSupplySet(uint256 newLimitSupply) external;

    /**
     * @notice Emit BaseUriSet
     */
    function emitBaseUriSet(string calldata newBaseUri) external;

    /**
     * @notice Emit GenerativeSeriesDeployed
     */
    function emitGenerativeSeriesDeployed(address contractAddress) external;

    /**
     * @notice Emit SeriesDeployed
     */
    function emitSeriesDeployed(address contractAddress) external;

    /**
     * @notice Emit Token Mint
     */
    function emitTokenMint(address to, uint256 numMinted) external;

    /**
     * @notice Emit Token Updated
     */
    function emitTokenUpdated(address contractAddress, uint256 tokenId) external;

    /**
     * @notice Emit Transfer
     */
    function emitTransfer(address from, address to, uint256 tokenId) external;

    /**
     * @notice Emit Custom Mint Data
     */
    function emitCustomMintData(address contractAddress, bytes calldata data) external;

    /**
     * @notice Emit HighlightRegenerate
     */
    function emitHighlightRegenerate(address collection, uint256 tokenId) external;
}

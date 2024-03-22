//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

/**
 * @notice Highlight's custom renderer interface for collections
 */
interface IHighlightRenderer {
    /**
     * @notice Process a mint to multiple recipients (likely store mint details)
     * @dev Implementations should assume msg.sender to be the NFT contract
     * @param firstTokenId ID of first token to be minted (next ones are minted sequentially)
     * @param numTokensPerRecipient Number of tokens minted to each recipient
     * @param orderedRecipients Recipients to mint tokens to, sequentially
     */
    function processMultipleRecipientMint(
        uint256 firstTokenId,
        uint256 numTokensPerRecipient,
        address[] calldata orderedRecipients
    ) external;

    /**
     * @notice Process a mint to one recipient (likely store mint details)
     * @dev Implementations should assume msg.sender to be the NFT contract
     * @param firstTokenId ID of first token to be minted (next ones are minted sequentially)
     * @param numTokens Number of tokens minted
     * @param recipient Recipient to mint to
     */
    function processOneRecipientMint(uint256 firstTokenId, uint256 numTokens, address recipient) external;


    /**
     * @notice Process a mint to one recipient with a hash (likely store mint details)
     * @dev Implementations should assume msg.sender to be the NFT contract
     * @param tokenId ID of token to be minted
     * @param inputHash hash that idempotently re-creates the art
     */
    function processRecipientMintWithHash(uint256 tokenId, bytes32 inputHash) external;


    /**
     * @notice Return token metadata for a token
     * @dev Implementations should assume msg.sender to be the NFT contract
     * @param tokenId ID of token to return metadata for
     */
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

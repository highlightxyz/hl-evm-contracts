//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./interfaces/IHLRenderer.sol";
import "../interfaces/IERC721GeneralSupplyMetadata.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @notice Mock implementation of IHLRenderer
 */
contract TestHighlightRenderer is IHLRenderer {
    /**
     * @notice Throw when mint details are queried for a token that hasn't been minted
     */
    error InvalidTokenId();

    /**
     * @notice Details that seed token metadata
     */
    struct SeedDetails {
        bytes32 previousBlockHash;
        uint256 blockTimestamp;
        // etc.
    }

    /**
     * @notice Store the seed details for each token batch (for each nft contract)
     */
    mapping(address => mapping(uint256 => SeedDetails)) private _startTokenIdToSeedDetails;

    /**
     * @notice Store the first token id of each minted batch (for each nft contract)
     */
    mapping(address => uint256[]) private _startTokenIds;

    /**
     * @notice See {IHLRenderer-processMultipleRecipientMint}
     */
    function processMultipleRecipientMint(
        uint256 firstTokenId,
        uint256 numTokensPerRecipient, // unused in this implementation
        address[] calldata orderedRecipients // unused in this implementation
    ) external {
        _startTokenIdToSeedDetails[msg.sender][firstTokenId] = SeedDetails(
            blockhash(block.number - 1),
            block.timestamp
        );
        _startTokenIds[msg.sender].push(firstTokenId);
    }

    /**
     * @notice See {IHLRenderer-processOneRecipientMint}
     */
    function processOneRecipientMint(
        uint256 firstTokenId,
        uint256 numTokens, // unused in this implementation
        address recipient // unused in this implementation
    ) external {
        _startTokenIdToSeedDetails[msg.sender][firstTokenId] = SeedDetails(
            blockhash(block.number - 1),
            block.timestamp
        );
        _startTokenIds[msg.sender].push(firstTokenId);
    }

    /**
     * @notice See {IHLRenderer-tokenURI}
     */
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        // typically return a base64-encoded json
        // probably store a preview images base uri globally (stored via Highlight)
        // for demonstration purposes, just return a simple string here:
        uint256 numTokens = IERC721GeneralSupplyMetadata(msg.sender).supply();
        return concatenateSeedDetails(getSeedDetails(tokenId, numTokens + 1, msg.sender), tokenId);
    }

    /**
     * @notice Concatenate seed details into a fake uri
     */
    function concatenateSeedDetails(
        SeedDetails memory _seedDetails,
        uint256 tokenId
    ) public view returns (string memory) {
        return
            string(
                abi.encodePacked(
                    Strings.toString(uint256(_seedDetails.previousBlockHash)),
                    Strings.toString(_seedDetails.blockTimestamp),
                    Strings.toString(tokenId)
                )
            );
    }

    /**
     * @notice Get a token's seed details
     * @dev Assumes _startTokenIds are in ascending order
     * @param tokenId ID of token to get seed details for
     * @param nextTokenId ID of immediate token that hasn't been minted on NFT contract
     * @param nftContract NFT contract
     */
    function getSeedDetails(
        uint256 tokenId,
        uint256 nextTokenId,
        address nftContract
    ) public view returns (SeedDetails memory) {
        uint256[] memory tempStartTokenIds = _startTokenIds[nftContract];
        uint256 numBatches = tempStartTokenIds.length;

        if (numBatches == 0) {
            revert InvalidTokenId();
        }

        uint256 previousStartTokenId = tempStartTokenIds[0];
        if (numBatches == 1) {
            if (tokenId >= previousStartTokenId && tokenId < nextTokenId) {
                return _startTokenIdToSeedDetails[nftContract][previousStartTokenId];
            } else {
                revert InvalidTokenId();
            }
        }

        for (uint256 i = 1; i < numBatches; i++) {
            if (tokenId >= previousStartTokenId && tokenId < tempStartTokenIds[i]) {
                return _startTokenIdToSeedDetails[nftContract][previousStartTokenId];
            }

            previousStartTokenId = tempStartTokenIds[i];
        }

        if (tokenId >= previousStartTokenId && tokenId < nextTokenId) {
            return _startTokenIdToSeedDetails[nftContract][previousStartTokenId];
        } else {
            revert InvalidTokenId();
        }
    }
}

//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./interfaces/IHighlightRenderer.sol";
import "./interfaces/IHLFS.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "../utils/Ownable.sol";

/**
 * @notice YungWknd Renderer for ERC1155 tokens
 * @dev Currently supports a fairly fixed configuratoin
 * @author highlight.xyz
 */
contract ERC1155YungWkndRenderer is IHighlightRenderer {

    /**
     * 
     * @notice Emitted when custom seed is set for a token
     * @param collection Collection address
     * @param seed Seed for token
     * @param tokenId Token ID
     */
    event CustomSeed(address indexed collection, bytes32 indexed seed, uint256 indexed tokenId);

    /**
     * @notice Throw when invalid input to process mint data
     */
    error InvalidMintData();

    /**
     * @notice Throw when seed input for a token cannot be found
     */
    error SeedInputNotFound();

    /**
     * @notice Throw when transaction sender isn't collection owner
     */
    error NotCollectionOwner();

    /**
     * @notice Input that seeds token metadata
     * @param previousBlockHash Hash of the block before the one the tokens were minted on
     * @param blockTimestamp Timestamp of block that tokens were minted on
     * @param startTokenId ID of first token of minted batch
     */
    struct SeedInput {
        bytes32 previousBlockHash;
        uint48 blockTimestamp;
        uint176 startTokenId;
        uint32 numMinted;
    }

    struct UserInputHash {
        bytes32 inputHash;
        uint176 tokenId;
    }

    /**
     * @notice Simple collection config (to be made more complex)
     */
    struct CollectionConfig {
        string name;
        string previewsBaseUri;
        string htmlLang;
        bool htmlBodyExpected;
        bool useCDN;
    }

    uint256 private constant _32_BIT_MAX_MINUS_1 = 2 ** 32 - 1;

    /**
     * @notice Store the seed inputs for each token batch (for each nft contract)
     * @dev Assume startTokenIds are incrementing (up to implementer), assume first batch's startTokenId is 1
     */
    mapping(address => SeedInput[]) public collectionSeedInputs;

    mapping(address => UserInputHash[]) public userInputHashes;

    /**
     * @notice Store config per collection
     */
    mapping(address => CollectionConfig) public collectionConfig;

    /**
     * @notice Set a collection's config
     */
    function setCollectionConfig(CollectionConfig calldata config, address collection) external {
        if (Ownable(collection).owner() == msg.sender || msg.sender == collection) {
            collectionConfig[collection] = config;
        } else {
            _revert(NotCollectionOwner.selector);
        }
    }

    /**
     * @notice See {IHlRenderer-processOneRecipientMint}
     */
    function processOneRecipientMint(uint256 firstTokenId, uint256 numTokens, address recipient) external {
        collectionSeedInputs[msg.sender].push(
            SeedInput(blockhash(block.number - 1), uint48(block.timestamp), uint176(firstTokenId), uint32(numTokens))
        );
    }

    function processMultipleRecipientMint(
        uint256 firstTokenId,
        uint256 numTokensPerRecipient,
        address[] calldata orderedRecipients
    ) external {
        for (uint i = 0; i < orderedRecipients.length; i++) {
            collectionSeedInputs[msg.sender].push(
                SeedInput(blockhash(block.number - 1), uint48(block.timestamp), uint176(firstTokenId), uint32(numTokensPerRecipient))
            );
        }
    }

    /**
     * @notice See {IHlRenderer-processRecipientMintWithHash}
     */
    function processRecipientMintWithHash(uint256 tokenId, bytes32 inputHash) external {
        userInputHashes[msg.sender].push(
            UserInputHash(inputHash, uint176(tokenId))
        );

        emit CustomSeed(msg.sender, inputHash, tokenId);
    }

    /**
     * @notice See {IHLRenderer-tokenURI}
     */
    function tokenURI(uint256 tokenId) public view virtual returns (string memory) {
        address collection = msg.sender;
        SeedInput memory _seedInput = getSeedInput(tokenId, collection);
        bytes32 curatedHash = getCuratedHash(tokenId, collection);

        string memory tokenIdStr = Strings.toString(tokenId);

        bytes[] memory metadata = new bytes[](3);
        bytes[] memory encodedJson = new bytes[](2);

        // inject values in JS
        string memory injectedToken = string(
            abi.encodePacked(
                'const injectedToken = {"blockHash": "',
                Strings.toHexString(uint256(_seedInput.previousBlockHash)),
                '", "',
                'tokenId": "',
                tokenIdStr,
                '", "',
                'timestamp": "',
                Strings.toString(_seedInput.blockTimestamp),
                '", "',
                'hash": "',
                Strings.toHexString(uint256(curatedHash)),
                '", "',
                'isCurated": "1"',
                "};"
            )
        );

        metadata[0] = abi.encodePacked(
            '{"name": "',
            collectionConfig[collection].name,
            " #",
            tokenIdStr,
            '", "',
            'description": "',
            IHLFS(collection).fileContents("description.txt"),
            '", "',
            'image": "',
            collectionConfig[collection].previewsBaseUri,
            "/",
            Strings.toString(tokenId),
            ".png",
            '", "'
            'animation_url": "data:text/html;base64,'
        );
        metadata[1] = bytes(Base64.encode(_generateHTML(collection, injectedToken, false)));
        metadata[2] = bytes('"}');

        encodedJson[0] = bytes("data:application/json;base64,");
        encodedJson[1] = bytes(Base64.encode(concat(metadata)));
        return string(concat(encodedJson));
    }

    /**
     * @notice See {IHLRenderer-tokenURI}
     */
    function tokenURIWithCDN(uint256 tokenId, address collection) public view virtual returns (string memory) {
        SeedInput memory _seedInput = getSeedInput(tokenId, collection);
        bytes32 curatedHash = getCuratedHash(tokenId, collection);

        string memory tokenIdStr = Strings.toString(tokenId);

        bytes[] memory metadata = new bytes[](3);
        bytes[] memory encodedJson = new bytes[](2);

        // inject values in JS
        string memory injectedToken = string(
            abi.encodePacked(
                'const injectedToken = {"blockHash": "',
                Strings.toHexString(uint256(_seedInput.previousBlockHash)),
                '", "',
                'tokenId": "',
                tokenIdStr,
                '", "',
                'timestamp": "',
                Strings.toString(_seedInput.blockTimestamp),
                '", "',
                'hash": "',
                Strings.toHexString(uint256(curatedHash)),
                '", "',
                'isCurated": "1"',
                "};"
            )
        );

        metadata[0] = abi.encodePacked(
            '{"name": "',
            collectionConfig[collection].name,
            " #",
            tokenIdStr,
            '", "',
            'description": "',
            IHLFS(collection).fileContents("description.txt"),
            '", "',
            'image": "',
            collectionConfig[collection].previewsBaseUri,
            "/",
            Strings.toString(tokenId),
            ".png",
            '", "'
            'animation_url": "data:text/html;base64,'
        );
        metadata[1] = bytes(Base64.encode(_generateHTML(collection, injectedToken, true)));
        metadata[2] = bytes('"}');

        encodedJson[0] = bytes("data:application/json;base64,");
        encodedJson[1] = bytes(Base64.encode(concat(metadata)));
        return string(concat(encodedJson));
    }

    /**
     * Get a token's seed
     */
    function getSeed(uint256 tokenId, address collection) public view returns (bytes32) {
        SeedInput memory _seedInput = getSeedInput(tokenId, collection);
        return _getSeed(_seedInput, tokenId);
    }

    /**
     * @notice Get a token's seed input
     */
    function getSeedInput(uint256 tokenId, address collection) public view returns (SeedInput memory) {
        SeedInput[] memory _seedInputs = collectionSeedInputs[collection];
        uint256 numInputs = _seedInputs.length;
        if (numInputs == 0) {
            _revert(SeedInputNotFound.selector);
        }
        for (uint256 i = numInputs - 1; i >= 0; i--) {
            if (tokenId >= _seedInputs[i].startTokenId) {
                // assume first batch's startTokenId is 1
                if (_seedInputs[i].startTokenId + _seedInputs[i].numMinted <= tokenId) {
                    _revert(SeedInputNotFound.selector);
                } else {
                    return _seedInputs[i];
                }
            }
        }
    }

    /**
     * @notice Get a token's seed input
     */
    function getCuratedHash(uint256 tokenId, address collection) public view returns (bytes32) {
        // First, check the userInputHashes
        UserInputHash[] memory _userInputHashes = userInputHashes[collection];
        uint256 numInputs = _userInputHashes.length;
        for (uint256 i = numInputs - 1; i >= 0; i--) {
            if (tokenId == _userInputHashes[i].tokenId) {
                return _userInputHashes[i].inputHash;
            }
        }

        // Otherwise, construct the hash ourselves...

        SeedInput[] memory _seedInputs = collectionSeedInputs[collection];
        numInputs = _seedInputs.length;
        if (numInputs == 0) {
            _revert(SeedInputNotFound.selector);
        }
        for (uint256 i = numInputs - 1; i >= 0; i--) {
            if (tokenId == _seedInputs[i].startTokenId) {
                return getSeed(tokenId, collection);
            }
        }
        _revert(SeedInputNotFound.selector);
    }

    /**
     * @notice Generate the project's HTML file
     */
    function _generateHTML(address collection, string memory injectedToken, bool useCDNOverride) public view returns (bytes memory) {
        bytes[] memory html = new bytes[](4);

        bool useCDN = useCDNOverride ? true : collectionConfig[collection].useCDN;
        string memory libScriptPrefix = useCDN ? ' src="' : ">";
        string memory libScriptSuffix = useCDN ? '">' : "";
        html[0] = abi.encodePacked(
            '<!DOCTYPE html><html lang="',
            collectionConfig[collection].htmlLang,
            '">',
            "<head>",
            IHLFS(collection).fileContents("headPrefix.html"),
            "<script>",
            injectedToken,
            IHLFS(collection).fileContents("hl-gen-inchain.js"),
            "</script><script",
            libScriptPrefix
        );
        html[1] = bytes(
            IHLFS(collection).fileContents(useCDN ? "p5-cdn.txt" : "p5.min.js")
        );
        html[2] = abi.encodePacked(
            libScriptSuffix,
            "</script><script>",
            IHLFS(collection).fileContents("sketch.js"),
            "</script>",
            "<style>",
            IHLFS(collection).fileContents("index.css"),
            "</style>",
            "</head>"
        );

        string memory HTMLBody = "";
        if (collectionConfig[collection].htmlBodyExpected) {
            HTMLBody = IHLFS(collection).fileContents("body.html");
        }
        html[3] = abi.encodePacked("<body>", HTMLBody, "</body>", "</html>");

        return concat(html);
    }

    /**
     * @notice Base64 Encode a metadata JSON
     */
    function _encodeMetadataJSON(bytes memory json) private pure returns (string memory) {
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }

    /**
     * @notice Concatenate byte arrays
     */
    function concat(bytes[] memory arrays) public pure returns (bytes memory) {
        uint totalLength = 0;
        for (uint i = 0; i < arrays.length; i++) {
            totalLength += arrays[i].length;
        }

        bytes memory result = new bytes(totalLength);
        uint resultPtr;
        assembly {
            resultPtr := add(result, 0x20)
        }

        for (uint i = 0; i < arrays.length; i++) {
            bytes memory array = arrays[i];
            uint arrayLength = array.length;

            uint arrayPtr;
            assembly {
                arrayPtr := add(array, 0x20)
            }

            // Efficiently copy memory block
            for (uint j = 0; j < arrayLength; j += 32) {
                assembly {
                    let chunk := mload(add(arrayPtr, j))
                    mstore(add(resultPtr, j), chunk)
                }
            }

            resultPtr += arrayLength;
        }

        return result;
    }

    /**
     * @notice Parse a byte value represented in string to the byte representation of the value
     */
    function _parseHexChar(bytes1 char) internal pure returns (bytes1) {
        if (uint8(char) >= 48 && uint8(char) <= 57) {
            return bytes1(uint8(char) - 48); // 0-9
        }
        if (uint8(char) >= 65 && uint8(char) <= 70) {
            return bytes1(uint8(char) - 55); // A-F
        }
        if (uint8(char) >= 97 && uint8(char) <= 102) {
            return bytes1(uint8(char) - 87); // a-f
        }
        revert("Invalid hex character");
    }

    /**
     * @notice Generate an index via a prng, given seed input and a max value
     */
    function _prngSeedInput(
        bytes32 generalHash,
        bytes32 blockHash,
        uint256 tokenId,
        uint256 max
    ) private pure returns (uint256) {
        uint256 seed = tokenId;

        // process each byte of generalHash and blockHash
        for (uint256 i = 0; i < 32; i++) {
            // extract and process high and low nibbles for generalHash
            uint8 highNibbleTx = uint8(generalHash[i]) >> 4;
            uint8 lowNibbleTx = uint8(generalHash[i]) & 0x0F;
            if (highNibbleTx <= 9) {
                seed += highNibbleTx;
            }
            if (lowNibbleTx <= 9) {
                seed += lowNibbleTx;
            }

            // extract and process high and low nibbles for blockHash
            uint8 highNibbleBlock = uint8(blockHash[i]) >> 4;
            uint8 lowNibbleBlock = uint8(blockHash[i]) & 0x0F;
            if (highNibbleBlock <= 9) {
                seed += highNibbleBlock;
            }
            if (lowNibbleBlock <= 9) {
                seed += lowNibbleBlock;
            }
        }

        uint256 t = (seed + 0x6D2B79F5) & (_32_BIT_MAX_MINUS_1);
        t = imul(t ^ (t >> 15), t | 1) & (_32_BIT_MAX_MINUS_1);
        t ^= (t + imul(t ^ (t >> 7), t | 61)) & (_32_BIT_MAX_MINUS_1);
        t = (t ^ (t >> 14)) & (_32_BIT_MAX_MINUS_1);
        return t % max;
    }

    /**
     * @notice Replicate js Math.imul
     */
    function imul(uint256 a, uint256 b) private pure returns (uint256) {
        return (a * b) % (_32_BIT_MAX_MINUS_1 + 1);
    }

    /**
     * @notice Get a token's seed util
     */
    function _getSeed(SeedInput memory _seedInput, uint256 tokenId) private view returns (bytes32) {
        return keccak256(abi.encodePacked(_seedInput.previousBlockHash, tokenId, _seedInput.blockTimestamp));
    }

    /**
     * @notice Efficient revert
     */
    function _revert(bytes4 errorSelector) private pure {
        assembly {
            mstore(0x00, errorSelector)
            revert(0x00, 0x04)
        }
    }
}

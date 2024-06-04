//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../../inchain-rendering/interfaces/IHLRenderer.sol";
import "../../interfaces/IERC721GeneralSupplyMetadata.sol";
import "../interfaces/IHLFS.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @notice Custom HL renderer for 404 by Shl0ms
 * @author highlight.xyz
 */
contract Renderer404 {
    /**
     * @notice Constant CIDs
     */
    string private constant _CREATOR_CID = "bafkreigki7ryypgtde7ykgy7zzkyabkwgu4nmqw6tyapfzmsbmknnnltau";
    string private constant _FILE_FORMAT_CID = "bafkreih5tlzemmxra3p635ljecifcefcyooplayoc77o3m4gxipz6ycism";
    string private constant _IMAGE_DIMENSIONS_CID = "bafkreigqorkwpylsg5mh4ve3ngw2mpm4ssk2nthbdljfl47oq7iqypqzve";

    /**
     * @notice See {IHLRenderer-tokenURI}
     */
    function tokenURI(uint256 tokenId) external view virtual returns (string memory) {
        return _tokenURI(tokenId, msg.sender);
    }

    /**
     * @notice tokenURI for easier inspection
     */
    function tokenURIInspection(uint256 tokenId, address collection) external view returns (string memory) {
        return _tokenURI(tokenId, collection);
    }

    /**
     * @notice Generate uri for a token
     */
    function _tokenURI(uint256 tokenId, address collection) private view returns (string memory) {
        uint256 limitSupply = IERC721GeneralSupplyMetadata(collection).limitSupply();
        if (limitSupply == 0 || tokenId > limitSupply || tokenId == 0) {
            revert("Invalid");
        }

        string memory tokenIdStr = Strings.toString(tokenId);
        if (tokenId < 10) {
            tokenIdStr = string(abi.encodePacked("00", tokenIdStr));
        } else if (tokenId < 100) {
            tokenIdStr = string(abi.encodePacked("0", tokenIdStr));
        }

        bytes memory metadataPt1 = abi.encodePacked(
            '{"name": "',
            IHLFS(collection).fileContents("monospace404.txt"),
            " // ",
            _getTraitCID(tokenId, collection, limitSupply, "monospaceTokenIds.txt", 12),
            '", "',
            'description": "',
            IHLFS(collection).fileContents("description.txt"),
            '", "',
            'image": "ipfs://',
            _getTraitCID(tokenId, collection, limitSupply, "images.txt", 59),
            '", "'
        );
        bytes memory metadataAttributesPt1 = abi.encodePacked(
            'attributes": ['
            '{"trait_type": "FILE FORMAT", "value": "ipfs://',
            _FILE_FORMAT_CID,
            '"}, ',
            '{"trait_type": "IMAGE DIMENSIONS", "value": "ipfs://',
            _IMAGE_DIMENSIONS_CID,
            '"}, ',
            '{"trait_type": "COLOR SCHEME", "value": "ipfs://',
            _getTraitCID(tokenId, collection, limitSupply, "colorSchemes.txt", 59),
            '"}, '
        );
        bytes memory metadataAttributesPt2 = abi.encodePacked(
            '{"trait_type": "MUSICAL ACCOMPANIMENT", "value": "ipfs://',
            _getTraitCID(tokenId, collection, limitSupply, "musicalAccompaniments.txt", 59),
            '"}, ',
            '{"trait_type": "CREATOR", "value": "ipfs://',
            _CREATOR_CID,
            '"}, ',
            '{"trait_type": "FILE NO.", "value": "',
            tokenIdStr,
            '"}]}'
        );

        return
            string(
                abi.encodePacked(
                    "data:application/json;base64,",
                    Base64.encode(abi.encodePacked(metadataPt1, metadataAttributesPt1, metadataAttributesPt2))
                )
            );
    }

    /**
     * @notice Get the CID for a token trait (image or attribute)
     */
    function _getTraitCID(
        uint256 tokenId,
        address collection,
        uint256 numTokens,
        string memory fileName,
        uint256 numBytesPerLine
    ) private view returns (string memory) {
        return _parseCIDsText(IHLFS(collection).fileContents(fileName), numTokens, numBytesPerLine)[tokenId - 1];
    }

    /**
     * @notice Parse out all CIDs in a text file
     */
    function _parseCIDsText(
        string memory cidsText,
        uint256 numLines,
        uint256 numBytesPerLine
    ) private pure returns (string[] memory) {
        // example CID, all lines expected to follow this format:
        // bafkreiapwnok3zsifqvdvotlgv4z5hfdi247wdxtmxa4u7tzfxsbysn3pa
        // 59 characters long
        // Parse lines that are 60 characters long (CID + \n) (for images.txt for eg.)

        string[] memory cids = new string[](numLines);

        uint256 arrayIndex = 0;
        bytes memory stringBytes = bytes(cidsText);
        uint256 i = 0;

        while (i < stringBytes.length && arrayIndex < numLines) {
            bytes memory line = new bytes(numBytesPerLine);
            for (uint j = 0; j < numBytesPerLine; j++) {
                line[j] = stringBytes[i];
                i++;
            }
            cids[arrayIndex] = string(line);
            arrayIndex++;

            // Skip the newline character
            if (i < stringBytes.length && stringBytes[i] == "\n") {
                i++;
            }
        }

        return cids;
    }
}

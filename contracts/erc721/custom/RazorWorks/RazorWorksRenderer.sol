//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../../inchain-rendering/interfaces/IHLRenderer.sol";
import "../../interfaces/IERC721GeneralSupplyMetadata.sol";
import "../interfaces/IHLFS.sol";
import "./interfaces/IBaseURI.sol";
import "./interfaces/IRazorWorksRenderer.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * @notice Custom HL renderer for Razor Works by Sten (on Forma)
 * @author highlight.xyz
 */
contract RazorWorksRenderer is IRazorWorksRenderer {
    /**
     * @notice Store the previous block hash for a minted token
     * @dev Not gas efficient
     */
    mapping(address => mapping(uint256 => bytes32)) private _tokenToPreviousBlockHash;

    /**
     * @notice See {IHlRenderer-processOneRecipientMint}
     * @dev Not gas efficient
     */
    function processOneRecipientMint(uint256 firstTokenId, uint256 numTokens, address recipient) external {
        for (uint256 i = firstTokenId; i < firstTokenId + numTokens; i++) {
            _tokenToPreviousBlockHash[msg.sender][i] = blockhash(block.number - 1);
        }
    }

    /**
     * @notice See {IHLRenderer-tokenURI}
     */
    function tokenURI(uint256 tokenId) external view virtual returns (string memory) {
        string memory baseURI = IBaseURI(msg.sender).baseURI();
        return bytes(baseURI).length != 0 ? string(abi.encodePacked(baseURI, "/", _toString(tokenId))) : "";
    }

    /**
     * @notice See {IRazorWorksRenderer-previousBlockHash}
     */
    function previousBlockHash(address nftContract, uint256 tokenId) external view returns (bytes32) {
        return _tokenToPreviousBlockHash[nftContract][tokenId];
    }

    /**
     * @dev Converts a uint256 to its ASCII string decimal representation.
     */
    function _toString(uint256 value) private pure returns (string memory str) {
        assembly {
            // The maximum value of a uint256 contains 78 digits (1 byte per digit), but
            // we allocate 0xa0 bytes to keep the free memory pointer 32-byte word aligned.
            // We will need 1 word for the trailing zeros padding, 1 word for the length,
            // and 3 words for a maximum of 78 digits. Total: 5 * 0x20 = 0xa0.
            let m := add(mload(0x40), 0xa0)
            // Update the free memory pointer to allocate.
            mstore(0x40, m)
            // Assign the `str` to the end.
            str := sub(m, 0x20)
            // Zeroize the slot after the string.
            mstore(str, 0)

            // Cache the end of the memory to calculate the length later.
            let end := str

            // We write the string from rightmost digit to leftmost digit.
            // The following is essentially a do-while loop that also handles the zero case.
            // prettier-ignore
            for { let temp := value } 1 {} {
                str := sub(str, 1)
                // Write the character to the pointer.
                // The ASCII index of the '0' character is 48.
                mstore8(str, add(48, mod(temp, 10)))
                // Keep dividing `temp` until zero.
                temp := div(temp, 10)
                // prettier-ignore
                if iszero(temp) { break }
            }

            let length := sub(end, str)
            // Move the pointer 32 bytes leftwards to make room for the length.
            str := sub(str, 0x20)
            // Store the length.
            mstore(str, length)
        }
    }
}

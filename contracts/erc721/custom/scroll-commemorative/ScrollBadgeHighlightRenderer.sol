//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "../../inchain-rendering/interfaces/IHLRenderer.sol";
import "../../interfaces/IERC721GeneralSupplyMetadata.sol";
import "../interfaces/IHLFS.sol";
import "../interfaces/IBaseURI.sol";
import "./IEAS.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "../../../utils/Ownable.sol";

error NotNftContract();

/**
 * @notice Custom HL renderer for Scroll on Highlight Commemorative mint that doles out badges
 * @author highlight.xyz
 */
contract ScrollBadgeHighlightRenderer is Ownable {
    address public constant EAS = 0xC47300428b6AD2c7D03BB76D05A176058b47E6B0;
    bytes32 public constant SCROLL_BADGE_SCHEMA = 0xd57de4f41c3d3cc855eadef68f98c0d4edd22d57161d96b7c06d2f4336cc3b49;

    address public badge;
    address public nftContract;

    function setBadge(address newBadge) external onlyOwner {
        badge = newBadge;
    }

    function setNftContract(address newNftContract) external onlyOwner {
        nftContract = newNftContract;
    }

    /**
     * @notice See {IHlRenderer-processOneRecipientMint}
     */
    function processOneRecipientMint(uint256 firstTokenId, uint256 numTokens, address recipient) external {
        if (msg.sender != nftContract) {
            revert NotNftContract();
        }

        bytes memory attestationData = abi.encode(badge, abi.encode(numTokens)); // address badge, bytes payload
        IEAS(EAS).attest(
            AttestationRequest(
                SCROLL_BADGE_SCHEMA,
                AttestationRequestData(
                    recipient,
                    0, // expiration time
                    false,
                    bytes32(0), // refUid
                    attestationData,
                    0 // value
                )
            )
        );
    }

    /**
     * @notice See {IHLRenderer-tokenURI}
     */
    function tokenURI(uint256 tokenId) external view virtual returns (string memory) {
        string memory baseURI = IBaseURI(msg.sender).baseURI();
        return bytes(baseURI).length != 0 ? string(abi.encodePacked(baseURI, "/", _toString(tokenId))) : "";
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

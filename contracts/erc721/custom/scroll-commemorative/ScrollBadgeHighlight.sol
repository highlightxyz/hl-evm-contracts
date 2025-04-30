//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import "./canvas-contracts/Common.sol";
import "./canvas-contracts/ScrollBadgeAccessControl.sol";
import "./ITokenUriResolver.sol";

contract ScrollBadgeHighlight is ScrollBadgeAccessControl {
    mapping(bytes32 => uint8) public attestationMintTier;
    address public tokenUriResolver;

    address public constant SCROLL_BADGE_RESOLVER = 0x4560FECd62B14A463bE44D40fE5Cfd595eEc0113;

    constructor() ScrollBadge(SCROLL_BADGE_RESOLVER) Ownable() {}

    function setTokenUriResolver(address newTokenUriResolver) external onlyOwner {
        tokenUriResolver = newTokenUriResolver;
    }

    function badgeTokenURI(bytes32 uid) public view override returns (string memory) {
        if (uid == bytes32(0)) {
            return ITokenUriResolver(tokenUriResolver).defaultTokenUri();
        }
        uint8 mintTier = attestationMintTier[uid];
        string memory tokenUri = ITokenUriResolver(tokenUriResolver).tierTokenUri(mintTier);

        return tokenUri;
    }

    function defaultTokenURI(bytes32 uid) public view returns (string memory) {
        return ITokenUriResolver(tokenUriResolver).defaultTokenUri();
    }

    function defaultTokenURI() public view returns (string memory) {
        return ITokenUriResolver(tokenUriResolver).defaultTokenUri();
    }

    function onIssueBadge(Attestation calldata attestation) internal virtual override returns (bool) {
        if (!super.onIssueBadge(attestation)) {
            return false;
        }

        (, bytes memory payload) = decodeBadgeData(attestation.data);
        uint256 numMinted = abi.decode(payload, (uint256));
        if (numMinted >= 1 && numMinted < 8) {
            attestationMintTier[attestation.uid] = 1;
        } else if (numMinted >= 8 && numMinted < 32) {
            attestationMintTier[attestation.uid] = 2;
        } else if (numMinted >= 32 && numMinted < 128) {
            attestationMintTier[attestation.uid] = 3;
        } else if (numMinted >= 128 && numMinted < 512) {
            attestationMintTier[attestation.uid] = 4;
        } else if (numMinted >= 512) {
            attestationMintTier[attestation.uid] = 5;
        }

        return true;
    }
}

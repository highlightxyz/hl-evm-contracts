// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./ITokenUriResolver.sol";

error InvalidAttestationUid();
error BadgeHasInvalidMintTier();

contract TokenUriResolver is ITokenUriResolver {
    function tierTokenUri(uint8 tier) external view returns (string memory) {
        if (tier == 0) {
            revert InvalidAttestationUid();
        } else if (tier == 1) {
            return "https://arweave.net/qpKYM-CeQ4fQ1QMdYPKKUr10vY377pKZRTwX7qqLB3Y";
        } else if (tier == 2) {
            return "https://arweave.net/O-64et_c2MEOTY9KGiRqGWuBu_TP54D_kZgUJeyHQCQ";
        } else if (tier == 3) {
            return "https://arweave.net/mxHazOMFscvaFNdkMvvSwRIxh24hX4143fHqQym397A";
        } else if (tier == 4) {
            return "https://arweave.net/_E6pWALvGUQ-vx2fASq-Ov8JzM5rcXpTKmmh6xKtyR8";
        } else if (tier == 5) {
            return "https://arweave.net/ZwCTv9Iu0GJw1lXdfHA9efUGbJe-tMKzxeyKlbqpeCQ";
        } else {
            revert BadgeHasInvalidMintTier();
        }
    }

    function defaultTokenUri() external view returns (string memory) {
        return "https://arweave.net/7Iqu8QLBfPZR6NDdt7whAEPiJHpFlHV_jKaTx_QASjg";
    }
}

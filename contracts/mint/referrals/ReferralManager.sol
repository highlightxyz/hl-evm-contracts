// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "./IReferralManagerView.sol";
import "../MintManager.sol";

contract ReferralManager is IReferralManagerView {
    /**
     * @notice Throw if referrer is passed in is tx sender
     */
    error InvalidReferrer_ReferralManager();

    /**
     * @notice Store the referrer for a tx
     */
    mapping(bytes32 => address) private _txReferrer;

    /**
     * @notice MintManager backup address
     */
    address private _backupMintManager;

    /**
     * @notice Initialize contract
     */
    constructor(address backupMintManager) {
        _backupMintManager = backupMintManager;
    }

    /**
     * @notice Mint via an abridged vector
     * @param vectorId ID of vector
     * @param numTokensToMint Number of tokens to mint
     * @param mintRecipient Who to mint the NFT(s) to
     * @param referrer Referrer
     */
    function vectorMint721WithReferral(
        uint256 vectorId,
        uint48 numTokensToMint,
        address mintRecipient,
        address referrer
    ) external payable {
        _txReferrer[_encodeCurrentTx(bytes32(vectorId))] = referrer;

        MintManager(_mintManager()).vectorMint721{ value: msg.value }(vectorId, numTokensToMint, mintRecipient);
    }

    /**
     * @notice Mint on a collection with sequentially minted token IDs with a valid claim
     * @param claim Claim
     * @param claimSignature Signed + encoded claim
     * @param mintRecipient Who to mint the NFT(s) to.
     *                      Can't mint to different recipient if tx isn't sent by claim.claimer.
     * @param referrer Referrer
     */
    function gatedNumMint721WithReferral(
        MintManager.Claim calldata claim,
        bytes calldata claimSignature,
        address mintRecipient,
        bool isEditionBased,
        address referrer
    ) external payable {
        _txReferrer[_encodeCurrentTx(claim.offchainVectorId)] = referrer;

        MintManager(_mintManager()).gatedNumMint{ value: msg.value }(
            claim,
            claimSignature,
            mintRecipient,
            isEditionBased
        );
    }

    /**
     * @notice Mint on a Series with a valid claim where one can choose the tokens to mint
     * @param claim Series Claim
     * @param claimSignature Signed + encoded claim
     * @param mintRecipient Who to mint the NFT(s) to.
     *                      Can't mint to different recipient if tx isn't sent by claim.claimer.
     * @param tokenIds IDs of NFTs to mint
     * @param referrer Referrer
     */
    function gatedChooseMint721WithReferral(
        MintManager.SeriesClaim calldata claim,
        bytes calldata claimSignature,
        address mintRecipient,
        uint256[] calldata tokenIds,
        address referrer
    ) external payable {
        _txReferrer[_encodeCurrentTx(claim.offchainVectorId)] = referrer;

        MintManager(_mintManager()).gatedSeriesMintChooseToken{ value: msg.value }(
            claim,
            claimSignature,
            mintRecipient,
            tokenIds
        );
    }

    /**
     * @notice Get referrer for a tx
     */
    function getReferrer(bytes32 vectorId, address txSender, uint256 blockNumber) external view returns (address) {
        return _txReferrer[_encodeTx(vectorId, txSender, blockNumber)];
    }

    /**
     * @notice Get referrer for a tx
     */
    function getCurrentReferrer(bytes32 vectorId) external view returns (address) {
        return _txReferrer[_encodeCurrentTx(vectorId)];
    }

    /**
     * @notice Encode tx for referrer
     */
    function _encodeCurrentTx(bytes32 vectorId) private view returns (bytes32) {
        return _encodeTx(vectorId, tx.origin, block.number);
    }

    /* solhint-disable code-complexity */
    /**
     * @notice Get the MintManager address
     */
    function _mintManager() private view returns (address) {
        if (block.chainid == 1) {
            return 0x1bf979282181f2b7a640d17aB5D2e25125F2de5e;
        } else if (block.chainid == 8453) {
            return 0x8087039152c472Fa74F47398628fF002994056EA;
        } else if (block.chainid == 10) {
            return 0xFafd47bb399d570b5AC95694c5D2a1fb5EA030bB;
        } else if (block.chainid == 7777777) {
            return 0x3AD45858a983D193D98BD4e6C14852a4cADcDBeA;
        } else if (block.chainid == 42161) {
            return 0x41cbab1028984A34C1338F437C726de791695AE8;
        } else if (block.chainid == 137) {
            return 0xfbb65C52f439B762F712026CF6DD7D8E82F81eb9;
        } else if (block.chainid == 84532) {
            return 0x41cbab1028984A34C1338F437C726de791695AE8;
        } else if (block.chainid == 11155111) {
            return 0xd698911B1Bb2a9c849Bf5e2604aF110766f396b6;
        } else if (block.chainid == 984122) {
            return 0xa594011DB733d09C1EEB347fb2f7dFc99d118ba1;
        } else if (block.chainid == 5000) {
            return 0xcD1127AC7Ae10A63E44ca3e3a8238D2d2cf1D455;
        } else if (block.chainid == 534352) {
            return 0x8087039152c472Fa74F47398628fF002994056EA;
        } else if (block.chainid == 324) {
            return 0xaDe57E0102bA4AC00E2f773EA810818BDa49cE23;
        } else if (block.chainid == 360 || block.chainid == 7560 || block.chainid == 33139) {
            return 0x3AD45858a983D193D98BD4e6C14852a4cADcDBeA;
        } else if (block.chainid == 543210) {
            return 0x98374013B4F96b64f8cB37E0aC8E3ee8dC390A2a;
        } else {
            return _backupMintManager;
        }
    }

    /**
     * @notice Encode tx for referrer
     */
    function _encodeTx(bytes32 vectorId, address txSender, uint256 blockNumber) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(vectorId, txSender, blockNumber));
    }
}

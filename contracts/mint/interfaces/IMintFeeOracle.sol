// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.10;

/**
 * @title MintManager interface for a mint fee oracle
 * @author highlight.xyz
 */
interface IMintFeeOracle {
    /**
     * @notice Process the mint fee for a classic mv
     * @param vectorId Vector ID
     * @param payoutCreatorReward Payout creator reward
     * @param vectorPaymentRecipient Vector payment recipient
     * @param currency Mint fee currency currency
     * @param amount Sale amount
     * @param minter Minter address
     * @param is1155 If collection contract is an 1155
     */
    function processClassicVectorMintFeeCap(
        bytes32 vectorId,
        bool payoutCreatorReward,
        address vectorPaymentRecipient,
        address currency,
        uint256 amount,
        address minter,
        bool is1155
    ) external payable returns (uint256);

    /**
     * @notice Get the mint fee cap for a classic mv
     * @param vectorId Vector ID (bytes32)
     * @param numToMint Number of tokens to mint in this transaction
     * @param minter Minter address
     * @param currency Sale currency
     * @param collectionContract Collection NFT contract
     */
    function getClassicVectorMintFeeCap(
        bytes32 vectorId,
        uint256 numToMint,
        address minter,
        address currency,
        address collectionContract
    ) external view returns (uint256, bool);

    /**
     * @notice Get the mint fee for a mechanic mint mv
     * @param vectorId Vector ID
     * @param numToMint Number of tokens to mint in this transaction
     * @param mechanic Address of mechanic facilitating mint
     * @param minter Address minting
     * @param collectionContract Collection NFT contract
     */
    function getMechanicMintFee(
        bytes32 vectorId,
        uint32 numToMint,
        address mechanic,
        address minter,
        address collectionContract
    ) external view returns (uint256);
}

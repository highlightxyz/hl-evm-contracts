import { BigNumber } from "@ethersproject/contracts/node_modules/@ethersproject/bignumber";
import { ethers } from "hardhat";

export const SAMPLE_VECTOR_1 = (
  address: string,
  paymentRecipient: string,
  maxTotalClaimableViaVector = 10,
  maxUserClaimableViaVector = 5,
  pricePerToken = 0,
  tokenLimitPerTx = 1,
  start = 0,
  end = 0,
  paused = 0,
  allowlistRoot = "",
) => {
  return {
    contractAddress: address,
    currency: ethers.constants.AddressZero,
    paymentRecipient: paymentRecipient,
    startTimestamp: start,
    endTimestamp: end,
    pricePerToken,
    tokenLimitPerTx,
    maxTotalClaimableViaVector,
    maxUserClaimableViaVector,
    totalClaimedViaVector: 0,
    allowlistRoot: ethers.utils.formatBytes32String(allowlistRoot),
    paused,
  };
};

export const SAMPLE_ABRIDGED_VECTOR = (
  contractAddress: string,
  paymentRecipient: string,
  editionBasedCollection: boolean,
  editionId: number = 0,
  maxTotalClaimableViaVector: number = 0,
  maxUserClaimableViaVector: number = 0,
  startTimestamp: number = 0,
  endTimestamp: number = 0,
  tokenLimitPerTx: number = 0,
  pricePerToken: BigNumber = ethers.utils.parseEther("0"),
  allowlistRoot: string = ethers.constants.HashZero,
  requireDirectEOA: boolean = false,
) => {
  return {
    contractAddress,
    currency: ethers.constants.AddressZero,
    totalClaimedViaVector: 0,
    startTimestamp,
    endTimestamp,
    paymentRecipient,
    maxTotalClaimableViaVector,
    tokenLimitPerTx,
    maxUserClaimableViaVector,
    pricePerToken,
    editionId,
    editionBasedCollection,
    requireDirectEOA,
    allowlistRoot,
  };
};

export const SAMPLE_ABRIDGED_VECTOR_UPDATE_CONFIG = ({
  updateMaxTotalClaimableViaVector,
  updateStartTimestamp,
  updateEndTimestamp,
  updatePaymentRecipient,
  updateTokenLimitPerTx,
  updateMaxUserClaimableViaVector,
  updatePricePerToken,
  updateAllowlistRoot,
  updatedRequireDirectEOA,
}: {
  updateMaxTotalClaimableViaVector?: boolean;
  updateStartTimestamp?: boolean;
  updateEndTimestamp?: boolean;
  updatePaymentRecipient?: boolean;
  updateTokenLimitPerTx?: boolean;
  updateMaxUserClaimableViaVector?: boolean;
  updatePricePerToken?: boolean;
  updateAllowlistRoot?: boolean;
  updatedRequireDirectEOA?: boolean;
}) => {
  return {
    updateStartTimestamp: updateStartTimestamp ? 1 : 0,
    updateEndTimestamp: updateEndTimestamp ? 1 : 0,
    updatePaymentRecipient: updatePaymentRecipient ? 1 : 0,
    updateMaxTotalClaimableViaVector: updateMaxTotalClaimableViaVector ? 1 : 0,
    updateTokenLimitPerTx: updateTokenLimitPerTx ? 1 : 0,
    updateMaxUserClaimableViaVector: updateMaxUserClaimableViaVector ? 1 : 0,
    updatePricePerToken: updatePricePerToken ? 1 : 0,
    updateAllowlistRoot: updateAllowlistRoot ? 1 : 0,
    updatedRequireDirectEOA: updatedRequireDirectEOA ? 1 : 0,
  };
};

export const SAMPLE_VECTOR_MUTABILITY_1 = (deleteFrozen = 0, pausesFrozen = 0, updatesFrozen = 0) => {
  return {
    deleteFrozen,
    pausesFrozen,
    updatesFrozen,
  };
};

export enum Errors {
  InvalidManager = "InvalidManager",
  ManagerDoesNotExist = "ManagerDoesNotExist",
  Unauthorized = "Unauthorized",
  NotMinter = "NotMinter",
  ManagerSwapBlocked = "ManagerSwapBlocked",
  ManagerRemoveBlocked = "ManagerRemoveBlocked",
  RoyaltySetBlocked = "RoyaltySetBlocked",
  RoyaltyBPSInvalid = "RoyaltyBPSInvalid",
  MinterRegistrationInvalid = "MinterRegistrationInvalid",
  EditionDoesNotExist = "EditionDoesNotExist",
  TokenDoesNotExist = "TokenDoesNotExist",
  MintFrozen = "MintFrozen",
  SoldOut = "SoldOut",
  InvalidSize = "InvalidSize",
  InvalidEditionIdsLength = "InvalidEditionIdsLength",
  TokenNotInRange = "TokenNotInRange",
  OverLimitSupply = "OverLimitSupply",
  MismatchedArrayLengths = "MismatchedArrayLengths",
  MetadataUpdateBlocked = "MetadataUpdateBlocked",
  InvalidEditionId = "InvalidEditionId",
  InvalidExecutorChanged = "InvalidExecutorChanged",
  VectorUpdateActionFrozen = "VectorUpdateActionFrozen",
  InvalidTotalClaimed = "InvalidTotalClaimed",
  AllowlistInvalid = "AllowlistInvalid",
  CurrencyTypeInvalid = "CurrencyTypeInvalid",
  MintFeeTooLow = "MintFeeTooLow",
  EtherSendFailed = "EtherSendFailed",
  SenderNotClaimer = "SenderNotClaimer",
  InvalidClaim = "InvalidClaim",
  InvalidPaymentAmount = "InvalidPaymentAmount",
  OnchainVectorMintGuardFailed = "OnchainVectorMintGuardFailed",
  EmptyString = "EmptyString",
  OwnerQueryForNonexistentToken = "OwnerQueryForNonexistentToken",
  TransferFromIncorrectOwner = "TransferFromIncorrectOwner",
  TokenMintedAlready = "TokenMintedAlready",
}

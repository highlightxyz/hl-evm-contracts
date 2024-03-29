import { BigNumber } from "@ethersproject/contracts/node_modules/@ethersproject/bignumber";
import { ethers } from "hardhat";

import { OnchainDutchAuctionParams } from "./helpers";

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
  updateRequireDirectEOA,
  updateMetadata,
}: {
  updateMaxTotalClaimableViaVector?: boolean;
  updateStartTimestamp?: boolean;
  updateEndTimestamp?: boolean;
  updatePaymentRecipient?: boolean;
  updateTokenLimitPerTx?: boolean;
  updateMaxUserClaimableViaVector?: boolean;
  updatePricePerToken?: boolean;
  updateAllowlistRoot?: boolean;
  updateRequireDirectEOA?: boolean;
  updateMetadata?: boolean;
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
    updateRequireDirectEOA: updateRequireDirectEOA ? 1 : 0,
    updateMetadata: updateMetadata ? 1 : 0,
  };
};

export const SAMPLE_DA_VECTOR = (
  mechanicAddress: string,
  input: {
    prices?: string[];
    periodDuration?: number;
    maxTotalClaimableViaVector?: number;
    maxUserClaimableViaVector?: number;
    startTimestamp?: number;
    endTimestamp?: number;
    tokenLimitPerTx?: number;
    seed?: string;
  },
): OnchainDutchAuctionParams => {
  return {
    mechanicAddress,
    prices: input.prices ?? ["0.001", "0.0001"],
    periodDuration: input.periodDuration ?? 100,
    maxTotalClaimableViaVector: input.maxTotalClaimableViaVector ?? 0,
    maxUserClaimableViaVector: input.maxUserClaimableViaVector ?? 0,
    startTimestamp: input.startTimestamp ?? Math.floor(Date.now() / 1000),
    endTimestamp: input.endTimestamp ?? 0,
    tokenLimitPerTx: input.tokenLimitPerTx ?? 0,
    seed: input.seed ?? Math.floor(Date.now() / 1000).toString(),
  };
};

export type DutchAuctionUpdateValues = {
  prices?: string[];
  periodDuration?: number;
  maxTotalClaimableViaVector?: number;
  maxUserClaimableViaVector?: number;
  startTimestamp?: number;
  endTimestamp?: number;
  tokenLimitPerTx?: number;
  paymentRecipient?: string;
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
  UnsafeMintRecipient = "UnsafeMintRecipient",
  MintPaused = "MintPaused",
  MechanicPaused = "MechanicPaused",
  InvalidMechanic = "InvalidMechanic",
  InvalidVectorConfig = "InvalidVectorConfig",
  InvalidUpdate = "InvalidUpdate",
  InvalidMint = "InvalidMint",
  InvalidRebate = "InvalidRebate",
  CollectorNotOwedRebate = "CollectorNotOwedRebate",
  InvalidDPPFundsWithdrawl = "InvalidDPPFundsWithdrawl",
}

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

export const SAMPLE_VECTOR_MUTABILITY_1 = (deleteFrozen = 0, pausesFrozen = 0, updatesFrozen = 0) => {
  return {
    deleteFrozen,
    pausesFrozen,
    updatesFrozen,
  };
};

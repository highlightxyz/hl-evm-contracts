import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "ethers";

import { EIP712 } from "./EIP712";

type ClaimInput = {
  currency: string;
  contractAddress: string;
  claimer: string;
  paymentRecipient: string;
  pricePerToken: string;
  numTokensToMint: number;
  maxClaimableViaVector: number;
  maxClaimablePerUser: number;
  editionId: number;
};

type SeriesClaimInput = {
  currency: string;
  contractAddress: string;
  claimer: string;
  paymentRecipient: string;
  pricePerToken: string;
  maxPerTxn: number;
  maxClaimableViaVector: number;
  maxClaimablePerUser: number;
};

type ClaimWithMetaTxPacketInput = {
  currency: string;
  contractAddress: string;
  claimer: string;
  pricePerToken: string;
  numTokensToMint: number;
  purchaseToCreatorPacket: PurchaserMetaTxPacket;
  purchaseToPlatformPacket: PurchaserMetaTxPacket;
  maxClaimableViaVector: number;
  maxClaimablePerUser: number;
  editionId: number;
};

type PurchaserMetaTxPacket = {
  functionSignature: string;
  sigR: string;
  sigS: string;
  sigV: number;
};

const MetaTransaction = [
  { name: "nonce", type: "uint256" },
  { name: "from", type: "address" },
  { name: "functionSignature", type: "bytes" },
];

export type Claim = ClaimInput & {
  claimExpiryTimestamp: string;
  claimNonce: string;
  offchainVectorId: string;
};

export type ClaimWithMetaTxPacket = ClaimWithMetaTxPacketInput & {
  claimExpiryTimestamp: string;
  claimNonce: string;
  offchainVectorId: string;
};

export type SeriesClaim = SeriesClaimInput & {
  claimExpiryTimestamp: string;
  claimNonce: string;
  offchainVectorId: string;
};

const Claim = [
  { name: "currency", type: "address" },
  { name: "contractAddress", type: "address" },
  { name: "claimer", type: "address" },
  { name: "paymentRecipient", type: "address" },
  { name: "pricePerToken", type: "uint256" },
  { name: "numTokensToMint", type: "uint64" },
  { name: "maxClaimableViaVector", type: "uint256" },
  { name: "maxClaimablePerUser", type: "uint256" },
  { name: "editionId", type: "uint256" },
  { name: "claimExpiryTimestamp", type: "uint256" },
  { name: "claimNonce", type: "bytes32" },
  { name: "offchainVectorId", type: "bytes32" },
];

const SeriesClaim = [
  { name: "currency", type: "address" },
  { name: "contractAddress", type: "address" },
  { name: "claimer", type: "address" },
  { name: "paymentRecipient", type: "address" },
  { name: "pricePerToken", type: "uint256" },
  { name: "maxPerTxn", type: "uint64" },
  { name: "maxClaimableViaVector", type: "uint64" },
  { name: "maxClaimablePerUser", type: "uint64" },
  { name: "claimExpiryTimestamp", type: "uint64" },
  { name: "claimNonce", type: "bytes32" },
  { name: "offchainVectorId", type: "bytes32" },
];

const ClaimWithMetaTxPacket = [
  { name: "currency", type: "address" },
  { name: "contractAddress", type: "address" },
  { name: "claimer", type: "address" },
  { name: "pricePerToken", type: "uint256" },
  { name: "numTokensToMint", type: "uint64" },
  { name: "purchaseToCreatorPacket", type: "PurchaserMetaTxPacket" },
  { name: "purchaseToPlatformPacket", type: "PurchaserMetaTxPacket" },
  { name: "maxClaimableViaVector", type: "uint256" },
  { name: "maxClaimablePerUser", type: "uint256" },
  { name: "editionId", type: "uint256" },
  { name: "claimExpiryTimestamp", type: "uint256" },
  { name: "claimNonce", type: "bytes32" },
  { name: "offchainVectorId", type: "bytes32" },
];

const PurchaserMetaTxPacket = [
  { name: "functionSignature", type: "bytes" },
  { name: "sigR", type: "bytes32" },
  { name: "sigS", type: "bytes32" },
  { name: "sigV", type: "uint8" },
];

function getWETHMetaTxTypeData(salt: string, verifyingContract: string) {
  return {
    types: {
      // EIP712Domain, do not pass EIP712Domain type into ethers, it will pre-compute for us
      MetaTransaction,
    },
    domain: {
      name: "Wrapped Ether",
      version: "1",
      verifyingContract,
      salt,
    },
    primaryType: "MetaTransaction",
  };
}

function buildClaim(
  input: ClaimInput | SeriesClaimInput | ClaimWithMetaTxPacketInput,
  offchainVectorId: string,
  claimNonce: string,
  claimExpiryTimestamp?: string,
): Claim | SeriesClaim | ClaimWithMetaTxPacket {
  offchainVectorId = ethers.utils.formatBytes32String(offchainVectorId);
  claimNonce = ethers.utils.formatBytes32String(claimNonce);

  return {
    ...input,
    claimExpiryTimestamp: claimExpiryTimestamp ?? (Math.floor(Date.now() / 1000) + 3600).toString(),
    claimNonce,
    offchainVectorId,
  }; // give users 1 hr to use
}

async function buildWETHTypedData(metaTx: any, contract: ethers.Contract) {
  const chainIdBytes = ethers.utils.hexZeroPad(
    ethers.utils.hexlify(await contract.provider.getNetwork().then(n => n.chainId)),
    32,
  );
  const typeData = getWETHMetaTxTypeData(chainIdBytes, contract.address);
  return { ...typeData, message: metaTx };
}

export async function signGatedMint(
  signer: SignerWithAddress,
  contract: ethers.Contract,
  value: ClaimInput,
  offchainVectorId: string,
  claimNonce: string,
  claimExpiryTimestamp?: string,
) {
  const chainId = await contract.provider.getNetwork().then(n => n.chainId);
  const claim = buildClaim(value, offchainVectorId, claimNonce, claimExpiryTimestamp) as Claim;
  const eip712 = new EIP712(contract, signer, claim, { Claim });
  const signature = await eip712.sign(EIP712.buildDomain("MintManager", "1.0.0", contract.address, chainId));
  return { signature, claim };
}

export async function signGatedSeriesMint(
  signer: SignerWithAddress,
  contract: ethers.Contract,
  value: SeriesClaimInput,
  offchainVectorId: string,
  claimNonce: string,
  claimExpiryTimestamp?: string,
) {
  const chainId = await contract.provider.getNetwork().then(n => n.chainId);
  const claim = buildClaim(value, offchainVectorId, claimNonce, claimExpiryTimestamp) as SeriesClaim;
  const eip712 = new EIP712(contract, signer, claim, { SeriesClaim });
  const signature = await eip712.sign(EIP712.buildDomain("MintManager", "1.0.0", contract.address, chainId));
  return { signature, claim };
}

export async function signGatedMintWithMetaTxPacket(
  signer: SignerWithAddress,
  contract: ethers.Contract,
  value: ClaimWithMetaTxPacketInput,
  offchainVectorId: string,
  claimNonce: string,
  claimExpiryTimestamp?: string,
) {
  const chainId = await contract.provider.getNetwork().then(n => n.chainId);
  const claim = buildClaim(value, offchainVectorId, claimNonce, claimExpiryTimestamp) as ClaimWithMetaTxPacket;
  const eip712 = new EIP712(contract, signer, claim, { PurchaserMetaTxPacket, ClaimWithMetaTxPacket });
  const signature = await eip712.sign(EIP712.buildDomain("MintManager", "1.0.0", contract.address, chainId));
  return { signature, claim };
}

export async function signWETHMetaTxRequest(
  signer: SignerWithAddress,
  contract: ethers.Contract,
  value: Record<string, string>,
) {
  const toSign = await buildWETHTypedData(value, contract);
  const signature = await signer._signTypedData(toSign.domain, toSign.types, toSign.message);
  const { r, s, v } = ethers.utils.splitSignature(signature);
  return { functionSignature: value.functionSignature, sigR: r, sigS: s, sigV: v };
}

export const getValidClaimTimestamp = () => (Math.floor(Date.now() / 1000) + 360000).toString();
export const getExpiredClaimTimestamp = () => (Math.floor(Date.now() / 1000) - 360000).toString();

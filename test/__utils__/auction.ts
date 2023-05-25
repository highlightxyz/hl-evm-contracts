import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "ethers";

import { EIP712 } from "./EIP712";

export type Claim = {
  auctionId: string;
  bidPrice: string;
  reservePrice: string;
  maxClaimsPerAccount: number;
  claimExpiryTimestamp: string;
  buffer: number;
  minimumIncrementPerBidPctBPS: number;
  claimer: string;
};

const Claim = [
  { name: "auctionId", type: "bytes32" },
  { name: "bidPrice", type: "uint256" },
  { name: "reservePrice", type: "uint256" },
  { name: "maxClaimsPerAccount", type: "uint256" },
  { name: "claimExpiryTimestamp", type: "uint256" },
  { name: "buffer", type: "uint256" },
  { name: "minimumIncrementPerBidPctBPS", type: "uint256" },
  { name: "claimer", type: "address" },
];

function buildClaim(input: Claim): Claim {
  input.auctionId = ethers.utils.formatBytes32String(input.auctionId);
  input.bidPrice = ethers.utils.parseEther(input.bidPrice).toString();
  input.reservePrice = ethers.utils.parseEther(input.reservePrice).toString();
  if (input.claimExpiryTimestamp == "0") {
    input.claimExpiryTimestamp = getValidClaimTimestamp();
  }

  return input;
}

export async function signGatedBid(signer: SignerWithAddress, auctionManager: ethers.Contract, claimInput: Claim) {
  const chainId = await auctionManager.provider.getNetwork().then(n => n.chainId);
  const claim = buildClaim(claimInput) as Claim;
  const eip712 = new EIP712(auctionManager, signer, claim, { Claim });
  const signature = await eip712.sign(EIP712.buildDomain("AuctionManager", "1.0.0", auctionManager.address, chainId));
  return { signature, claim };
}

export const getValidClaimTimestamp = () => (Math.floor(Date.now() / 1000) + 360000).toString();

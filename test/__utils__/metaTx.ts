import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { MinimalForwarder } from "../types";

type Input2771 = {
  from: string; // signer address
  to: string; // contract being called
  gas: number; // expected gas units for operation
  data: string; // encoded function call on contract with arguments
};

type ForwardRequest = {
  from: string;
  to: string;
  value: number;
  gas: number;
  nonce: string;
  data: string;
};

const MINIMAL_FORWARDER_GAS_UNIT_CONSUMPTION = 60000;

const ForwardRequest = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "gas", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "data", type: "bytes" },
];

function get2771MetaTxTypeData(chainId: number, verifyingContract: string) {
  return {
    types: {
      // EIP712Domain, do not pass EIP712Domain type into ethers, it will pre-compute for us
      ForwardRequest,
    },
    domain: {
      name: "MinimalForwarder",
      version: "0.0.1",
      chainId,
      verifyingContract,
    },
    primaryType: "ForwardRequest",
  };
}

async function build2771Request(forwarder: MinimalForwarder, input: Input2771, overrideNonce?: number) {
  const nonce = await forwarder.getNonce(input.from);
  return { value: 0, nonce: overrideNonce == null ? nonce.toString() : overrideNonce.toString(), ...input };
}

async function build2771TypedData(forwarder: MinimalForwarder, request: ForwardRequest) {
  const chainId = await forwarder.provider.getNetwork().then(n => n.chainId);
  const typeData = get2771MetaTxTypeData(chainId, forwarder.address);
  return { ...typeData, message: request };
}

export async function sign2771MetaTxRequest(
  signer: SignerWithAddress,
  forwarder: MinimalForwarder,
  input: Input2771,
  overrideNonce?: number,
) {
  const request = await build2771Request(forwarder, input, overrideNonce);
  const toSign = await build2771TypedData(forwarder, request);
  const signature = await signer._signTypedData(toSign.domain, toSign.types, toSign.message);
  return { signature, request };
}

import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TypedDataDomain, TypedDataField, ethers } from "ethers";

export type EIP712Types = Record<string, Array<TypedDataField>>;

export class EIP712 {
  contract: ethers.Contract;
  signer: SignerWithAddress;
  message: Record<string, any>;
  types: EIP712Types;
  constructor(contract: ethers.Contract, signer: SignerWithAddress, message: Record<string, any>, types: EIP712Types) {
    this.contract = contract;
    this.signer = signer;
    this.message = message;
    this.types = types;
  }

  static buildDomain(
    name: string,
    version: string,
    verifyingContract: string,
    chainId?: number,
    salt?: string,
  ): TypedDataDomain {
    const domain: TypedDataDomain = {
      name,
      version,
      verifyingContract,
    };
    if (salt) domain.salt = salt;
    if (chainId) domain.chainId = chainId;
    return domain;
  }

  buildTypedData(domain: TypedDataDomain) {
    return {
      types: this.types,
      domain,
      message: this.message,
    };
  }

  async sign(domain: TypedDataDomain): Promise<string> {
    const typedData = this.buildTypedData(domain);
    return await this.signer._signTypedData(typedData.domain, typedData.types, typedData.message);
  }
}

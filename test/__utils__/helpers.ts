import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, BytesLike } from "ethers";
import { ethers } from "hardhat";

import {
  AuctionManager__factory,
  DiscreteDutchAuctionMechanic,
  DiscreteDutchAuctionMechanic__factory,
  ERC1155YungWkndOnChain,
  ERC1155YungWkndOnChain__factory,
  ERC721Editions,
  ERC721EditionsDFS,
  ERC721EditionsDFS__factory,
  ERC721Editions__factory,
  ERC721General,
  ERC721General__factory,
  ERC721Generative__factory,
  ERC721SingleEdition,
  ERC721SingleEditionDFS,
  ERC721SingleEditionDFS__factory,
  ERC721SingleEdition__factory,
  EditionsMetadataRenderer__factory,
  IERC20__factory,
  MinimalForwarder__factory,
  MintManager__factory,
  NativeMetaTransaction__factory,
  Observability__factory,
} from "../../types";
import { DutchAuctionUpdateValues } from "./data";
import { signGatedMint, signGatedMintWithMetaTxPacket, signGatedSeriesMint, signWETHMetaTxRequest } from "./mint";

export type OnchainMintVectorParams = {
  startTimestamp: number;
  endTimestamp: number;
  pricePerToken: BigNumber;
  tokenLimitPerTx: number;
  maxTotalClaimableViaVector: number;
  maxUserClaimableViaVector: number;
  allowlistRoot: string;
  editionId?: number;
};

export type OnchainDutchAuctionParams = {
  startTimestamp: number;
  endTimestamp: number;
  prices: string[];
  periodDuration: number;
  tokenLimitPerTx: number;
  maxTotalClaimableViaVector: number;
  maxUserClaimableViaVector: number;
  mechanicAddress: string;
  seed: string;
};

export const DEFAULT_ONCHAIN_MINT_VECTOR: OnchainMintVectorParams = {
  startTimestamp: 0,
  endTimestamp: 0,
  pricePerToken: ethers.utils.parseEther("0"),
  tokenLimitPerTx: 0,
  maxTotalClaimableViaVector: 0,
  maxUserClaimableViaVector: 0,
  allowlistRoot: ethers.constants.HashZero,
};

export const setupSingleEdition = async (
  observabilityAddress: string,
  singleImplementationAddress: string,
  mintManagerAddress: string,
  trustedForwarderAddress: string,
  emrAddress: string,
  creator: SignerWithAddress,
  size: number,
  name: string,
  symbol: string,
  directMint: OnchainMintVectorParams | null = null,
  mechanicMint: OnchainDutchAuctionParams | null = null,
  useMarketplaceFilter = false,
  defaultTokenManager = ethers.constants.AddressZero,
  royaltyRecipient = ethers.constants.AddressZero,
  royaltyPercentage = 0,
  contractUri = "",
  description = "",
  imageUrl = "",
  animationUrl = "",
  externalUrl = "",
  attributes = "",
): Promise<ERC721SingleEdition> => {
  const editionInfo = ethers.utils.defaultAbiCoder.encode(
    ["tuple(string, string, string, string, string, string)"],
    [[name, description, imageUrl, animationUrl, externalUrl, attributes]],
  );

  const initializeData = ethers.utils.defaultAbiCoder.encode(
    [
      "address",
      "tuple(address, uint16)",
      "address",
      "string",
      "string",
      "string",
      "uint256",
      "address",
      "address",
      "address",
      "bool",
      "bytes",
    ],
    [
      creator.address,
      [royaltyRecipient, royaltyPercentage],
      defaultTokenManager,
      contractUri,
      name,
      symbol,
      size,
      emrAddress,
      trustedForwarderAddress,
      mintManagerAddress,
      useMarketplaceFilter,
      editionInfo,
    ],
  );

  const mintVectorData = directMint
    ? ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint48", "uint48", "uint192", "uint48", "uint48", "uint48", "bytes32"],
        [
          mintManagerAddress,
          creator.address,
          directMint.startTimestamp,
          directMint.endTimestamp,
          directMint.pricePerToken,
          directMint.tokenLimitPerTx,
          directMint.maxTotalClaimableViaVector,
          directMint.maxUserClaimableViaVector,
          ethers.constants.HashZero,
        ],
      )
    : "0x";

  const SingleEdition = await (
    await ethers.getContractFactory("SingleEdition")
  ).deploy(
    singleImplementationAddress,
    initializeData,
    mintVectorData,
    encodeMechanicVectorData(mintManagerAddress, creator.address, mechanicMint),
    observabilityAddress,
  );
  const singleEdition = await SingleEdition.deployed();
  return ERC721SingleEdition__factory.connect(singleEdition.address, creator);
};

export const setupSingleEditionDFS = async (
  observabilityAddress: string,
  singleEditionDFSImplementationAddress: string,
  mintManagerAddress: string,
  trustedForwarderAddress: string,
  creator: SignerWithAddress,
  size: number,
  name: string,
  symbol: string,
  directMint: OnchainMintVectorParams | null = null,
  mechanicMint: OnchainDutchAuctionParams | null = null,
  useMarketplaceFilter = false,
  defaultTokenManager = ethers.constants.AddressZero,
  royaltyRecipient = ethers.constants.AddressZero,
  royaltyPercentage = 0,
  contractUri = "",
  editionUri = "editionUri",
): Promise<ERC721SingleEditionDFS> => {
  const initializeData = ethers.utils.defaultAbiCoder.encode(
    [
      "address",
      "tuple(address, uint16)",
      "address",
      "string",
      "string",
      "string",
      "uint256",
      "address",
      "address",
      "bool",
      "string",
    ],
    [
      creator.address,
      [royaltyRecipient, royaltyPercentage],
      defaultTokenManager,
      contractUri,
      name,
      symbol,
      size,
      trustedForwarderAddress,
      mintManagerAddress,
      useMarketplaceFilter,
      editionUri,
    ],
  );

  const mintVectorData = directMint
    ? ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint48", "uint48", "uint192", "uint48", "uint48", "uint48", "bytes32"],
        [
          mintManagerAddress,
          creator.address,
          directMint.startTimestamp,
          directMint.endTimestamp,
          directMint.pricePerToken,
          directMint.tokenLimitPerTx,
          directMint.maxTotalClaimableViaVector,
          directMint.maxUserClaimableViaVector,
          ethers.constants.HashZero,
        ],
      )
    : "0x";

  const SingleEditionDFS = await (
    await ethers.getContractFactory("SingleEditionDFS")
  ).deploy(
    singleEditionDFSImplementationAddress,
    initializeData,
    mintVectorData,
    encodeMechanicVectorData(mintManagerAddress, creator.address, mechanicMint),
    observabilityAddress,
  );
  const singleEditionDFS = await SingleEditionDFS.deployed();
  return ERC721SingleEditionDFS__factory.connect(singleEditionDFS.address, creator);
};

// sets up MultipleEditions without first edition
export const setupEditions = async (
  observabilityAddress: string,
  editionsImplementationAddress: string,
  mintManagerAddress: string,
  auctionManagerAddress: string,
  trustedForwarderAddress: string,
  emrAddress: string,
  creator: SignerWithAddress,
  directMint: OnchainMintVectorParams | null = null,
  mechanicMint: OnchainDutchAuctionParams | null = null,
  defaultTokenManager = ethers.constants.AddressZero,
  royaltyRecipient = ethers.constants.AddressZero,
  royaltyPercentage = 0,
  useMarketplaceFilter = false,
  name = "dummy",
  symbol = "DMY",
  contractUri = "dummyContractMetadata",
): Promise<ERC721Editions> => {
  const initializeData = ethers.utils.defaultAbiCoder.encode(
    ["address", "string", "string", "string", "address", "address", "address[]", "bool", "address"],
    [
      creator.address,
      contractUri,
      name,
      symbol,
      emrAddress,
      trustedForwarderAddress,
      [mintManagerAddress, auctionManagerAddress],
      useMarketplaceFilter,
      observabilityAddress,
    ],
  );

  const mintVectorData = directMint
    ? ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint48", "uint48", "uint192", "uint48", "uint48", "uint48", "bytes32"],
        [
          mintManagerAddress,
          creator.address,
          directMint.startTimestamp,
          directMint.endTimestamp,
          directMint.pricePerToken,
          directMint.tokenLimitPerTx,
          directMint.maxTotalClaimableViaVector,
          directMint.maxUserClaimableViaVector,
          ethers.constants.HashZero,
        ],
      )
    : "0x";

  const MultipleEditions = await (
    await ethers.getContractFactory("MultipleEditions", creator)
  ).deploy(
    editionsImplementationAddress,
    initializeData,
    ethers.utils.arrayify("0x"),
    0,
    ethers.constants.AddressZero,
    {
      recipientAddress: royaltyRecipient,
      royaltyPercentageBPS: royaltyPercentage,
    },
    ethers.utils.arrayify("0x"),
    mintVectorData,
    encodeMechanicVectorData(mintManagerAddress, creator.address, mechanicMint),
  );
  const multipleEditions = await MultipleEditions.deployed();

  const multipleEditionsCreator = ERC721Editions__factory.connect(multipleEditions.address, creator);

  if (defaultTokenManager != ethers.constants.AddressZero) {
    const tx = await multipleEditionsCreator.setDefaultTokenManager(defaultTokenManager);
    await tx.wait();
  }

  return multipleEditionsCreator;
};

// sets up MultipleEditions without first edition
export const setupYungWknd = async (
  observabilityAddress: string,
  editionsImplementationAddress: string,
  mintManagerAddress: string,
  auctionManagerAddress: string,
  trustedForwarderAddress: string,
  emrAddress: string,
  creator: SignerWithAddress,
  _directMint: OnchainMintVectorParams | null = null,
  _mechanicMint: OnchainDutchAuctionParams | null = null,
  defaultTokenManager = ethers.constants.AddressZero,
  royaltyRecipient = ethers.constants.AddressZero,
  royaltyPercentage = 0,
  useMarketplaceFilter = false,
  name = "dummy",
  symbol = "DMY",
  contractUri = "dummyContractMetadata",
  baseUri = "baseUri",
  codeUri = "codeUri",
  limitSupply = 0,
): Promise<ERC1155YungWkndOnChain> => {
  const initializeData = ethers.utils.defaultAbiCoder.encode(
    [
      "address",
      "string",
      "tuple(address, uint16)",
      "address",
      "string",
      "string",
      "address",
      "address",
      "string",
      "string",
      "uint256",
      "bool",
    ],
    [
      creator.address,
      contractUri,
      [royaltyRecipient, royaltyPercentage],
      defaultTokenManager,
      name,
      symbol,
      trustedForwarderAddress,
      mintManagerAddress,
      codeUri,
      baseUri,
      limitSupply,
      useMarketplaceFilter,
    ],
  );

  const OnChainC = await (
    await ethers.getContractFactory("ERC1155YungWkndOnChain", creator)
  ).deploy();



  //   editionsImplementationAddress,
  //   initializeData,
  //   ethers.utils.arrayify("0x"),
  //   0,
  //   ethers.constants.AddressZero,
  //   {
  //     recipientAddress: royaltyRecipient,
  //     royaltyPercentageBPS: royaltyPercentage,
  //   },
  //   ethers.utils.arrayify("0x"),
  //   mintVectorData,
  //   encodeMechanicVectorData(mintManagerAddress, creator.address, mechanicMint),
  // );
  const onChainC = await OnChainC.deployed();

  await onChainC.initialize(
    initializeData,
    observabilityAddress
  )

  const multipleEditionsCreator = ERC1155YungWkndOnChain__factory.connect(onChainC.address, creator);

  // if (defaultTokenManager != ethers.constants.AddressZero) {
  //   const tx = await multipleEditionsCreator.setDefaultTokenManager(defaultTokenManager);
  //   await tx.wait();
  // }

  return multipleEditionsCreator;
};


// sets up MultipleEditionsDFS without first edition
export const setupEditionsDFS = async (
  observabilityAddress: string,
  editionsDFSImplementationAddress: string,
  mintManagerAddress: string,
  auctionManagerAddress: string,
  trustedForwarderAddress: string,
  creator: SignerWithAddress,
  directMint: OnchainMintVectorParams | null = null,
  mechanicMint: OnchainDutchAuctionParams | null = null,
  editionUri = "",
  defaultTokenManager = ethers.constants.AddressZero,
  royaltyRecipient = ethers.constants.AddressZero,
  royaltyPercentage = 0,
  useMarketplaceFilter = false,
  name = "dummy",
  symbol = "DMY",
  contractUri = "dummyContractMetadata",
): Promise<ERC721EditionsDFS> => {
  const initializeData = ethers.utils.defaultAbiCoder.encode(
    ["address", "string", "string", "string", "address", "address[]", "bool", "address"],
    [
      creator.address,
      contractUri,
      name,
      symbol,
      trustedForwarderAddress,
      [mintManagerAddress, auctionManagerAddress],
      useMarketplaceFilter,
      observabilityAddress,
    ],
  );

  const mintVectorData = directMint
    ? ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint48", "uint48", "uint192", "uint48", "uint48", "uint48", "bytes32"],
        [
          mintManagerAddress,
          creator.address,
          directMint.startTimestamp,
          directMint.endTimestamp,
          directMint.pricePerToken,
          directMint.tokenLimitPerTx,
          directMint.maxTotalClaimableViaVector,
          directMint.maxUserClaimableViaVector,
          ethers.constants.HashZero,
        ],
      )
    : "0x";

  const MultipleEditionsDFS = await (
    await ethers.getContractFactory("MultipleEditionsDFS", creator)
  ).deploy(
    editionsDFSImplementationAddress,
    initializeData,
    editionUri,
    0,
    ethers.constants.AddressZero,
    {
      recipientAddress: royaltyRecipient,
      royaltyPercentageBPS: royaltyPercentage,
    },
    ethers.utils.arrayify("0x"),
    mintVectorData,
    encodeMechanicVectorData(mintManagerAddress, creator.address, mechanicMint),
  );
  const multipleEditionsDFS = await MultipleEditionsDFS.deployed();

  const multipleEditionsCreator = ERC721EditionsDFS__factory.connect(multipleEditionsDFS.address, creator);

  if (defaultTokenManager != ethers.constants.AddressZero) {
    const tx = await multipleEditionsCreator.setDefaultTokenManager(defaultTokenManager);
    await tx.wait();
  }

  return multipleEditionsCreator;
};

// sets up MultipleEditions with first edition
export const setupMultipleEdition = async (
  observabilityAddress: string,
  editionsImplementationAddress: string,
  mintVectorAddress: string,
  auctionManagerAddress: string,
  trustedForwarderAddress: string,
  emrAddress: string,
  creator: SignerWithAddress,
  size: number,
  name: string,
  symbol: string,
  directMint: OnchainMintVectorParams | null = null,
  mechanicMint: OnchainDutchAuctionParams | null = null,
  useMarketplaceFilter = false,
  contractName = "contractName",
  royaltyPercentage = 0,
  royaltyRecipient = ethers.constants.AddressZero,
  contractUri = "",
  description = "",
  imageUrl = "",
  animationUrl = "",
  externalUrl = "",
  attributes = "",
): Promise<ERC721Editions> => {
  const initializeData = ethers.utils.defaultAbiCoder.encode(
    ["address", "string", "string", "string", "address", "address", "address[]", "bool", "address"],
    [
      creator.address,
      contractUri,
      contractName,
      symbol,
      emrAddress,
      trustedForwarderAddress,
      [mintVectorAddress, auctionManagerAddress],
      useMarketplaceFilter,
      observabilityAddress,
    ],
  );

  const defaultEditionInfo = ethers.utils.defaultAbiCoder.encode(
    ["tuple(string, string, string, string, string, string)"],
    [[name, description, imageUrl, animationUrl, externalUrl, attributes]],
  );

  const mintVectorData = directMint
    ? ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint48", "uint48", "uint192", "uint48", "uint48", "uint48", "bytes32"],
        [
          mintVectorAddress,
          creator.address,
          directMint.startTimestamp,
          directMint.endTimestamp,
          directMint.pricePerToken,
          directMint.tokenLimitPerTx,
          directMint.maxTotalClaimableViaVector,
          directMint.maxUserClaimableViaVector,
          ethers.constants.HashZero,
        ],
      )
    : "0x";

  const MultipleEditions = await (
    await ethers.getContractFactory("MultipleEditions", creator)
  ).deploy(
    editionsImplementationAddress,
    initializeData,
    defaultEditionInfo,
    size,
    ethers.constants.AddressZero,
    {
      recipientAddress: royaltyRecipient,
      royaltyPercentageBPS: royaltyPercentage,
    },
    ethers.utils.arrayify("0x"),
    mintVectorData,
    encodeMechanicVectorData(mintVectorAddress, creator.address, mechanicMint),
  );
  const multipleEditions = await MultipleEditions.deployed();

  return ERC721Editions__factory.connect(multipleEditions.address, creator);
};

// sets up MultipleEditionsDFS with first edition
export const setupMultipleEditionDFS = async (
  observabilityAddress: string,
  editionsDFSImplementationAddress: string,
  mintVectorAddress: string,
  auctionManagerAddress: string,
  trustedForwarderAddress: string,
  creator: SignerWithAddress,
  size: number,
  symbol: string,
  directMint: OnchainMintVectorParams | null = null,
  mechanicMint: OnchainDutchAuctionParams | null = null,
  editionUri: string = "uri",
  useMarketplaceFilter = false,
  contractName = "contractName",
  royaltyPercentage = 0,
  royaltyRecipient = ethers.constants.AddressZero,
  contractUri = "",
): Promise<ERC721EditionsDFS> => {
  const initializeData = ethers.utils.defaultAbiCoder.encode(
    ["address", "string", "string", "string", "address", "address[]", "bool", "address"],
    [
      creator.address,
      contractUri,
      contractName,
      symbol,
      trustedForwarderAddress,
      [mintVectorAddress, auctionManagerAddress],
      useMarketplaceFilter,
      observabilityAddress,
    ],
  );

  const mintVectorData = directMint
    ? ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint48", "uint48", "uint192", "uint48", "uint48", "uint48", "bytes32"],
        [
          mintVectorAddress,
          creator.address,
          directMint.startTimestamp,
          directMint.endTimestamp,
          directMint.pricePerToken,
          directMint.tokenLimitPerTx,
          directMint.maxTotalClaimableViaVector,
          directMint.maxUserClaimableViaVector,
          ethers.constants.HashZero,
        ],
      )
    : "0x";

  const MultipleEditionsDFS = await (
    await ethers.getContractFactory("MultipleEditionsDFS", creator)
  ).deploy(
    editionsDFSImplementationAddress,
    initializeData,
    editionUri,
    size,
    ethers.constants.AddressZero,
    {
      recipientAddress: royaltyRecipient,
      royaltyPercentageBPS: royaltyPercentage,
    },
    ethers.utils.arrayify("0x"),
    mintVectorData,
    encodeMechanicVectorData(mintVectorAddress, creator.address, mechanicMint),
  );
  const multipleEditionsDFS = await MultipleEditionsDFS.deployed();

  return ERC721EditionsDFS__factory.connect(multipleEditionsDFS.address, creator);
};

export const generateClaim = async (
  mintManagerOwner: SignerWithAddress,
  mintManagerAddress: string,
  contractAddress: string,
  claimer: string,
  paymentRecipient: string,
  claimExpiryTimestamp: string = (Math.floor(Date.now() / 1000) + 360000).toString(),
  pricePerToken = "0",
  numTokensToMint = 1,
  maxClaimableViaVector = 0,
  maxClaimablePerUser = 0,
  editionId = 0,
  offchainVectorId = "randomVectorId",
  claimNonce = "randomClaimNonce",
  currency: string = ethers.constants.AddressZero,
) => {
  const mintManager = await MintManager__factory.connect(mintManagerAddress, mintManagerOwner);

  return await signGatedMint(
    mintManagerOwner,
    mintManager,
    {
      currency,
      contractAddress,
      claimer,
      paymentRecipient,
      pricePerToken: ethers.utils.parseEther(pricePerToken).toString(),
      numTokensToMint,
      maxClaimableViaVector,
      maxClaimablePerUser,
      editionId,
    },
    offchainVectorId,
    claimNonce,
    claimExpiryTimestamp,
  );
};

export const generateSeriesClaim = async (
  mintManagerOwner: SignerWithAddress,
  mintManagerAddress: string,
  contractAddress: string,
  claimer: string,
  paymentRecipient: string,
  maxPerTxn: number,
  claimExpiryTimestamp: string = (Math.floor(Date.now() / 1000) + 360000).toString(),
  pricePerToken = "0",
  maxClaimableViaVector = 0,
  maxClaimablePerUser = 0,
  offchainVectorId = "randomVectorId",
  claimNonce = "randomClaimNonce",
  currency: string = ethers.constants.AddressZero,
) => {
  const mintManager = await MintManager__factory.connect(mintManagerAddress, mintManagerOwner);

  return await signGatedSeriesMint(
    mintManagerOwner,
    mintManager,
    {
      currency,
      contractAddress,
      claimer,
      paymentRecipient,
      pricePerToken: ethers.utils.parseEther(pricePerToken).toString(),
      maxPerTxn,
      maxClaimableViaVector,
      maxClaimablePerUser,
    },
    offchainVectorId,
    claimNonce,
    claimExpiryTimestamp,
  );
};

export const generateClaimWithMetaTxPackets = async (
  mintManagerOwner: SignerWithAddress,
  claimer: SignerWithAddress,
  mintManagerAddress: string,
  contractAddress: string,
  paymentRecipient: string,
  currency: string,
  claimExpiryTimestamp: string = (Math.floor(Date.now() / 1000) + 3600).toString(),
  pricePerToken = "0",
  numTokensToMint = 1,
  maxClaimableViaVector = 10,
  maxClaimablePerUser = 10,
  editionId = 0,
  offchainVectorId = "randomVectorId",
  claimNonce = "randomClaimNonce",
) => {
  const wETHWei = ethers.utils.parseUnits(pricePerToken, 18).mul(BigNumber.from(numTokensToMint));
  const wETHWeiToCreator = wETHWei.mul(95).div(100);
  const wETHWeiToPlatform = wETHWei.mul(5).div(100);

  const erc20 = await IERC20__factory.connect(currency, mintManagerOwner);
  const transferToCreatorData = erc20.interface.encodeFunctionData("transfer", [paymentRecipient, wETHWeiToCreator]);
  const transferToPlatformData = erc20.interface.encodeFunctionData("transfer", [
    mintManagerAddress,
    wETHWeiToPlatform,
  ]);
  const metaTxContract = await NativeMetaTransaction__factory.connect(currency, mintManagerOwner);
  const nonce = await metaTxContract.getNonce(claimer.address);
  const purchaseToCreatorPacket = await signWETHMetaTxRequest(claimer, erc20, {
    from: claimer.address,
    functionSignature: transferToCreatorData,
    nonce: nonce.toString(),
  });
  const purchaseToPlatformPacket = await signWETHMetaTxRequest(claimer, erc20, {
    from: claimer.address,
    functionSignature: transferToPlatformData,
    nonce: nonce.add(1).toString(),
  });

  const mintManager = await MintManager__factory.connect(mintManagerAddress, mintManagerOwner);

  return await signGatedMintWithMetaTxPacket(
    mintManagerOwner,
    mintManager,
    {
      currency,
      contractAddress,
      claimer: claimer.address,
      purchaseToCreatorPacket,
      purchaseToPlatformPacket,
      pricePerToken: ethers.utils.parseEther(pricePerToken).toString(),
      numTokensToMint,
      maxClaimableViaVector,
      maxClaimablePerUser,
      editionId,
    },
    offchainVectorId,
    claimNonce,
    claimExpiryTimestamp,
  );
};

export const setupGeneral = async (
  observabilityAddress: string,
  generalImplementationAddress: string,
  trustedForwarderAddress: string,
  mintManagerAddress: string,
  creator: SignerWithAddress,
  directMint: OnchainMintVectorParams | null = null,
  mechanicMint: OnchainDutchAuctionParams | null = null,
  isCollectorsChoice: boolean = false,
  useMarketplaceFilter = false,
  limitSupply = 0,
  defaultTokenManager = ethers.constants.AddressZero,
  royaltyRecipient = ethers.constants.AddressZero,
  royaltyPercentage = 0,
  name = "dummy",
  symbol = "DMY",
  baseUri = "baseUri",
  contractUri = "dummyContractMetadata",
): Promise<ERC721General> => {
  const initializeData = ethers.utils.defaultAbiCoder.encode(
    [
      "address",
      "string",
      "tuple(address, uint16)",
      "address",
      "string",
      "string",
      "address",
      "address",
      "string",
      "uint256",
      "bool",
      "address",
    ],
    [
      creator.address,
      contractUri,
      [royaltyRecipient, royaltyPercentage],
      defaultTokenManager,
      name,
      symbol,
      trustedForwarderAddress,
      mintManagerAddress,
      baseUri,
      limitSupply,
      useMarketplaceFilter,
      observabilityAddress,
    ],
  );

  const vectorData = directMint
    ? ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint48", "uint48", "uint192", "uint48", "uint48", "uint48", "bytes32"],
        [
          mintManagerAddress,
          creator.address,
          directMint.startTimestamp,
          directMint.endTimestamp,
          directMint.pricePerToken,
          directMint.tokenLimitPerTx,
          directMint.maxTotalClaimableViaVector,
          directMint.maxUserClaimableViaVector,
          ethers.constants.HashZero,
        ],
      )
    : "0x";

  const Series = await (
    await ethers.getContractFactory("Series", creator)
  ).deploy(
    generalImplementationAddress,
    initializeData,
    vectorData,
    encodeMechanicVectorData(mintManagerAddress, creator.address, mechanicMint),
    isCollectorsChoice,
  );
  const series = await Series.deployed();

  return ERC721General__factory.connect(series.address, creator);
};

export const setupGenerative = async (
  observabilityAddress: string,
  generalImplementationAddress: string,
  trustedForwarderAddress: string,
  mintManagerAddress: string,
  creator: SignerWithAddress,
  directMint: OnchainMintVectorParams | null = null,
  mechanicMint: OnchainDutchAuctionParams | null = null,
  useMarketplaceFilter = false,
  limitSupply = 0,
  defaultTokenManager = ethers.constants.AddressZero,
  royaltyRecipient = ethers.constants.AddressZero,
  royaltyPercentage = 0,
  name = "dummy",
  symbol = "DMY",
  baseUri = "baseUri",
  contractUri = "dummyContractMetadata",
  codeUri = "codeUri",
): Promise<any> => {
  const initializeData = ethers.utils.defaultAbiCoder.encode(
    [
      "address",
      "string",
      "tuple(address, uint16)",
      "address",
      "string",
      "string",
      "address",
      "address",
      "string",
      "string",
      "uint256",
      "bool",
    ],
    [
      creator.address,
      contractUri,
      [royaltyRecipient, royaltyPercentage],
      defaultTokenManager,
      name,
      symbol,
      trustedForwarderAddress,
      mintManagerAddress,
      codeUri,
      baseUri,
      limitSupply,
      useMarketplaceFilter,
    ],
  );

  const vectorData = directMint
    ? ethers.utils.defaultAbiCoder.encode(
        ["address", "address", "uint48", "uint48", "uint192", "uint48", "uint48", "uint48", "bytes32"],
        [
          mintManagerAddress,
          creator.address,
          directMint.startTimestamp,
          directMint.endTimestamp,
          directMint.pricePerToken,
          directMint.tokenLimitPerTx,
          directMint.maxTotalClaimableViaVector,
          directMint.maxUserClaimableViaVector,
          directMint.allowlistRoot,
        ],
      )
    : "0x";

  const GenerativeSeries = await (
    await ethers.getContractFactory("GenerativeSeries", creator)
  ).deploy(
    generalImplementationAddress,
    initializeData,
    vectorData,
    encodeMechanicVectorData(mintManagerAddress, creator.address, mechanicMint),
    observabilityAddress,
  );
  const generativeSeries = await GenerativeSeries.deployed();

  return ERC721Generative__factory.connect(generativeSeries.address, creator);
};

export const setupEtherAuctionWithNewToken = async (
  observabilityAddress: string,
  editionsImplementationAddress: string,
  mintManagerAddress: string,
  auctionManagerAddress: string,
  emrAddress: string,
  trustedForwarderAddress: string,
  creator: SignerWithAddress,
  auctionId: string,
  auctionEndTime: number,
  auctionPaymentRecipient: string,
  useMarketplaceFilter: boolean = false,
  auctionCurrency: string = ethers.constants.AddressZero,
  defaultTokenManager = ethers.constants.AddressZero,
  royaltyRecipient = ethers.constants.AddressZero,
  royaltyPercentage = 0,
  contractName = "contractName",
  symbol = "DMY",
  name = "dummy",
  description = "description",
  imageUrl = "imageUrl",
  animationUrl = "animationUrl",
  externalUrl = "externalUrl",
  attributes = "attributes",
  contractUri = "dummyContractMetadata",
): Promise<ERC721Editions> => {
  const initializeData = ethers.utils.defaultAbiCoder.encode(
    ["address", "string", "string", "string", "address", "address", "address[]", "bool", "address"],
    [
      creator.address,
      contractUri,
      contractName,
      symbol,
      emrAddress,
      trustedForwarderAddress,
      [mintManagerAddress, auctionManagerAddress],
      useMarketplaceFilter,
      observabilityAddress,
    ],
  );

  const defaultEditionInfo = ethers.utils.defaultAbiCoder.encode(
    ["tuple(string, string, string, string, string, string)"],
    [[name, description, imageUrl, animationUrl, externalUrl, attributes]],
  );

  const auctionData = ethers.utils.defaultAbiCoder.encode(
    ["address", "bytes32", "address", "address", "uint256"],
    [
      auctionManagerAddress,
      ethers.utils.formatBytes32String(auctionId),
      auctionCurrency,
      auctionPaymentRecipient,
      auctionEndTime,
    ],
  );

  const mintVectorData = "0x";

  const MultipleEditions = await (
    await ethers.getContractFactory("MultipleEditions", creator)
  ).deploy(
    editionsImplementationAddress,
    initializeData,
    defaultEditionInfo,
    1,
    defaultTokenManager,
    { recipientAddress: royaltyRecipient, royaltyPercentageBPS: royaltyPercentage },
    auctionData,
    mintVectorData,
    "0x",
  );
  const multipleEditions = await MultipleEditions.deployed();

  return ERC721Editions__factory.connect(multipleEditions.address, creator);
};

export async function setupSystem(
  platformPaymentAddress: string,
  mintManagerOwnerAddress: string,
  initialPlatformExecutorAddress: string,
  editionsMetadataOwnerAddress: string,
  signer: SignerWithAddress,
  mintFee: string = "0.0008",
) {
  const minimalForwarderFactory = await ethers.getContractFactory("MinimalForwarder");
  const minimalForwarder = await minimalForwarderFactory.deploy();
  await minimalForwarder.deployed();

  const mintManagerFactory = await ethers.getContractFactory("MintManager");
  const mintManager = await mintManagerFactory.deploy();
  await mintManager.deployed();
  const encodedFn = mintManager.interface.encodeFunctionData("initialize", [
    platformPaymentAddress,
    mintManagerOwnerAddress,
    minimalForwarder.address,
    initialPlatformExecutorAddress,
    ethers.utils.parseEther(mintFee),
  ]);

  const mintManagerProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
  const mintManagerProxy = await mintManagerProxyFactory.deploy(mintManager.address, encodedFn);
  await mintManagerProxy.deployed();

  // deploy AuctionManager
  const auctionManagerFactory = await ethers.getContractFactory("AuctionManager");
  const auctionManager = await auctionManagerFactory.deploy();
  await auctionManager.deployed();
  const amEncodedFn = auctionManager.interface.encodeFunctionData("initialize", [
    platformPaymentAddress,
    minimalForwarder.address,
    mintManagerOwnerAddress,
    initialPlatformExecutorAddress,
  ]);

  const auctionManagerProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
  const auctionManagerProxy = await auctionManagerProxyFactory.deploy(auctionManager.address, amEncodedFn);
  await auctionManagerProxy.deployed();

  //Deploy EMR
  const emrFactory = await ethers.getContractFactory("EditionsMetadataRenderer");
  const emr = await emrFactory.deploy();
  await emr.deployed();
  const emrEncodedFn = emr.interface.encodeFunctionData("initialize", [editionsMetadataOwnerAddress]);

  const emrProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
  const emrProxy = await emrProxyFactory.deploy(emr.address, emrEncodedFn);
  await emrProxy.deployed();

  //Deploy Editions
  const editionsFactory = await ethers.getContractFactory("ERC721Editions");
  const editions = await editionsFactory.deploy();
  await editions.deployed();

  //Deploy EditionsDFS
  const editionsDFSFactory = await ethers.getContractFactory("ERC721EditionsDFS");
  const editionsDFS = await editionsDFSFactory.deploy();
  await editionsDFS.deployed();

  //Deploy Single Edition
  const singleEditionFactory = await ethers.getContractFactory("ERC721SingleEdition");
  const singleEdition = await singleEditionFactory.deploy();
  await singleEdition.deployed();

  //Deploy Single Edition DFS
  const singleEditionDFSFactory = await ethers.getContractFactory("ERC721SingleEditionDFS");
  const singleEditionDFS = await singleEditionDFSFactory.deploy();
  await singleEditionDFS.deployed();

  //Deploy General
  const generalFactory = await ethers.getContractFactory("ERC721General");
  const general = await generalFactory.deploy();
  await general.deployed();

  //Deploy GeneralSequence
  const generalSequenceFactory = await ethers.getContractFactory("ERC721GeneralSequence");
  const generalSequence = await generalSequenceFactory.deploy();
  await generalSequence.deployed();

  //Deploy Editions
  const generativeFactory = await ethers.getContractFactory("ERC721GenerativeOnchain");
  const generative = await generativeFactory.deploy();
  await generative.deployed();

  const observabilityFactory = await ethers.getContractFactory("Observability");
  const observability = await observabilityFactory.deploy();
  await observability.deployed();

  const dutchAuctionImplFactory = await ethers.getContractFactory("DiscreteDutchAuctionMechanic");
  const dutchAuctionImpl = await dutchAuctionImplFactory.deploy();
  await dutchAuctionImpl.deployed();

  const dutchAuctionEncodedFn = dutchAuctionImpl.interface.encodeFunctionData("initialize", [
    mintManagerProxy.address,
    mintManagerOwnerAddress,
  ]);
  const dutchAuctionFactory = await ethers.getContractFactory("ERC1967Proxy");
  const dutchAuction = await dutchAuctionFactory.deploy(dutchAuctionImpl.address, dutchAuctionEncodedFn);
  await dutchAuction.deployed();

  return {
    emrProxy: EditionsMetadataRenderer__factory.connect(emrProxy.address, signer),
    mintManagerProxy: MintManager__factory.connect(mintManagerProxy.address, signer),
    auctionManagerProxy: AuctionManager__factory.connect(auctionManagerProxy.address, signer),
    minimalForwarder: MinimalForwarder__factory.connect(minimalForwarder.address, signer),
    observability: Observability__factory.connect(observability.address, signer),
    daMechanic: DiscreteDutchAuctionMechanic__factory.connect(dutchAuction.address, signer),
    generalImplementationAddress: general.address,
    generalSequenceImplementationAddress: generalSequence.address,
    generativeImplementationAddress: generative.address,
    editionsImplementationAddress: editions.address,
    editionsDFSImplementationAddress: editionsDFS.address,
    singleEditionImplementationAddress: singleEdition.address,
    singleEditionDFSImplementationAddress: singleEditionDFS.address,
  };
}

export const encodeMechanicVectorData = (
  mintManagerAddress: string,
  paymentRecipient: string,
  mechanicMint: OnchainDutchAuctionParams | null,
): BytesLike => {
  let mechanicVectorData = "0x";
  if (mechanicMint) {
    const dutchAuctionData = encodeDAVectorData(mechanicMint, paymentRecipient);

    mechanicVectorData = ethers.utils.defaultAbiCoder.encode(
      ["uint96", "address", "address", "bytes"],
      [mechanicMint.seed, mechanicMint.mechanicAddress, mintManagerAddress, dutchAuctionData],
    );
  }

  return mechanicVectorData;
};

export const encodeDAVectorData = (mechanicMint: OnchainDutchAuctionParams, paymentRecipient: string): BytesLike => {
  const { packedPrices, numPrices, bytesPerPrice } = encodeDutchAuctionPriceData(mechanicMint.prices);

  return ethers.utils.defaultAbiCoder.encode(
    ["uint48", "uint48", "uint32", "uint32", "uint48", "uint32", "uint32", "uint8", "address", "bytes"],
    [
      mechanicMint.startTimestamp,
      mechanicMint.endTimestamp,
      mechanicMint.periodDuration,
      mechanicMint.maxUserClaimableViaVector,
      mechanicMint.maxTotalClaimableViaVector,
      mechanicMint.tokenLimitPerTx,
      numPrices,
      bytesPerPrice,
      paymentRecipient,
      packedPrices,
    ],
  );
};

export const encodeDutchAuctionPriceData = (
  prices: string[],
): { packedPrices: BytesLike; numPrices: number; bytesPerPrice: number } => {
  if (prices.length == 0) {
    return { packedPrices: "0x", numPrices: 0, bytesPerPrice: 0 };
  }

  // expect in ether, expect 10^18, convert to wei
  let biggestPrice = ethers.utils.parseEther(prices[0]);
  for (const price of prices) {
    if (ethers.utils.parseEther(price).gt(biggestPrice)) {
      biggestPrice = ethers.utils.parseEther(price);
    }
  }

  const bytesPerPrice = numBytesNeeded(biggestPrice);
  const packedPrices = ethers.utils.solidityPack(
    new Array(prices.length).fill(`uint${bytesPerPrice * 8}`),
    prices.map(price => {
      return ethers.utils.parseEther(price);
    }),
  );

  return {
    packedPrices,
    numPrices: prices.length,
    bytesPerPrice,
  };
};

export const dutchAuctionUpdateArgs = (
  updateValues: DutchAuctionUpdateValues,
): {
  dutchAuction: DiscreteDutchAuctionMechanic.DutchAuctionVectorStruct;
  updateConfig: DiscreteDutchAuctionMechanic.DutchAuctionVectorUpdateConfigStruct;
  packedPrices: BytesLike;
} => {
  // if prices isn't updated, this returns 0 values for each field
  const { numPrices, bytesPerPrice, packedPrices } = encodeDutchAuctionPriceData(updateValues.prices ?? []);

  const dutchAuction = {
    startTimestamp: updateValues.startTimestamp ?? 0,
    endTimestamp: updateValues.endTimestamp ?? 0,
    periodDuration: updateValues.periodDuration ?? 0,
    maxUserClaimableViaVector: updateValues.maxUserClaimableViaVector ?? 0,
    maxTotalClaimableViaVector: updateValues.maxTotalClaimableViaVector ?? 0,
    currentSupply: 0,
    lowestPriceSoldAtIndex: 0,
    tokenLimitPerTx: updateValues.tokenLimitPerTx ?? 0,
    numPrices,
    paymentRecipient: updateValues.paymentRecipient ?? ethers.constants.AddressZero,
    totalSales: 0,
    bytesPerPrice,
    auctionExhausted: false,
    payeeRevenueHasBeenWithdrawn: false,
  };
  const updateConfig = {
    updateStartTimestamp: updateValues.startTimestamp != undefined,
    updateEndTimestamp: updateValues.endTimestamp != undefined,
    updatePaymentRecipient: updateValues.paymentRecipient != undefined,
    updateMaxTotalClaimableViaVector: updateValues.maxTotalClaimableViaVector != undefined,
    updateTokenLimitPerTx: updateValues.tokenLimitPerTx != undefined,
    updateMaxUserClaimableViaVector: updateValues.maxUserClaimableViaVector != undefined,
    updatePrices: updateValues.prices != undefined,
    updatePeriodDuration: updateValues.periodDuration != undefined,
  };

  return {
    dutchAuction,
    updateConfig,
    packedPrices,
  };
};

const numBytesNeeded = (num: BigNumber) => {
  const log10 = num.toString().length - 1;
  const log2 = log10 / Math.log10(2); // convert log10 to log2 using the base change formula
  return Math.floor(log2 / 8) + 1;
};

export const produceMechanicVectorId = (
  contractAddress: string,
  mechanicAddress: string,
  seed: number,
  editionId?: number,
): string => {
  return ethers.utils.solidityKeccak256(
    ["address", "uint96", "address", "bool", "uint96"],
    [contractAddress, editionId ?? 0, mechanicAddress, editionId != undefined, seed],
  );
};

export const hourFromNow = () => {
  return Math.floor(Date.now() / 1000 + 3600);
};

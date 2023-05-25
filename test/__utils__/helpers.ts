import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

import {
  AuctionManager__factory,
  ERC721Editions,
  ERC721Editions__factory,
  ERC721General,
  ERC721General__factory,
  ERC721Generative__factory,
  ERC721SingleEdition,
  ERC721SingleEdition__factory,
  EditionsMetadataRenderer__factory,
  IERC20__factory,
  MinimalForwarder__factory,
  MintManager__factory,
  NativeMetaTransaction__factory,
  Observability__factory,
} from "../../types";
import { signGatedMint, signGatedMintWithMetaTxPacket, signGatedSeriesMint, signWETHMetaTxRequest } from "./mint";

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

  const SingleEdition = await (
    await ethers.getContractFactory("SingleEdition")
  ).deploy(singleImplementationAddress, initializeData, observabilityAddress);
  const singleEdition = await SingleEdition.deployed();
  return ERC721SingleEdition__factory.connect(singleEdition.address, creator);
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
  );
  const multipleEditions = await MultipleEditions.deployed();

  const multipleEditionsCreator = ERC721Editions__factory.connect(multipleEditions.address, creator);

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
  );
  const multipleEditions = await MultipleEditions.deployed();

  return ERC721Editions__factory.connect(multipleEditions.address, creator);
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

  const Series = await (
    await ethers.getContractFactory("Series", creator)
  ).deploy(generalImplementationAddress, initializeData);
  const series = await Series.deployed();

  return ERC721General__factory.connect(series.address, creator);
};

export const setupGenerative = async (
  observabilityAddress: string,
  generalImplementationAddress: string,
  trustedForwarderAddress: string,
  mintManagerAddress: string,
  creator: SignerWithAddress,
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

  const GenerativeSeries = await (
    await ethers.getContractFactory("GenerativeSeries", creator)
  ).deploy(generalImplementationAddress, initializeData, observabilityAddress);
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

  //Deploy Single Edition
  const singleEditionFactory = await ethers.getContractFactory("ERC721SingleEdition");
  const singleEdition = await singleEditionFactory.deploy();
  await singleEdition.deployed();

  //Deploy General
  const generalFactory = await ethers.getContractFactory("ERC721General");
  const general = await generalFactory.deploy();
  await general.deployed();

  //Deploy Editions
  const generativeFactory = await ethers.getContractFactory("ERC721Generative");
  const generative = await generativeFactory.deploy();
  await generative.deployed();

  const observabilityFactory = await ethers.getContractFactory("Observability");
  const observability = await observabilityFactory.deploy();
  await observability.deployed();

  return {
    emrProxy: EditionsMetadataRenderer__factory.connect(emrProxy.address, signer),
    mintManagerProxy: MintManager__factory.connect(mintManagerProxy.address, signer),
    auctionManagerProxy: AuctionManager__factory.connect(auctionManagerProxy.address, signer),
    minimalForwarder: MinimalForwarder__factory.connect(minimalForwarder.address, signer),
    observability: Observability__factory.connect(observability.address, signer),
    generalImplementationAddress: general.address,
    generativeImplementationAddress: generative.address,
    editionsImplementationAddress: editions.address,
    singleEditionImplementationAddress: singleEdition.address,
  };
}

export const hourFromNow = () => {
  return Math.floor(Date.now() / 1000 + 3600);
};

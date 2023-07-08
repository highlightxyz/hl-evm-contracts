import {
  AuctionManager,
  ERC721Editions,
  ERC721General,
  ERC721SingleEdition,
  EditionsMetadataRenderer,
  MinimalForwarder,
  MintManager,
  Observability,
} from "@highlightxyz/libnode/contracts/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

/* eslint-disable prefer-const */
import {
  generateClaim,
  setupGeneral,
  setupMultipleEdition,
  setupSingleEdition,
  setupSystem,
} from "./__utils__/helpers";

//TODO: Token URI

describe("Editions Metadata Renderer", () => {
  let initialPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    generalOwner: SignerWithAddress,
    editionsOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    fan1: SignerWithAddress;

  let mintFeeWei = ethers.BigNumber.from("800000000000000");

  before(async () => {
    [
      initialPlatformExecutor,
      mintManagerOwner,
      editionsMetadataOwner,
      platformPaymentAddress,
      generalOwner,
      editionsOwner,
      fan1,
    ] = await ethers.getSigners();
  });

  async function setup() {
    const size = 10,
      name = "Test 1",
      symbol = "T1";

    let auctionManager: AuctionManager;
    let mintManager: MintManager;
    let emr: EditionsMetadataRenderer;
    let minimalForwarder: MinimalForwarder;
    let observability: Observability;

    const {
      mintManagerProxy,
      auctionManagerProxy,
      emrProxy,
      observability: observabilityInstance,
      minimalForwarder: minimalForwarderContract,
      generalImplementationAddress,
      editionsImplementationAddress,
      singleEditionImplementationAddress,
    } = await setupSystem(
      platformPaymentAddress.address,
      mintManagerOwner.address,
      initialPlatformExecutor.address,
      editionsMetadataOwner.address,
      editionsOwner,
    );

    auctionManager = auctionManagerProxy;
    mintManager = mintManagerProxy;
    emr = emrProxy;
    observability = observabilityInstance;
    minimalForwarder = minimalForwarderContract;

    const general: ERC721General = await setupGeneral(
      observability.address,
      generalImplementationAddress,
      minimalForwarder.address,
      emr.address,
      generalOwner,
      false,
      0,
      ethers.constants.AddressZero,
      ethers.constants.AddressZero,
      0,
      name,
      symbol,
    );
    const singleEdition: ERC721SingleEdition = await setupSingleEdition(
      observability.address,
      singleEditionImplementationAddress,
      mintManager.address,
      minimalForwarder.address,
      emr.address,
      editionsOwner,
      size,
      name,
      symbol,
    );
    const editions: ERC721Editions = await setupMultipleEdition(
      observability.address,
      editionsImplementationAddress,
      mintManager.address,
      auctionManager.address,
      minimalForwarder.address,
      emr.address,
      editionsOwner,
      size,
      name,
      symbol,
    );

    const { signature, claim } = await generateClaim(
      initialPlatformExecutor,
      mintManager.address,
      singleEdition.address,
      fan1.address,
      editionsOwner.address,
    );

    const ownerOnlyTokenManager = await (await ethers.getContractFactory("OwnerOnlyTokenManager")).deploy();
    await ownerOnlyTokenManager.deployed();

    const checkersTokenManager = await (
      await ethers.getContractFactory("CheckerboardTokenManager")
    ).deploy(initialPlatformExecutor.address, emr.address, "allowed 1");
    await checkersTokenManager.deployed();

    return {
      auctionManager,
      mintManager,
      emr,
      minimalForwarder,
      general,
      singleEdition,
      editions,
      ownerOnlyTokenManager,
      checkersTokenManager,
      name,
      symbol,
      size,
      singleEditionClaim: { claim, signature },
    };
  }

  it("Should generate correct uri for editions uri", async () => {
    let { emr, singleEdition } = await setup();
    const fakeContractSigner = await ethers.getSigner(singleEdition.address);
    emr = emr.connect(fakeContractSigner);
    const uri = (await emr.editionURI(0)).replace("data:application/json;base64,", "");
    const buff = Buffer.from(uri, "base64");
    const metadata: Record<string, string> = JSON.parse(buff.toString());
    expect(Object.keys(metadata)).to.include.members(["name", "size", "description", "external_url", "attributes"]);
  });
  it("Should generate correct uri for token uri", async () => {
    let { emr, mintManager, singleEdition, singleEditionClaim } = await setup();
    const mintManagerForFan1 = mintManager.connect(fan1);
    const tx = await mintManagerForFan1.gatedMintEdition721(
      singleEditionClaim.claim,
      singleEditionClaim.signature,
      fan1.address,
      { value: mintFeeWei.mul(singleEditionClaim.claim.numTokensToMint) },
    );
    await tx.wait();
    const emrImp = await ethers.getSigner(singleEdition.address);
    emr = emr.connect(emrImp);
    const uri = (await emr.tokenURI(1)).replace("data:application/json;base64,", "");
    const buff = Buffer.from(uri, "base64");
    const metadata: Record<string, string> = JSON.parse(buff.toString());
    expect(Object.keys(metadata)).to.include.members(["name", "description", "external_url", "attributes"]);
  });
  it("Should return correct token edition info", async () => {
    const { emr, singleEdition, name } = await setup();
    const editionInfo = await emr.editionInfo(singleEdition.address, 0);
    expect(editionInfo.name).to.be.equal(name);
    expect(editionInfo.description).to.be.equal("");
    expect(editionInfo.imageUrl).to.be.equal("");
    expect(editionInfo.animationUrl).to.be.equal("");
    expect(editionInfo.attributes).to.be.equal("");
  });

  it("Updating metadata fields without a token manager is restricted to the owner", async () => {
    const { emr, singleEdition } = await setup();

    await expect(emr.updateName(singleEdition.address, 0, "new name"))
      .to.emit(emr, "NameUpdated")
      .withArgs(singleEdition.address, 0, "new name");

    await expect(emr.updateDescription(singleEdition.address, 0, "new description"))
      .to.emit(emr, "DescriptionUpdated")
      .withArgs(singleEdition.address, 0, "new description");

    await expect(emr.updateImageUrl(singleEdition.address, 0, "new image url"))
      .to.emit(emr, "ImageUrlUpdated")
      .withArgs(singleEdition.address, 0, "new image url");

    await expect(emr.updateAnimationUrl(singleEdition.address, 0, "new animation url"))
      .to.emit(emr, "AnimationUrlUpdated")
      .withArgs(singleEdition.address, 0, "new animation url");

    await expect(emr.updateExternalUrl(singleEdition.address, 0, "new external url"))
      .to.emit(emr, "ExternalUrlUpdated")
      .withArgs(singleEdition.address, 0, "new external url");

    await expect(emr.updateAttributes(singleEdition.address, 0, "new attributes"))
      .to.emit(emr, "AttributesUpdated")
      .withArgs(singleEdition.address, 0, "new attributes");

    const editionInfo = await emr.editionInfo(singleEdition.address, 0);
    expect(editionInfo.name).to.be.equal("new name");
    expect(editionInfo.description).to.be.equal("new description");
    expect(editionInfo.imageUrl).to.be.equal("new image url");
    expect(editionInfo.animationUrl).to.be.equal("new animation url");
    expect(editionInfo.externalUrl).to.be.equal("new external url");
    expect(editionInfo.attributes).to.be.equal("new attributes");
  });

  it("Updating metadata with a non-conforming (to ITokenManagerEditions) token manager uses the ITokenManager standard", async () => {
    let { emr, singleEdition, ownerOnlyTokenManager } = await setup();
    emr = emr.connect(editionsMetadataOwner);
    await expect(singleEdition.setDefaultTokenManager(ownerOnlyTokenManager.address)).to.emit(
      singleEdition,
      "DefaultTokenManagerChanged",
    );

    emr = emr.connect(editionsOwner);
    await expect(emr.updateName(singleEdition.address, 0, "new name")).to.be.revertedWith("Can't update metadata");

    emr = emr.connect(editionsMetadataOwner);
    await expect(emr.updateName(singleEdition.address, 0, "new name")).to.emit(emr, "NameUpdated");
  });

  it("Updating metadata with a checkerboard token manager works as expected", async () => {
    let { emr, singleEdition, mintManager, checkersTokenManager, singleEditionClaim } = await setup();
    emr = emr.connect(editionsMetadataOwner);
    await expect(singleEdition.setDefaultTokenManager(checkersTokenManager.address)).to.emit(
      singleEdition,
      "DefaultTokenManagerChanged",
    );

    // editions metadata owner not allowed + name update not allowed
    await expect(emr.updateName(singleEdition.address, 0, "allowed 1")).to.be.revertedWith("Can't update metadata");

    // name update not allowed
    emr = emr.connect(editionsOwner);
    await expect(emr.updateName(singleEdition.address, 0, "allowed 1")).to.be.revertedWith("Can't update metadata");

    // editions metadata owner not alowed
    emr = emr.connect(editionsMetadataOwner);
    await expect(emr.updateImageUrl(singleEdition.address, 0, "new image")).to.be.revertedWith("Can't update metadata");

    // invalid name update not allowed
    emr = emr.connect(editionsOwner);
    await expect(emr.updateImageUrl(singleEdition.address, 0, "new image")).to.be.revertedWith("Can't update metadata");

    await expect(emr.updateImageUrl(singleEdition.address, 0, "allowed 1")).to.emit(emr, "ImageUrlUpdated");

    const editionInfo = await emr.editionInfo(singleEdition.address, 0);
    expect(editionInfo.imageUrl).to.be.equal("allowed 1");

    checkersTokenManager = checkersTokenManager.connect(editionsOwner);
    // this is working as expected
    //await expect(checkersTokenManager.setAllowedMoveForTheDay("allowed 2"))
    //  .to.be.revertedWith("Ownable: caller is not the owner")

    checkersTokenManager = checkersTokenManager.connect(initialPlatformExecutor);
    await expect(checkersTokenManager.setAllowedMoveForTheDay("allowed 2"))
      .to.emit(checkersTokenManager, "SetAllowedMove")
      .withArgs("allowed 2");

    emr = emr.connect(fan1);
    await expect(emr.updateImageUrl(singleEdition.address, 0, "allowed 2")).to.be.revertedWith("Can't update metadata");

    const mintManagerForFan1 = mintManager.connect(fan1);
    const tx = await mintManagerForFan1.gatedMintEdition721(
      singleEditionClaim.claim,
      singleEditionClaim.signature,
      fan1.address,
      { value: mintFeeWei.mul(singleEditionClaim.claim.numTokensToMint) },
    );
    await tx.wait();

    // now fan holds nft from single edition
    await expect(emr.updateImageUrl(singleEdition.address, 0, "allowed 2")).to.emit(emr, "ImageUrlUpdated");
  });

  it("Can update all metadata fields at once", async () => {
    const { emr, singleEdition } = await setup();

    const newEditionMetadata = {
      name: "new name",
      description: "new description",
      imageUrl: "new image url",
      animationUrl: "new animation url",
      externalUrl: "new external url",
      attributes: "new attributes",
    };

    await expect(emr.updateMetadata(singleEdition.address, 0, newEditionMetadata, [1, 3]))
      .to.emit(emr, "NameUpdated")
      .withArgs(singleEdition.address, 0, "new name")
      .to.emit(emr, "ImageUrlUpdated")
      .withArgs(singleEdition.address, 0, "new image url");

    const editionInfo = await emr.editionInfo(singleEdition.address, 0);
    expect(editionInfo.name).to.be.equal("new name");
    expect(editionInfo.imageUrl).to.be.equal("new image url");
    expect(editionInfo.description).to.be.equal("");
    expect(editionInfo.animationUrl).to.be.equal("");
    expect(editionInfo.externalUrl).to.be.equal("");
    expect(editionInfo.attributes).to.be.equal("");

    await expect(emr.updateMetadata(singleEdition.address, 0, newEditionMetadata, [2, 4]))
      .to.emit(emr, "DescriptionUpdated")
      .withArgs(singleEdition.address, 0, "new description")
      .to.emit(emr, "AnimationUrlUpdated")
      .withArgs(singleEdition.address, 0, "new animation url");

    const editionInfo2 = await emr.editionInfo(singleEdition.address, 0);
    expect(editionInfo2.name).to.be.equal("new name");
    expect(editionInfo2.imageUrl).to.be.equal("new image url");
    expect(editionInfo2.description).to.be.equal("new description");
    expect(editionInfo2.animationUrl).to.be.equal("new animation url");
    expect(editionInfo2.externalUrl).to.be.equal("");
    expect(editionInfo2.attributes).to.be.equal("");

    await expect(emr.updateMetadata(singleEdition.address, 0, newEditionMetadata, [5, 6]))
      .to.emit(emr, "ExternalUrlUpdated")
      .withArgs(singleEdition.address, 0, "new external url")
      .to.emit(emr, "AttributesUpdated")
      .withArgs(singleEdition.address, 0, "new attributes");

    const editionInfo3 = await emr.editionInfo(singleEdition.address, 0);
    expect(editionInfo3.name).to.be.equal("new name");
    expect(editionInfo3.imageUrl).to.be.equal("new image url");
    expect(editionInfo3.description).to.be.equal("new description");
    expect(editionInfo3.animationUrl).to.be.equal("new animation url");
    expect(editionInfo3.externalUrl).to.be.equal("new external url");
    expect(editionInfo3.attributes).to.be.equal("new attributes");
  });
});

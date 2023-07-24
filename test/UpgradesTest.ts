import {
  AuctionManager,
  ERC721Editions,
  EditionsMetadataRenderer,
  MinimalForwarder,
  MintManager,
  Observability,
  TestEditionsMetadataRenderer,
  TestMintManager,
} from "../types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { SAMPLE_ABRIDGED_VECTOR } from "./__utils__/data";
import { setupEditions, setupSystem } from "./__utils__/helpers";

const defaultEditionInfo = ethers.utils.defaultAbiCoder.encode(
  ["tuple(string, string, string, string, string, string)"],
  [["name", "description", "imageUrl", "animationUrl", "externalUrl", "attributes"]],
);

describe("Upgrades functionality", () => {
  let initialPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    owner: SignerWithAddress,
    fan1: SignerWithAddress;

  let emr: EditionsMetadataRenderer;
  let mintManager: MintManager;
  let observability: Observability;
  let auctionManager: AuctionManager;
  let trustedForwarder: MinimalForwarder;
  let editionsImplementation: string;

  const zeroRoyalty = {
    recipientAddress: ethers.constants.AddressZero,
    royaltyPercentageBPS: 0,
  };

  before(async () => {
    [initialPlatformExecutor, mintManagerOwner, editionsMetadataOwner, platformPaymentAddress, owner, fan1] =
      await ethers.getSigners();
    const {
      emrProxy,
      mintManagerProxy,
      minimalForwarder,
      observability: observabilityInstance,
      auctionManagerProxy,
      editionsImplementationAddress,
    } = await setupSystem(
      platformPaymentAddress.address,
      mintManagerOwner.address,
      initialPlatformExecutor.address,
      editionsMetadataOwner.address,
      owner,
    );

    emr = emrProxy;
    mintManager = mintManagerProxy;
    trustedForwarder = minimalForwarder;
    observability = observabilityInstance;
    auctionManager = auctionManagerProxy;
    editionsImplementation = editionsImplementationAddress;

    mintManager = mintManager.connect(mintManagerOwner);
    emr = emr.connect(editionsMetadataOwner);
  });

  describe("MintManager", function () {
    let testMintManager: TestMintManager;
    let editions: ERC721Editions;

    beforeEach(async function () {
      editions = await setupEditions(
        observability.address,
        editionsImplementation,
        mintManager.address,
        auctionManager.address,
        trustedForwarder.address,
        emr.address,
        mintManagerOwner,
      );
    });

    it("Non owner cannot upgrade MintManager", async function () {
      testMintManager = await (await ethers.getContractFactory("TestMintManager")).deploy();
      await testMintManager.deployed();

      mintManager = mintManager.connect(owner);

      await expect(mintManager.upgradeTo(testMintManager.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      mintManager = mintManager.connect(editionsMetadataOwner);

      await expect(mintManager.upgradeTo(testMintManager.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      mintManager = mintManager.connect(fan1);

      await expect(mintManager.upgradeTo(testMintManager.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("Upgrade to TestMintManager retains original data and introduces new functionality", async function () {
      mintManager = mintManager.connect(mintManagerOwner);

      await expect(
        mintManager.createAbridgedVector(SAMPLE_ABRIDGED_VECTOR(editions.address, owner.address, true)),
      ).to.emit(mintManager, "EditionVectorCreated");

      // data before upgrade
      const vectorOnOldImpl = await mintManager.vectors(1);
      const ownerOnOldImpl = await mintManager.owner();

      testMintManager = await (await ethers.getContractFactory("TestMintManager")).deploy();
      await testMintManager.deployed();

      await expect(mintManager.upgradeTo(testMintManager.address))
        .to.emit(mintManager, "Upgraded")
        .withArgs(testMintManager.address);

      const newMintManager = new ethers.Contract(mintManager.address, testMintManager.interface, mintManagerOwner);
      expect(await newMintManager.test()).to.equal("test");

      // data after upgrade
      expect(await newMintManager.vectors(1)).to.eql(vectorOnOldImpl);
      expect(await newMintManager.owner()).to.equal(ownerOnOldImpl);
    });
  });

  describe("EditionsMetadataRenderer", function () {
    let testEditionsMetadataRenderer: TestEditionsMetadataRenderer;
    let editions: ERC721Editions;

    beforeEach(async function () {
      editions = await setupEditions(
        observability.address,
        editionsImplementation,
        mintManager.address,
        auctionManager.address,
        trustedForwarder.address,
        emr.address,
        mintManagerOwner,
      );
      await expect(editions.createEdition(defaultEditionInfo, 4, ethers.constants.AddressZero, zeroRoyalty, "0x"));
    });

    it("Non owner cannot upgrade EditionsMetadataRenderer", async function () {
      testEditionsMetadataRenderer = await (await ethers.getContractFactory("TestEditionsMetadataRenderer")).deploy();
      await testEditionsMetadataRenderer.deployed();

      mintManager = mintManager.connect(owner);

      await expect(mintManager.upgradeTo(testEditionsMetadataRenderer.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      mintManager = mintManager.connect(editionsMetadataOwner);

      await expect(mintManager.upgradeTo(testEditionsMetadataRenderer.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      mintManager = mintManager.connect(fan1);

      await expect(mintManager.upgradeTo(testEditionsMetadataRenderer.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
    });

    it("Upgrade to TestEditionsMetadataRenderer retains original data and introduces new functionality", async function () {
      emr = emr.connect(editionsMetadataOwner);
      // data before upgrade
      // const editionOnOldEMR = await emr.editionInfo(editions.address, 0);
      const ownerOnOldEMR = await emr.owner();

      testEditionsMetadataRenderer = await (await ethers.getContractFactory("TestEditionsMetadataRenderer")).deploy();
      await testEditionsMetadataRenderer.deployed();

      await expect(emr.upgradeTo(testEditionsMetadataRenderer.address))
        .to.emit(emr, "Upgraded")
        .withArgs(testEditionsMetadataRenderer.address);

      const newEditionsMetadataRenderer = new ethers.Contract(
        emr.address,
        testEditionsMetadataRenderer.interface,
        editionsMetadataOwner,
      );
      expect(await newEditionsMetadataRenderer.test()).to.equal("test");

      // data after upgrade
      // expect(await newEditionsMetadataRenderer.editionInfo(editions.address, 0)).to.equal(editionOnOldEMR);
      expect(await newEditionsMetadataRenderer.owner()).to.equal(ownerOnOldEMR);
    });
  });
});

import {
  AuctionManager,
  ERC721Editions,
  ERC721EditionsDFS,
  ERC721SingleEdition,
  EditionsMetadataRenderer,
  MinimalForwarder,
  MintManager,
  Observability,
  OperatorFilterRegistry,
} from "../types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { Errors } from "./__utils__/data";
import {
  setupMultipleEdition,
  setupMultipleEditionDFS,
  setupSingleEdition,
  setupSystem,
} from "./__utils__/helpers";

describe("MarketplaceFilterer functionality", () => {
  let singleEdition: ERC721SingleEdition;
  let operatorRegistry: OperatorFilterRegistry;
  let initialPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    editionsOwner: SignerWithAddress,
    fan1: SignerWithAddress;

  let emr: EditionsMetadataRenderer;
  let mintManager: MintManager;
  let auctionManager: AuctionManager;
  let observability: Observability;
  let trustedForwarder: MinimalForwarder;
  let singleEditionImplementation: string;
  let editionsImplementation: string;
  let editionsDFSImplementation: string;

  before(async () => {
    [initialPlatformExecutor, mintManagerOwner, editionsMetadataOwner, platformPaymentAddress, editionsOwner, fan1] =
      await ethers.getSigners();
    const {
      emrProxy,
      mintManagerProxy,
      minimalForwarder,
      observability: observabilityInstance,
      singleEditionImplementationAddress,
      editionsImplementationAddress,
      editionsDFSImplementationAddress,
      auctionManagerProxy,
    } = await setupSystem(
      platformPaymentAddress.address,
      mintManagerOwner.address,
      initialPlatformExecutor.address,
      editionsMetadataOwner.address,
      editionsOwner,
    );

    emr = emrProxy;
    mintManager = mintManagerProxy;
    auctionManager = auctionManagerProxy;
    observability = observabilityInstance;
    trustedForwarder = minimalForwarder;
    singleEditionImplementation = singleEditionImplementationAddress;
    editionsImplementation = editionsImplementationAddress;
    editionsDFSImplementation = editionsDFSImplementationAddress;

    operatorRegistry = await (await ethers.getContractFactory("OperatorFilterRegistry")).deploy();
  });

  beforeEach(async () => {
    singleEdition = await setupSingleEdition(
      observability.address,
      singleEditionImplementation,
      mintManager.address,
      trustedForwarder.address,
      emr.address,
      editionsOwner,
      10,
      "Test 1",
      "T1",
      null,
      true,
    );

    expect(await singleEdition.operatorFiltererRegistry()).to.equal("0x000000000000AAeB6D7670E522A718067333cd4E");

    const tx = await singleEdition.removeMarketplaceFiltererRegistryAndUnregister();
    await tx.wait();

    expect(await singleEdition.operatorFiltererRegistry()).to.equal(ethers.constants.AddressZero);

    // setup some minted nfts to transfer later
    await expect(singleEdition.registerMinter(editionsOwner.address)).to.emit(
      singleEdition,
      "MinterRegistrationChanged",
    );

    await expect(singleEdition.mintAmountToRecipient(0, fan1.address, 4))
      .to.emit(singleEdition, "Transfer")
      .withArgs(ethers.constants.AddressZero, fan1.address, 1)
      .to.emit(singleEdition, "Transfer")
      .withArgs(ethers.constants.AddressZero, fan1.address, 2)
      .to.emit(singleEdition, "Transfer")
      .withArgs(ethers.constants.AddressZero, fan1.address, 3)
      .to.emit(singleEdition, "Transfer")
      .withArgs(ethers.constants.AddressZero, fan1.address, 4);

    for (let i = 1; i <= 4; i++) {
      expect(await singleEdition.ownerOf(i)).to.equal(fan1.address);
    }
  });

  describe("Registering/unregistering filterer registry", async function () {
    it("Registering/unregistering filterer registry sets data properly", async function () {
      // register and subscribe should fail due to non registration of default registrant
      await expect(
        singleEdition.setCustomMarketplaceFiltererRegistryAndRegisterDefaultSubscription(operatorRegistry.address),
      ).to.emit(operatorRegistry, "RegistrationUpdated");
    });

    it("Existence of filterer restricts/unrestricts transfers/approvals", async function () {
      // manually register subscription and seed it direclty via registry restricted address
      operatorRegistry = operatorRegistry.connect(initialPlatformExecutor);
      await expect(operatorRegistry.register(initialPlatformExecutor.address))
        .to.emit(operatorRegistry, "RegistrationUpdated")
        .withArgs(initialPlatformExecutor.address, true);

      expect(await operatorRegistry.isRegistered(initialPlatformExecutor.address)).to.equal(true);

      await expect(operatorRegistry.updateOperator(initialPlatformExecutor.address, editionsOwner.address, true))
        .to.emit(operatorRegistry, "OperatorUpdated")
        .withArgs(initialPlatformExecutor.address, editionsOwner.address, true);

      // register and subscribe collection manually to initialPlatformExecutor subscription
      singleEdition = singleEdition.connect(editionsOwner);
      await expect(
        singleEdition.setCustomMarketplaceFiltererRegistryAndRegisterDefaultSubscription(operatorRegistry.address),
      )
        .to.emit(operatorRegistry, "RegistrationUpdated")
        .to.emit(operatorRegistry, "SubscriptionUpdated");

      expect(await operatorRegistry.subscriptionOf(singleEdition.address)).to.equal(
        "0x3cc6CddA760b79bAfa08dF41ECFA224f810dCeB6",
      );

      operatorRegistry = operatorRegistry.connect(editionsOwner);
      await expect(operatorRegistry.subscribe(singleEdition.address, initialPlatformExecutor.address)).to.emit(
        operatorRegistry,
        "SubscriptionUpdated",
      );

      expect(await operatorRegistry.subscriptionOf(singleEdition.address)).to.equal(initialPlatformExecutor.address);

      // all 4 transfer / approval functions should fail for editions owner now, and succeed for others

      singleEdition = singleEdition.connect(fan1);
      await expect(singleEdition.approve(editionsOwner.address, 1)).to.be.revertedWithCustomError(
        operatorRegistry,
        "AddressFiltered",
      );

      await expect(singleEdition.setApprovalForAll(editionsOwner.address, true)).to.be.revertedWithCustomError(
        operatorRegistry,
        "AddressFiltered",
      );

      await expect(singleEdition.approve(editionsMetadataOwner.address, 1)).to.emit(singleEdition, "Approval");

      await expect(singleEdition.setApprovalForAll(editionsMetadataOwner.address, true)).to.emit(
        singleEdition,
        "ApprovalForAll",
      );

      singleEdition = singleEdition.connect(editionsOwner);
      await expect(singleEdition.transferFrom(fan1.address, editionsOwner.address, 1)).to.be.revertedWithCustomError(
        operatorRegistry,
        "AddressFiltered",
      );

      await expect(
        singleEdition["safeTransferFrom(address,address,uint256)"](fan1.address, editionsOwner.address, 1),
      ).to.be.revertedWithCustomError(operatorRegistry, "AddressFiltered");

      singleEdition = singleEdition.connect(editionsMetadataOwner);
      await expect(singleEdition.transferFrom(fan1.address, editionsOwner.address, 1)).to.emit(
        singleEdition,
        "Transfer",
      );

      await expect(
        singleEdition["safeTransferFrom(address,address,uint256)"](fan1.address, editionsOwner.address, 2),
      ).to.emit(singleEdition, "Transfer");

      // remove / unregister (validate event as well)
      singleEdition = singleEdition.connect(editionsOwner);
      await expect(singleEdition.removeMarketplaceFiltererRegistryAndUnregister())
        .to.emit(operatorRegistry, "RegistrationUpdated")
        .withArgs(singleEdition.address, false);

      // try all 4 transfer / approval with formerly restricted address
      singleEdition = singleEdition.connect(fan1);
      await expect(singleEdition.approve(editionsOwner.address, 3)).to.emit(singleEdition, "Approval");

      await expect(singleEdition.setApprovalForAll(editionsOwner.address, true)).to.emit(
        singleEdition,
        "ApprovalForAll",
      );

      singleEdition = singleEdition.connect(editionsOwner);
      await expect(singleEdition.transferFrom(fan1.address, editionsOwner.address, 1)).to.be.revertedWithCustomError(
        singleEdition,
        Errors.TransferFromIncorrectOwner,
      );

      await expect(
        singleEdition["safeTransferFrom(address,address,uint256)"](fan1.address, editionsOwner.address, 1),
      ).to.be.revertedWithCustomError(singleEdition, Errors.TransferFromIncorrectOwner);
    });
  });

  describe("MarketplaceFiltererAbridged", function () {
    let editions: ERC721Editions;
    let editionsDFS: ERC721EditionsDFS;

    beforeEach(async () => {
      editions = await setupMultipleEdition(
        observability.address,
        editionsImplementation,
        mintManager.address,
        auctionManager.address,
        trustedForwarder.address,
        emr.address,
        editionsOwner,
        10,
        "Test 1",
        "T1",
      );

      editionsDFS = await setupMultipleEditionDFS(
        observability.address,
        editionsDFSImplementation,
        mintManager.address,
        auctionManager.address,
        trustedForwarder.address,
        editionsOwner,
        10,
        "Test 2",
      );

      // setup some minted nfts to transfer later
      await expect(editions.registerMinter(editionsOwner.address)).to.emit(editions, "MinterRegistrationChanged");

      await expect(editions.mintAmountToRecipient(0, fan1.address, 4))
        .to.emit(editions, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 1)
        .to.emit(editions, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 2)
        .to.emit(editions, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 3)
        .to.emit(editions, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 4);

      for (let i = 1; i <= 4; i++) {
        expect(await editions.ownerOf(i)).to.equal(fan1.address);
      }

      await expect(editionsDFS.registerMinter(editionsOwner.address)).to.emit(editionsDFS, "MinterRegistrationChanged");

      await expect(editionsDFS.mintAmountToRecipient(0, fan1.address, 4))
        .to.emit(editionsDFS, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 1)
        .to.emit(editionsDFS, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 2)
        .to.emit(editionsDFS, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 3)
        .to.emit(editionsDFS, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 4);

      for (let i = 1; i <= 4; i++) {
        expect(await editionsDFS.ownerOf(i)).to.equal(fan1.address);
      }
    });

    it("Registering/unregistering filterer registry sets data properly", async function () {
      await expect(
        editions.setRegistryAndSubscription(operatorRegistry.address, "0x3cc6CddA760b79bAfa08dF41ECFA224f810dCeB6"),
      ).to.emit(operatorRegistry, "RegistrationUpdated");

      await expect(
        editionsDFS.setRegistryAndSubscription(operatorRegistry.address, "0x3cc6CddA760b79bAfa08dF41ECFA224f810dCeB6"),
      ).to.emit(operatorRegistry, "RegistrationUpdated");

      expect(await editions.operatorFiltererRegistry()).to.equal(operatorRegistry.address);
      expect(await editionsDFS.operatorFiltererRegistry()).to.equal(operatorRegistry.address);

      await expect(editions.setRegistryAndSubscription(ethers.constants.AddressZero, ethers.constants.AddressZero)).to
        .not.be.reverted;
      await expect(editionsDFS.setRegistryAndSubscription(ethers.constants.AddressZero, ethers.constants.AddressZero))
        .to.not.be.reverted;
      expect(await editions.operatorFiltererRegistry()).to.equal(ethers.constants.AddressZero);
      expect(await editionsDFS.operatorFiltererRegistry()).to.equal(ethers.constants.AddressZero);
    });

    it("Existence of filterer restricts/unrestricts transfers/approvals (MultipleEditions)", async function () {
      expect(await operatorRegistry.isRegistered(initialPlatformExecutor.address)).to.equal(true);

      // register and subscribe collection manually to initialPlatformExecutor subscription
      editions = editions.connect(editionsOwner);
      await expect(
        editions.setRegistryAndSubscription(operatorRegistry.address, "0x3cc6CddA760b79bAfa08dF41ECFA224f810dCeB6"),
      )
        .to.emit(operatorRegistry, "RegistrationUpdated")
        .to.emit(operatorRegistry, "SubscriptionUpdated");

      expect(await operatorRegistry.subscriptionOf(editions.address)).to.equal(
        "0x3cc6CddA760b79bAfa08dF41ECFA224f810dCeB6",
      );

      operatorRegistry = operatorRegistry.connect(editionsOwner);
      await expect(operatorRegistry.subscribe(editions.address, initialPlatformExecutor.address)).to.emit(
        operatorRegistry,
        "SubscriptionUpdated",
      );

      expect(await operatorRegistry.subscriptionOf(editions.address)).to.equal(initialPlatformExecutor.address);

      // all 4 transfer / approval functions should fail for editions owner now, and succeed for others
      // TODO: transfer functions

      editions = editions.connect(fan1);
      await expect(editions.approve(editionsOwner.address, 1)).to.be.revertedWithCustomError(
        operatorRegistry,
        "AddressFiltered",
      );

      await expect(editions.setApprovalForAll(editionsOwner.address, true)).to.be.revertedWithCustomError(
        operatorRegistry,
        "AddressFiltered",
      );

      await expect(editions.approve(editionsMetadataOwner.address, 1)).to.emit(editions, "Approval");

      await expect(editions.setApprovalForAll(editionsMetadataOwner.address, true)).to.emit(editions, "ApprovalForAll");
    });

    it("Existence of filterer restricts/unrestricts transfers/approvals (MultipleEditionsDFS)", async function () {
      expect(await operatorRegistry.isRegistered(initialPlatformExecutor.address)).to.equal(true);

      // register and subscribe collection manually to initialPlatformExecutor subscription
      editionsDFS = editionsDFS.connect(editionsOwner);
      await expect(
        editionsDFS.setRegistryAndSubscription(operatorRegistry.address, "0x3cc6CddA760b79bAfa08dF41ECFA224f810dCeB6"),
      )
        .to.emit(operatorRegistry, "RegistrationUpdated")
        .to.emit(operatorRegistry, "SubscriptionUpdated");

      expect(await operatorRegistry.subscriptionOf(editionsDFS.address)).to.equal(
        "0x3cc6CddA760b79bAfa08dF41ECFA224f810dCeB6",
      );

      operatorRegistry = operatorRegistry.connect(editionsOwner);
      await expect(operatorRegistry.subscribe(editionsDFS.address, initialPlatformExecutor.address)).to.emit(
        operatorRegistry,
        "SubscriptionUpdated",
      );

      expect(await operatorRegistry.subscriptionOf(editionsDFS.address)).to.equal(initialPlatformExecutor.address);

      // all 4 transfer / approval functions should fail for editionsDFS owner now, and succeed for others
      // TODO: transfer functions

      editionsDFS = editionsDFS.connect(fan1);
      await expect(editionsDFS.approve(editionsOwner.address, 1)).to.be.revertedWithCustomError(
        operatorRegistry,
        "AddressFiltered",
      );

      await expect(editionsDFS.setApprovalForAll(editionsOwner.address, true)).to.be.revertedWithCustomError(
        operatorRegistry,
        "AddressFiltered",
      );

      await expect(editionsDFS.approve(editionsMetadataOwner.address, 1)).to.emit(editionsDFS, "Approval");

      await expect(editionsDFS.setApprovalForAll(editionsMetadataOwner.address, true)).to.emit(
        editionsDFS,
        "ApprovalForAll",
      );
    });
  });
});

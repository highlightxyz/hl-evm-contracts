import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  ERC721SingleEdition,
  EditionsMetadataRenderer,
  MinimalForwarder,
  MintManager,
  Observability,
  OperatorFilterRegistry,
} from "../types";
import { Errors } from "./__utils__/data";
import { setupSingleEdition, setupSystem } from "./__utils__/helpers";

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
  let observability: Observability;
  let trustedForwarder: MinimalForwarder;
  let singleEditionImplementation: string;

  before(async () => {
    [initialPlatformExecutor, mintManagerOwner, editionsMetadataOwner, platformPaymentAddress, editionsOwner, fan1] =
      await ethers.getSigners();
    const {
      emrProxy,
      mintManagerProxy,
      minimalForwarder,
      observability: observabilityInstance,
      singleEditionImplementationAddress,
    } = await setupSystem(
      platformPaymentAddress.address,
      mintManagerOwner.address,
      initialPlatformExecutor.address,
      editionsMetadataOwner.address,
      editionsOwner,
    );

    emr = emrProxy;
    mintManager = mintManagerProxy;
    observability = observabilityInstance;
    trustedForwarder = minimalForwarder;
    singleEditionImplementation = singleEditionImplementationAddress;

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
});

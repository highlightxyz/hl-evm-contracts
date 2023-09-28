import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  AuctionManager,
  ConsensualNonTransferableTokenManager,
  ERC721Editions,
  ERC721General,
  ERC721SingleEdition,
  EditionsMetadataRenderer,
  MinimalForwarder,
  MintManager,
  NonTransferableTokenManager,
  Observability,
  TotalLockedTokenManager,
  TransferAndBurnLockedTokenManager,
} from "../types";
import { Errors } from "./__utils__/data";
import {
  DEFAULT_ONCHAIN_MINT_VECTOR,
  setupEditions,
  setupGeneral,
  setupSingleEdition,
  setupSystem,
} from "./__utils__/helpers";

const defaultEditionInfo = ethers.utils.defaultAbiCoder.encode(
  ["tuple(string, string, string, string, string, string)"],
  [["name", "description", "imageUrl", "animationUrl", "externalUrl", "attributes"]],
);

describe("ERC721 Standard with token managers functionality", () => {
  let totalLockedTokenManager: TotalLockedTokenManager;
  let transferAndBurnLockedTokenManager: TransferAndBurnLockedTokenManager;
  let nonTransferableTokenManager: NonTransferableTokenManager;
  let consensualNonTransferableTokenManager: ConsensualNonTransferableTokenManager;
  let initialPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    owner: SignerWithAddress,
    fan1: SignerWithAddress;

  let emr: EditionsMetadataRenderer;
  let mintManager: MintManager;
  let auctionManager: AuctionManager;
  let observability: Observability;
  let trustedForwarder: MinimalForwarder;
  let editionsImplementation: string;
  let singleEditionImplementation: string;
  let generalImplementation: string;

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
      auctionManagerProxy,
      observability: observabilityInstance,
      editionsImplementationAddress,
      singleEditionImplementationAddress,
      generalImplementationAddress,
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
    auctionManager = auctionManagerProxy;
    observability = observabilityInstance;
    editionsImplementation = editionsImplementationAddress;
    singleEditionImplementation = singleEditionImplementationAddress;
    generalImplementation = generalImplementationAddress;

    totalLockedTokenManager = await (await ethers.getContractFactory("TotalLockedTokenManager")).deploy();
    transferAndBurnLockedTokenManager = await (
      await ethers.getContractFactory("TransferAndBurnLockedTokenManager")
    ).deploy();

    nonTransferableTokenManager = await (await ethers.getContractFactory("NonTransferableTokenManager")).deploy();

    consensualNonTransferableTokenManager = await (
      await ethers.getContractFactory("ConsensualNonTransferableTokenManager")
    ).deploy();
  });

  describe("Testing 721 standard on ERC721General", function () {
    let general: ERC721General;

    beforeEach(async function () {
      general = await setupGeneral(
        observability.address,
        generalImplementation,
        trustedForwarder.address,
        mintManager.address,
        owner,
      );

      await expect(general.registerMinter(owner.address)).to.emit(general, "MinterRegistrationChanged");

      expect(await general.tokenManager(0)).to.eql(ethers.constants.AddressZero);

      await expect(general.mintAmountToOneRecipient(fan1.address, 4))
        .to.emit(general, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 1)
        .to.emit(general, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 2)
        .to.emit(general, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 3)
        .to.emit(general, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 4);

      for (let i = 1; i <= 4; i++) {
        expect(await general.ownerOf(i)).to.equal(fan1.address);
      }
    });

    describe("Without a token manager", function () {
      it("safeTransferFrom works as expected", async function () {
        general = general.connect(fan1);

        await expect(general["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 1))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 1)
          .to.emit(observability, "Transfer")
          .withArgs(general.address, fan1.address, owner.address, 1);

        await expect(
          general["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            2,
            ethers.utils.arrayify("0x"),
          ),
        )
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 2);

        expect(await general.ownerOf(1)).to.equal(owner.address);
        expect(await general.ownerOf(2)).to.equal(owner.address);

        await expect(general.approve(owner.address, 3))
          .to.emit(general, "Approval")
          .withArgs(fan1.address, owner.address, 3);

        await expect(general.approve(owner.address, 4))
          .to.emit(general, "Approval")
          .withArgs(fan1.address, owner.address, 4);

        general = general.connect(owner);

        await expect(general["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 3))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 3);

        await expect(
          general["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            4,
            ethers.utils.arrayify("0x"),
          ),
        )
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 4);

        expect(await general.ownerOf(3)).to.equal(owner.address);
        expect(await general.ownerOf(4)).to.equal(owner.address);
      });

      it("transferFrom works as expected", async function () {
        general = general.connect(fan1);

        expect(await general.ownerOf(1)).to.equal(fan1.address);
        expect(await general.ownerOf(2)).to.equal(fan1.address);

        await expect(general.transferFrom(fan1.address, owner.address, 1))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 1)
          .to.emit(observability, "Transfer")
          .withArgs(general.address, fan1.address, owner.address, 1);

        expect(await general.ownerOf(1)).to.equal(owner.address);

        await expect(general.approve(owner.address, 2))
          .to.emit(general, "Approval")
          .withArgs(fan1.address, owner.address, 2);

        general = general.connect(owner);

        await expect(general.transferFrom(fan1.address, owner.address, 2))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 2);

        expect(await general.ownerOf(2)).to.equal(owner.address);
      });

      it("burn works as expected", async function () {
        general = general.connect(fan1);

        expect(await general.ownerOf(1)).to.equal(fan1.address);
        expect(await general.ownerOf(2)).to.equal(fan1.address);

        await expect(general.burn(1))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 1)
          .to.emit(observability, "Transfer")
          .withArgs(general.address, fan1.address, ethers.constants.AddressZero, 1);

        await expect(general.approve(owner.address, 2))
          .to.emit(general, "Approval")
          .withArgs(fan1.address, owner.address, 2);

        general = general.connect(owner);

        await expect(general.burn(2))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 2);
      });
    });

    describe("With a default token manager", function () {
      beforeEach(async function () {
        await expect(general.setDefaultTokenManager(transferAndBurnLockedTokenManager.address)).to.emit(
          general,
          "DefaultTokenManagerChanged",
        );

        for (let i = 1; i <= 4; i++) {
          expect(await general.tokenManager(1)).to.equal(transferAndBurnLockedTokenManager.address);
        }
      });

      it("safeTransferFrom works as expected", async function () {
        general = general.connect(fan1);

        await expect(
          general["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 1),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(
          general["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            2,
            ethers.utils.arrayify("0x"),
          ),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(general.approve(owner.address, 3))
          .to.emit(general, "Approval")
          .withArgs(fan1.address, owner.address, 3);

        await expect(general.approve(owner.address, 4))
          .to.emit(general, "Approval")
          .withArgs(fan1.address, owner.address, 4);

        general = general.connect(owner);

        await expect(
          general["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 3),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(general.removeDefaultTokenManager()).to.emit(general, "DefaultTokenManagerChanged");

        await expect(general["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 3))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 3);

        expect(await general.ownerOf(3)).to.equal(owner.address);

        await expect(general.setDefaultTokenManager(totalLockedTokenManager.address)).to.emit(
          general,
          "DefaultTokenManagerChanged",
        );

        await expect(
          general["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            4,
            ethers.utils.arrayify("0x"),
          ),
        )
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 4);

        expect(await general.ownerOf(4)).to.equal(owner.address);
      });

      it("transferFrom works as expected", async function () {
        general = general.connect(fan1);

        await expect(general.transferFrom(fan1.address, owner.address, 1)).to.be.revertedWith("Transfers disallowed");

        await expect(general.transferFrom(fan1.address, owner.address, 2)).to.be.revertedWith("Transfers disallowed");

        await expect(general.approve(owner.address, 3))
          .to.emit(general, "Approval")
          .withArgs(fan1.address, owner.address, 3);

        await expect(general.approve(owner.address, 4))
          .to.emit(general, "Approval")
          .withArgs(fan1.address, owner.address, 4);

        general = general.connect(owner);

        await expect(general.transferFrom(fan1.address, owner.address, 3)).to.be.revertedWith("Transfers disallowed");

        await expect(general.removeDefaultTokenManager()).to.emit(general, "DefaultTokenManagerChanged");

        await expect(general.transferFrom(fan1.address, owner.address, 3))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 3);

        expect(await general.ownerOf(3)).to.equal(owner.address);

        await expect(general.setDefaultTokenManager(totalLockedTokenManager.address)).to.emit(
          general,
          "DefaultTokenManagerChanged",
        );

        await expect(general.transferFrom(fan1.address, owner.address, 4))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 4);

        expect(await general.ownerOf(4)).to.equal(owner.address);
      });

      it("burn works as expected", async function () {
        general = general.connect(fan1);

        expect(await general.ownerOf(1)).to.equal(fan1.address);
        expect(await general.ownerOf(2)).to.equal(fan1.address);

        await expect(general.burn(1)).to.be.revertedWith("Burns disallowed");

        await expect(general.approve(owner.address, 1))
          .to.emit(general, "Approval")
          .withArgs(fan1.address, owner.address, 1);

        await expect(general.approve(owner.address, 2))
          .to.emit(general, "Approval")
          .withArgs(fan1.address, owner.address, 2);

        general = general.connect(owner);

        await expect(general.removeDefaultTokenManager()).to.emit(general, "DefaultTokenManagerChanged");

        await expect(general.burn(1))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 1);

        await expect(general.setDefaultTokenManager(totalLockedTokenManager.address)).to.emit(
          general,
          "DefaultTokenManagerChanged",
        );

        await expect(general.burn(2))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 2);
      });
    });

    describe("With multiple overwriting token managers per token", function () {
      beforeEach(async function () {
        await expect(general.setDefaultTokenManager(transferAndBurnLockedTokenManager.address)).to.emit(
          general,
          "DefaultTokenManagerChanged",
        );

        await expect(
          general.setGranularTokenManagers([3, 4], [totalLockedTokenManager.address, totalLockedTokenManager.address]),
        ).to.emit(general, "GranularTokenManagersSet");

        for (let i = 1; i <= 2; i++) {
          expect(await general.tokenManager(i)).to.equal(transferAndBurnLockedTokenManager.address);
        }

        for (let i = 3; i <= 4; i++) {
          expect(await general.tokenManager(i)).to.equal(totalLockedTokenManager.address);
        }
      });

      it("safeTransferFrom works as expected", async function () {
        general = general.connect(fan1);

        await expect(
          general["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 1),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(
          general["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            2,
            ethers.utils.arrayify("0x"),
          ),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(general["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 3))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 3);

        await expect(
          general["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            4,
            ethers.utils.arrayify("0x"),
          ),
        )
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 4);

        expect(await general.ownerOf(3)).to.equal(owner.address);
        expect(await general.ownerOf(4)).to.equal(owner.address);
      });

      it("transferFrom works as expected", async function () {
        general = general.connect(fan1);

        await expect(general.transferFrom(fan1.address, owner.address, 1)).to.be.revertedWith("Transfers disallowed");

        await expect(general.transferFrom(fan1.address, owner.address, 2)).to.be.revertedWith("Transfers disallowed");

        await expect(general.transferFrom(fan1.address, owner.address, 3))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 3);

        await expect(general.transferFrom(fan1.address, owner.address, 4))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, owner.address, 4);

        expect(await general.ownerOf(3)).to.equal(owner.address);
        expect(await general.ownerOf(4)).to.equal(owner.address);
      });

      it("burn works as expected", async function () {
        general = general.connect(fan1);

        await expect(general.burn(1)).to.be.revertedWith("Burns disallowed");

        await expect(general.burn(2)).to.be.revertedWith("Burns disallowed");

        await expect(general.burn(3))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 3);

        await expect(general.burn(4))
          .to.emit(general, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 4);
      });

      it("ConsensualNonTransferableTokenManager burns properly", async function () {
        general = general.connect(owner);
        // burn allowed
        await expect(
          general.setGranularTokenManagers(
            [1, 2],
            [consensualNonTransferableTokenManager.address, nonTransferableTokenManager.address],
          ),
        ).to.emit(general, "GranularTokenManagersSet");

        general = general.connect(fan1);

        await expect(general.burn(1)).to.emit(general, "Transfer");

        general = general.connect(editionsMetadataOwner);

        await expect(general.burn(2)).to.be.revertedWithCustomError(general, Errors.Unauthorized);
      });
    });
  });

  describe("Testing 721 standard on ERC721Editions", function () {
    let editions: ERC721Editions;

    beforeEach(async function () {
      editions = await setupEditions(
        observability.address,
        editionsImplementation,
        mintManager.address,
        auctionManager.address,
        trustedForwarder.address,
        emr.address,
        owner,
      );

      await expect(editions.registerMinter(owner.address)).to.emit(editions, "MinterRegistrationChanged");

      await expect(editions.createEdition(defaultEditionInfo, 4, ethers.constants.AddressZero, zeroRoyalty, "0x"))
        .to.emit(editions, "EditionCreated")
        .withArgs(0, 4, ethers.constants.AddressZero);

      await expect(editions.createEdition(defaultEditionInfo, 2, totalLockedTokenManager.address, zeroRoyalty, "0x"))
        .to.emit(editions, "EditionCreated")
        .withArgs(1, 2, totalLockedTokenManager.address);

      await expect(editions.mintAmountToRecipient(0, fan1.address, 4))
        .to.emit(editions, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 1)
        .to.emit(editions, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 2)
        .to.emit(editions, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 3)
        .to.emit(editions, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 4);

      await expect(editions.mintAmountToRecipient(1, fan1.address, 2))
        .to.emit(editions, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 5)
        .to.emit(editions, "Transfer")
        .withArgs(ethers.constants.AddressZero, fan1.address, 6);

      for (let i = 1; i <= 6; i++) {
        expect(await editions.ownerOf(i)).to.equal(fan1.address);
      }
    });

    describe("Without a token manager", function () {
      it("safeTransferFrom works as expected", async function () {
        editions = editions.connect(fan1);

        await expect(editions["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 1))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 1)
          .to.emit(observability, "Transfer")
          .withArgs(editions.address, fan1.address, owner.address, 1);

        await expect(
          editions["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            2,
            ethers.utils.arrayify("0x"),
          ),
        )
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 2);

        expect(await editions.ownerOf(1)).to.equal(owner.address);
        expect(await editions.ownerOf(2)).to.equal(owner.address);

        await expect(editions.approve(owner.address, 3))
          .to.emit(editions, "Approval")
          .withArgs(fan1.address, owner.address, 3);

        await expect(editions.approve(owner.address, 4))
          .to.emit(editions, "Approval")
          .withArgs(fan1.address, owner.address, 4);

        editions = editions.connect(owner);

        await expect(editions["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 3))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 3);

        await expect(
          editions["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            4,
            ethers.utils.arrayify("0x"),
          ),
        )
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 4);

        expect(await editions.ownerOf(3)).to.equal(owner.address);
        expect(await editions.ownerOf(4)).to.equal(owner.address);
      });

      it("transferFrom works as expected", async function () {
        editions = editions.connect(fan1);

        expect(await editions.ownerOf(1)).to.equal(fan1.address);
        expect(await editions.ownerOf(2)).to.equal(fan1.address);

        await expect(editions.transferFrom(fan1.address, owner.address, 1))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 1)
          .to.emit(observability, "Transfer")
          .withArgs(editions.address, fan1.address, owner.address, 1);

        expect(await editions.ownerOf(1)).to.equal(owner.address);

        await expect(editions.approve(owner.address, 2))
          .to.emit(editions, "Approval")
          .withArgs(fan1.address, owner.address, 2);

        editions = editions.connect(owner);

        await expect(editions.transferFrom(fan1.address, owner.address, 2))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 2);

        expect(await editions.ownerOf(2)).to.equal(owner.address);
      });

      it("burn works as expected", async function () {
        editions = editions.connect(fan1);

        expect(await editions.ownerOf(1)).to.equal(fan1.address);
        expect(await editions.ownerOf(2)).to.equal(fan1.address);

        await expect(editions.burn(1))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 1)
          .to.emit(observability, "Transfer")
          .withArgs(editions.address, fan1.address, ethers.constants.AddressZero, 1);

        await expect(editions.approve(owner.address, 2))
          .to.emit(editions, "Approval")
          .withArgs(fan1.address, owner.address, 2);

        editions = editions.connect(owner);

        await expect(editions.burn(2))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 2);
      });
    });

    describe("With a default token manager", function () {
      beforeEach(async function () {
        await expect(await editions.setDefaultTokenManager(transferAndBurnLockedTokenManager.address)).to.emit(
          editions,
          "DefaultTokenManagerChanged",
        );

        // TODO: use tokenManagerByTokenId
        expect(await editions.tokenManager(0)).to.equal(transferAndBurnLockedTokenManager.address);
        expect(await editions.tokenManager(1)).to.equal(totalLockedTokenManager.address);
      });

      it("safeTransferFrom works as expected", async function () {
        editions = editions.connect(fan1);

        await expect(
          editions["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 1),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(
          editions["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            2,
            ethers.utils.arrayify("0x"),
          ),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(editions.approve(owner.address, 3))
          .to.emit(editions, "Approval")
          .withArgs(fan1.address, owner.address, 3);

        await expect(editions.approve(owner.address, 4))
          .to.emit(editions, "Approval")
          .withArgs(fan1.address, owner.address, 4);

        editions = editions.connect(owner);

        await expect(
          editions["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 3),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(editions.removeDefaultTokenManager()).to.emit(editions, "DefaultTokenManagerChanged");

        await expect(editions["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 3))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 3);

        expect(await editions.ownerOf(3)).to.equal(owner.address);

        await expect(editions.setDefaultTokenManager(totalLockedTokenManager.address)).to.emit(
          editions,
          "DefaultTokenManagerChanged",
        );

        await expect(
          editions["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            4,
            ethers.utils.arrayify("0x"),
          ),
        )
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 4);

        expect(await editions.ownerOf(4)).to.equal(owner.address);
      });

      it("transferFrom works as expected", async function () {
        editions = editions.connect(fan1);

        await expect(editions.transferFrom(fan1.address, owner.address, 1)).to.be.revertedWith("Transfers disallowed");

        await expect(editions.transferFrom(fan1.address, owner.address, 2)).to.be.revertedWith("Transfers disallowed");

        await expect(editions.approve(owner.address, 3))
          .to.emit(editions, "Approval")
          .withArgs(fan1.address, owner.address, 3);

        await expect(editions.approve(owner.address, 4))
          .to.emit(editions, "Approval")
          .withArgs(fan1.address, owner.address, 4);

        editions = editions.connect(owner);

        await expect(editions.transferFrom(fan1.address, owner.address, 3)).to.be.revertedWith("Transfers disallowed");

        await expect(editions.removeDefaultTokenManager()).to.emit(editions, "DefaultTokenManagerChanged");

        await expect(editions.transferFrom(fan1.address, owner.address, 3))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 3);

        expect(await editions.ownerOf(3)).to.equal(owner.address);

        await expect(editions.setDefaultTokenManager(totalLockedTokenManager.address)).to.emit(
          editions,
          "DefaultTokenManagerChanged",
        );

        await expect(editions.transferFrom(fan1.address, owner.address, 4))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 4);

        expect(await editions.ownerOf(4)).to.equal(owner.address);
      });

      it("burn works as expected", async function () {
        editions = editions.connect(fan1);

        expect(await editions.ownerOf(1)).to.equal(fan1.address);
        expect(await editions.ownerOf(2)).to.equal(fan1.address);

        await expect(editions.burn(1)).to.be.revertedWith("Burns disallowed");

        await expect(editions.approve(owner.address, 1))
          .to.emit(editions, "Approval")
          .withArgs(fan1.address, owner.address, 1);

        await expect(editions.approve(owner.address, 2))
          .to.emit(editions, "Approval")
          .withArgs(fan1.address, owner.address, 2);

        editions = editions.connect(owner);

        await expect(editions.removeDefaultTokenManager()).to.emit(editions, "DefaultTokenManagerChanged");

        await expect(editions.burn(1))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 1);

        await expect(editions.setDefaultTokenManager(totalLockedTokenManager.address)).to.emit(
          editions,
          "DefaultTokenManagerChanged",
        );

        await expect(editions.burn(2))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 2);
      });
    });

    describe("With multiple overwriting token managers per edition", function () {
      beforeEach(async function () {
        await expect(await editions.setDefaultTokenManager(transferAndBurnLockedTokenManager.address)).to.emit(
          editions,
          "DefaultTokenManagerChanged",
        );

        // TODO: use tokenManagerByTokenId
        expect(await editions.tokenManager(0)).to.equal(transferAndBurnLockedTokenManager.address);
        expect(await editions.tokenManager(1)).to.equal(totalLockedTokenManager.address);
      });

      it("safeTransferFrom works as expected", async function () {
        editions = editions.connect(fan1);

        await expect(
          editions["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 1),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(
          editions["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            2,
            ethers.utils.arrayify("0x"),
          ),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(
          editions["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 3),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(
          editions["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 4),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(
          editions["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            2,
            ethers.utils.arrayify("0x"),
          ),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(
          editions["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            2,
            ethers.utils.arrayify("0x"),
          ),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(editions["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 5))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 5);

        await expect(
          editions["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            6,
            ethers.utils.arrayify("0x"),
          ),
        )
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 6);

        expect(await editions.ownerOf(5)).to.equal(owner.address);
        expect(await editions.ownerOf(6)).to.equal(owner.address);
      });

      it("transferFrom works as expected", async function () {
        editions = editions.connect(fan1);

        await expect(editions.transferFrom(fan1.address, owner.address, 1)).to.be.revertedWith("Transfers disallowed");

        await expect(editions.transferFrom(fan1.address, owner.address, 2)).to.be.revertedWith("Transfers disallowed");

        await expect(editions.transferFrom(fan1.address, owner.address, 3)).to.be.revertedWith("Transfers disallowed");

        await expect(editions.transferFrom(fan1.address, owner.address, 4)).to.be.revertedWith("Transfers disallowed");

        await expect(editions.transferFrom(fan1.address, owner.address, 5))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 5);

        await expect(editions.transferFrom(fan1.address, owner.address, 6))
          .to.emit(editions, "Transfer")
          .withArgs(fan1.address, owner.address, 6);

        expect(await editions.ownerOf(5)).to.equal(owner.address);
        expect(await editions.ownerOf(6)).to.equal(owner.address);
      });
    });
  });

  describe("Testing 721 standard on ERC721SingleEdition", function () {
    let singleEdition: ERC721SingleEdition;

    beforeEach(async function () {
      singleEdition = await setupSingleEdition(
        observability.address,
        singleEditionImplementation,
        mintManager.address,
        trustedForwarder.address,
        emr.address,
        owner,
        4,
        "name",
        "SYM",
      );

      await expect(singleEdition.registerMinter(owner.address)).to.emit(singleEdition, "MinterRegistrationChanged");

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

    describe("Without a token manager", function () {
      it("safeTransferFrom works as expected", async function () {
        singleEdition = singleEdition.connect(fan1);

        await expect(singleEdition["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 1))
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, owner.address, 1);

        await expect(
          singleEdition["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            2,
            ethers.utils.arrayify("0x"),
          ),
        )
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, owner.address, 2);

        expect(await singleEdition.ownerOf(1)).to.equal(owner.address);
        expect(await singleEdition.ownerOf(2)).to.equal(owner.address);

        await expect(singleEdition.approve(owner.address, 3))
          .to.emit(singleEdition, "Approval")
          .withArgs(fan1.address, owner.address, 3);

        await expect(singleEdition.approve(owner.address, 4))
          .to.emit(singleEdition, "Approval")
          .withArgs(fan1.address, owner.address, 4);

        singleEdition = singleEdition.connect(owner);

        await expect(singleEdition["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 3))
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, owner.address, 3);

        await expect(
          singleEdition["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            4,
            ethers.utils.arrayify("0x"),
          ),
        )
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, owner.address, 4);

        expect(await singleEdition.ownerOf(3)).to.equal(owner.address);
        expect(await singleEdition.ownerOf(4)).to.equal(owner.address);
      });

      it("transferFrom works as expected", async function () {
        singleEdition = singleEdition.connect(fan1);

        expect(await singleEdition.ownerOf(1)).to.equal(fan1.address);
        expect(await singleEdition.ownerOf(2)).to.equal(fan1.address);

        await expect(singleEdition.transferFrom(fan1.address, owner.address, 1))
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, owner.address, 1)
          .to.emit(observability, "Transfer")
          .withArgs(singleEdition.address, fan1.address, owner.address, 1);

        expect(await singleEdition.ownerOf(1)).to.equal(owner.address);

        await expect(singleEdition.approve(owner.address, 2))
          .to.emit(singleEdition, "Approval")
          .withArgs(fan1.address, owner.address, 2);

        singleEdition = singleEdition.connect(owner);

        await expect(singleEdition.transferFrom(fan1.address, owner.address, 2))
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, owner.address, 2);

        expect(await singleEdition.ownerOf(2)).to.equal(owner.address);
      });

      it("burn works as expected", async function () {
        singleEdition = singleEdition.connect(fan1);

        expect(await singleEdition.ownerOf(1)).to.equal(fan1.address);
        expect(await singleEdition.ownerOf(2)).to.equal(fan1.address);

        await expect(singleEdition.burn(1))
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 1)
          .to.emit(observability, "Transfer")
          .withArgs(singleEdition.address, fan1.address, ethers.constants.AddressZero, 1);

        await expect(singleEdition.approve(owner.address, 2))
          .to.emit(singleEdition, "Approval")
          .withArgs(fan1.address, owner.address, 2);

        singleEdition = singleEdition.connect(owner);

        await expect(singleEdition.burn(2))
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 2);
      });
    });

    describe("With a default token manager", function () {
      beforeEach(async function () {
        await expect(await singleEdition.setDefaultTokenManager(transferAndBurnLockedTokenManager.address)).to.emit(
          singleEdition,
          "DefaultTokenManagerChanged",
        );

        // TODO: use tokenManagerByTokenId
        expect(await singleEdition.tokenManager(0)).to.equal(transferAndBurnLockedTokenManager.address);
      });

      it("safeTransferFrom works as expected", async function () {
        singleEdition = singleEdition.connect(fan1);

        await expect(
          singleEdition["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 1),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(
          singleEdition["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            2,
            ethers.utils.arrayify("0x"),
          ),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(singleEdition.approve(owner.address, 3))
          .to.emit(singleEdition, "Approval")
          .withArgs(fan1.address, owner.address, 3);

        await expect(singleEdition.approve(owner.address, 4))
          .to.emit(singleEdition, "Approval")
          .withArgs(fan1.address, owner.address, 4);

        singleEdition = singleEdition.connect(owner);

        await expect(
          singleEdition["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 3),
        ).to.be.revertedWith("Transfers disallowed");

        await expect(singleEdition.removeDefaultTokenManager()).to.emit(singleEdition, "DefaultTokenManagerChanged");

        await expect(singleEdition["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, 3))
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, owner.address, 3)
          .to.emit(observability, "Transfer")
          .withArgs(singleEdition.address, fan1.address, owner.address, 3);

        expect(await singleEdition.ownerOf(3)).to.equal(owner.address);

        await expect(singleEdition.setDefaultTokenManager(totalLockedTokenManager.address)).to.emit(
          singleEdition,
          "DefaultTokenManagerChanged",
        );

        await expect(
          singleEdition["safeTransferFrom(address,address,uint256,bytes)"](
            fan1.address,
            owner.address,
            4,
            ethers.utils.arrayify("0x"),
          ),
        )
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, owner.address, 4);

        expect(await singleEdition.ownerOf(4)).to.equal(owner.address);
      });

      it("transferFrom works as expected", async function () {
        singleEdition = singleEdition.connect(fan1);

        await expect(singleEdition.transferFrom(fan1.address, owner.address, 1)).to.be.revertedWith(
          "Transfers disallowed",
        );

        await expect(singleEdition.transferFrom(fan1.address, owner.address, 2)).to.be.revertedWith(
          "Transfers disallowed",
        );

        await expect(singleEdition.approve(owner.address, 3))
          .to.emit(singleEdition, "Approval")
          .withArgs(fan1.address, owner.address, 3);

        await expect(singleEdition.approve(owner.address, 4))
          .to.emit(singleEdition, "Approval")
          .withArgs(fan1.address, owner.address, 4);

        singleEdition = singleEdition.connect(owner);

        await expect(singleEdition.transferFrom(fan1.address, owner.address, 3)).to.be.revertedWith(
          "Transfers disallowed",
        );

        await expect(singleEdition.removeDefaultTokenManager()).to.emit(singleEdition, "DefaultTokenManagerChanged");

        await expect(singleEdition.transferFrom(fan1.address, owner.address, 3))
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, owner.address, 3);

        expect(await singleEdition.ownerOf(3)).to.equal(owner.address);

        await expect(singleEdition.setDefaultTokenManager(totalLockedTokenManager.address)).to.emit(
          singleEdition,
          "DefaultTokenManagerChanged",
        );

        await expect(singleEdition.transferFrom(fan1.address, owner.address, 4))
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, owner.address, 4);

        expect(await singleEdition.ownerOf(4)).to.equal(owner.address);
      });

      it("burn works as expected", async function () {
        singleEdition = singleEdition.connect(fan1);

        expect(await singleEdition.ownerOf(1)).to.equal(fan1.address);
        expect(await singleEdition.ownerOf(2)).to.equal(fan1.address);

        await expect(singleEdition.burn(1)).to.be.revertedWith("Burns disallowed");

        await expect(singleEdition.approve(owner.address, 1))
          .to.emit(singleEdition, "Approval")
          .withArgs(fan1.address, owner.address, 1);

        await expect(singleEdition.approve(owner.address, 2))
          .to.emit(singleEdition, "Approval")
          .withArgs(fan1.address, owner.address, 2);

        singleEdition = singleEdition.connect(owner);

        await expect(singleEdition.removeDefaultTokenManager()).to.emit(singleEdition, "DefaultTokenManagerChanged");

        await expect(singleEdition.burn(1))
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 1);

        await expect(singleEdition.setDefaultTokenManager(totalLockedTokenManager.address)).to.emit(
          singleEdition,
          "DefaultTokenManagerChanged",
        );

        await expect(singleEdition.burn(2))
          .to.emit(singleEdition, "Transfer")
          .withArgs(fan1.address, ethers.constants.AddressZero, 2);
      });

      it("NonTransferable token manager works properly", async function () {
        singleEdition = await setupSingleEdition(
          observability.address,
          singleEditionImplementation,
          mintManager.address,
          trustedForwarder.address,
          emr.address,
          owner,
          4,
          "name",
          "SYM",
          null,
          false,
          nonTransferableTokenManager.address,
        );

        await expect(singleEdition.registerMinter(owner.address)).to.emit(singleEdition, "MinterRegistrationChanged");

        await expect(singleEdition.mintAmountToRecipient(0, fan1.address, 4))
          .to.emit(singleEdition, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(singleEdition, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(singleEdition, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3)
          .to.emit(singleEdition, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4);

        singleEdition = singleEdition.connect(fan1);
        for (let i = 1; i <= 4; i++) {
          expect(await singleEdition.ownerOf(i)).to.equal(fan1.address);

          await expect(
            singleEdition["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, i),
          ).to.be.revertedWith("Transfers disallowed");

          await expect(
            singleEdition["safeTransferFrom(address,address,uint256,bytes)"](
              fan1.address,
              owner.address,
              i,
              ethers.utils.arrayify("0x"),
            ),
          ).to.be.revertedWith("Transfers disallowed");

          await expect(singleEdition.transferFrom(fan1.address, owner.address, i)).to.be.revertedWith(
            "Transfers disallowed",
          );
        }
      });

      it("ConsensualNonTransferableTokenManager token manager works properly", async function () {
        singleEdition = await setupSingleEdition(
          observability.address,
          singleEditionImplementation,
          mintManager.address,
          trustedForwarder.address,
          emr.address,
          owner,
          4,
          "name",
          "SYM",
          null,
          false,
          consensualNonTransferableTokenManager.address,
        );

        await expect(singleEdition.registerMinter(owner.address)).to.emit(singleEdition, "MinterRegistrationChanged");

        await expect(singleEdition.mintAmountToRecipient(0, fan1.address, 4))
          .to.emit(singleEdition, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(singleEdition, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(singleEdition, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3)
          .to.emit(singleEdition, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4);

        singleEdition = singleEdition.connect(fan1);
        for (let i = 1; i <= 4; i++) {
          expect(await singleEdition.ownerOf(i)).to.equal(fan1.address);

          await expect(
            singleEdition["safeTransferFrom(address,address,uint256)"](fan1.address, editionsMetadataOwner.address, i),
          ).to.be.revertedWith("Transfers disallowed");

          await expect(
            singleEdition["safeTransferFrom(address,address,uint256,bytes)"](
              fan1.address,
              editionsMetadataOwner.address,
              i,
              ethers.utils.arrayify("0x"),
            ),
          ).to.be.revertedWith("Transfers disallowed");

          await expect(singleEdition.transferFrom(fan1.address, editionsMetadataOwner.address, i)).to.be.revertedWith(
            "Transfers disallowed",
          );

          if (i == 1 || i == 2) {
            await expect(
              singleEdition["safeTransferFrom(address,address,uint256)"](fan1.address, owner.address, i),
            ).to.emit(singleEdition, "Transfer");
          } else if (i == 3) {
            await expect(
              singleEdition["safeTransferFrom(address,address,uint256,bytes)"](
                fan1.address,
                owner.address,
                i,
                ethers.utils.arrayify("0x"),
              ),
            ).to.emit(singleEdition, "Transfer");
          } else {
            await expect(singleEdition.transferFrom(fan1.address, owner.address, i)).to.emit(singleEdition, "Transfer");
          }
        }
      });
    });
  });
});

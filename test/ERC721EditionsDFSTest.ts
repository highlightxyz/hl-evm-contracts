import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  AuctionManager,
  ERC721EditionsDFS,
  LockedTokenManager,
  MinimalForwarder,
  MintManager,
  Observability,
} from "../types";
import { Errors } from "./__utils__/data";
import {
  DEFAULT_ONCHAIN_MINT_VECTOR,
  setupEditionsDFS,
  setupMultipleEditionDFS,
  setupSystem,
} from "./__utils__/helpers";
import { getValidClaimTimestamp } from "./__utils__/mint";

describe("ERC721EditionsDFS functionality", () => {
  let lockedTokenManager: LockedTokenManager;
  let editions: ERC721EditionsDFS;
  let initialPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    editionsOwner: SignerWithAddress,
    fan1: SignerWithAddress;

  let mintManager: MintManager;
  let auctionManager: AuctionManager;
  let trustedForwarder: MinimalForwarder;
  let observability: Observability;
  let editionsImplementation: string;
  let auctionData: string;

  const zeroRoyalty = {
    recipientAddress: ethers.constants.AddressZero,
    royaltyPercentageBPS: 0,
  };

  before(async () => {
    [initialPlatformExecutor, mintManagerOwner, editionsMetadataOwner, platformPaymentAddress, editionsOwner, fan1] =
      await ethers.getSigners();
    const {
      mintManagerProxy,
      minimalForwarder,
      observability: observabilityInstance,
      auctionManagerProxy,
      editionsDFSImplementationAddress,
    } = await setupSystem(
      platformPaymentAddress.address,
      mintManagerOwner.address,
      initialPlatformExecutor.address,
      editionsMetadataOwner.address,
      editionsOwner,
    );

    mintManager = mintManagerProxy;
    trustedForwarder = minimalForwarder;
    observability = observabilityInstance;
    auctionManager = auctionManagerProxy;
    editionsImplementation = editionsDFSImplementationAddress;

    lockedTokenManager = await (await ethers.getContractFactory("LockedTokenManager")).deploy();
  });

  beforeEach(async () => {
    editions = await setupEditionsDFS(
      observability.address,
      editionsImplementation,
      mintManager.address,
      auctionManager.address,
      trustedForwarder.address,
      editionsOwner,
    );
    auctionData = ethers.utils.defaultAbiCoder.encode(
      ["address", "bytes32", "address", "address", "uint256"],
      [
        auctionManager.address,
        ethers.utils.formatBytes32String("auctionId"),
        ethers.constants.AddressZero,
        editionsOwner.address,
        getValidClaimTimestamp(),
      ],
    );
  });

  describe("createEdition", async function () {
    it("Edition size has to be greater than 0", async function () {
      await expect(
        editions.createEdition("editionUri", 0, ethers.constants.AddressZero, zeroRoyalty, "0x"),
      ).to.be.revertedWithCustomError(editions, Errors.InvalidSize);
    });

    it("Non-owner cannot create edition", async function () {
      editions = editions.connect(fan1);
      await expect(
        editions.createEdition("editionUri", 100, ethers.constants.AddressZero, zeroRoyalty, "0x"),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Can create edition without passing in edition token manager", async function () {
      await expect(editions.createEdition("editionUri", 100, ethers.constants.AddressZero, zeroRoyalty, "0x"))
        .to.emit(editions, "EditionCreated")
        .withArgs(0, 100, ethers.constants.AddressZero);

      expect(await editions.tokenManager(0)).to.eql(ethers.constants.AddressZero);
    });

    it("Can create edition with passing in edition token manager", async function () {
      await expect(editions.createEdition("editionUri", 100, lockedTokenManager.address, zeroRoyalty, "0x"))
        .to.emit(editions, "EditionCreated")
        .withArgs(0, 100, lockedTokenManager.address);

      expect(await editions.tokenManager(0)).to.eql(lockedTokenManager.address);
    });
  });

  describe("createEditionWithAuction", async function () {
    it("Non-owner cannot create edition/auction", async function () {
      editions = editions.connect(fan1);
      await expect(
        editions.createEditionWithAuction("editionUri", auctionData, ethers.constants.AddressZero, zeroRoyalty),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Can create edition without passing in edition token manager", async function () {
      const timestamp = getValidClaimTimestamp();
      auctionData = ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes32", "address", "address", "uint256"],
        [
          auctionManager.address,
          ethers.utils.formatBytes32String("auctionId1"),
          ethers.constants.AddressZero,
          editionsOwner.address,
          timestamp,
        ],
      );

      await expect(
        editions.createEditionWithAuction("editionUri", auctionData, ethers.constants.AddressZero, zeroRoyalty),
      )
        .to.emit(editions, "EditionCreated")
        .withArgs(0, 1, ethers.constants.AddressZero);

      expect(await editions.tokenManager(0)).to.eql(ethers.constants.AddressZero);
      const res = await auctionManager.getFullAuctionData(ethers.utils.formatBytes32String("auctionId1"));
      expect(res[0][0]).to.equal(editions.address);
      expect(res[0][4]).to.equal(ethers.BigNumber.from(timestamp));
      expect(res[2][0]).to.equal(true);
      expect(res[2][1]).to.equal(ethers.BigNumber.from(0));
    });

    it("Can create edition with passing in edition token manager", async function () {
      const timestamp = getValidClaimTimestamp();
      auctionData = ethers.utils.defaultAbiCoder.encode(
        ["address", "bytes32", "address", "address", "uint256"],
        [
          auctionManager.address,
          ethers.utils.formatBytes32String("auctionId2"),
          ethers.constants.AddressZero,
          editionsOwner.address,
          timestamp,
        ],
      );

      await expect(
        editions.createEditionWithAuction("editionUri", auctionData, lockedTokenManager.address, zeroRoyalty),
      )
        .to.emit(editions, "EditionCreated")
        .withArgs(0, 1, lockedTokenManager.address);

      expect(await editions.tokenManager(0)).to.eql(lockedTokenManager.address);
      const res = await auctionManager.getFullAuctionData(ethers.utils.formatBytes32String("auctionId2"));
      expect(res[0][0]).to.equal(editions.address);
      expect(res[0][4]).to.equal(ethers.BigNumber.from(timestamp));
      expect(res[2][0]).to.equal(true);
      expect(res[2][1]).to.equal(ethers.BigNumber.from(0));
    });
  });

  describe("Minting", function () {
    beforeEach(async function () {
      await expect(editions.createEdition("editionUri", 5, lockedTokenManager.address, zeroRoyalty, "0x"))
        .to.emit(editions, "EditionCreated")
        .withArgs(0, 5, lockedTokenManager.address);

      await expect(editions.registerMinter(editionsOwner.address));

      expect(await editions.tokenManager(0)).to.eql(lockedTokenManager.address);
    });

    describe("mintOneToRecipient", function () {
      it("Non minter cannot call", async function () {
        editions = editions.connect(fan1);

        await expect(editions.mintOneToRecipient(0, fan1.address)).to.be.revertedWithCustomError(
          editions,
          Errors.NotMinter,
        );
      });

      it("Cannot mint on non-existent edition", async function () {
        await expect(editions.mintOneToRecipient(1, fan1.address)).to.be.revertedWithCustomError(
          editions,
          Errors.EditionDoesNotExist,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(editions.freezeMints()).to.emit(editions, "MintsFrozen");

        await expect(editions.mintOneToRecipient(0, fan1.address)).to.be.revertedWithCustomError(
          editions,
          Errors.MintFrozen,
        );
      });

      it("Can mint validly up until max supply", async function () {
        for (let i = 1; i <= 5; i++) {
          await expect(editions.mintOneToRecipient(0, fan1.address))
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i);

          expect(await editions.balanceOf(fan1.address)).to.equal(ethers.BigNumber.from(i));
          expect(await editions.ownerOf(i)).to.equal(fan1.address);
          expect((await editions.getEditionStartIds()).map(x => x.toNumber())).to.eql([1]);
          expect((await editions.getEditionId(i)).toNumber()).to.equal(0);
          expect(
            (await editions.getEditionDetails(0)).map(x => {
              if (typeof x != "string") {
                return x.toNumber();
              } else {
                return x;
              }
            }),
          ).to.eql(["", 5, i, 1]);
          const res = await editions.getEditionsDetailsAndUri([0]);
          expect(res[0][0][0]).to.equal("");
          expect(res[0][0][1].toNumber()).to.equal(5);
          expect(res[0][0][2].toNumber()).to.equal(i);
          expect(res[0][0][3].toNumber()).to.equal(1);
        }

        await expect(editions.mintOneToRecipient(0, fan1.address)).to.be.revertedWithCustomError(
          editions,
          Errors.SoldOut,
        );
      });
    });

    describe("mintAmountToRecipient", function () {
      it("Non minter cannot call", async function () {
        editions = editions.connect(fan1);

        await expect(editions.mintAmountToRecipient(0, fan1.address, 2)).to.be.revertedWithCustomError(
          editions,
          Errors.NotMinter,
        );
      });

      it("Cannot mint on non-existent edition", async function () {
        await expect(editions.mintAmountToRecipient(1, fan1.address, 2)).to.be.revertedWithCustomError(
          editions,
          Errors.EditionDoesNotExist,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(editions.freezeMints()).to.emit(editions, "MintsFrozen");

        await expect(editions.mintAmountToRecipient(0, fan1.address, 2)).to.be.revertedWithCustomError(
          editions,
          Errors.MintFrozen,
        );
      });

      it("Cannot mint more than maxSupply, in multiple variations", async function () {
        await expect(editions.mintAmountToRecipient(0, fan1.address, 6)).to.be.revertedWithCustomError(
          editions,
          Errors.SoldOut,
        );

        await expect(editions.mintAmountToRecipient(0, fan1.address, 3))
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3);

        await expect(editions.mintAmountToRecipient(0, fan1.address, 3)).to.be.revertedWithCustomError(
          editions,
          Errors.SoldOut,
        );
      });

      it("Minter can mint validly (simple variation)", async function () {
        await expect(editions.mintAmountToRecipient(0, fan1.address, 3))
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3);

        expect((await editions.balanceOf(fan1.address)).toNumber()).to.equal(3);

        for (let i = 1; i <= 3; i++) {
          expect(await editions.ownerOf(i)).to.equal(fan1.address);
          expect((await editions.getEditionId(i)).toNumber()).to.equal(0);
        }

        expect(
          (await editions.getEditionDetails(0)).map(x => {
            if (typeof x != "string") {
              return x.toNumber();
            } else {
              return x;
            }
          }),
        ).to.eql(["", 5, 3, 1]);

        const res = await editions.getEditionsDetailsAndUri([0]);
        expect(res[0][0][0]).to.equal("");
        expect(res[0][0][1].toNumber()).to.equal(5);
        expect(res[0][0][2].toNumber()).to.equal(3);
        expect(res[0][0][3].toNumber()).to.equal(1);
        expect(res[1][0]).to.equal("editionUri");
      });

      it("Minter can mint validly (running variation)", async function () {
        for (let i = 0; i < 2; i++) {
          await expect(editions.mintAmountToRecipient(0, fan1.address, 2))
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, 2 * i + 1)
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, 2 * i + 2);

          expect((await editions.balanceOf(fan1.address)).toNumber()).to.equal((i + 1) * 2);

          for (let j = 1; j <= (i + 1) * 2; j++) {
            expect(await editions.ownerOf(j)).to.equal(fan1.address);
            expect((await editions.getEditionId(j)).toNumber()).to.equal(0);
          }

          expect(
            (await editions.getEditionDetails(0)).map(x => {
              if (typeof x != "string") {
                return x.toNumber();
              } else {
                return x;
              }
            }),
          ).to.eql(["", 5, (i + 1) * 2, 1]);

          const res = await editions.getEditionsDetailsAndUri([0]);
          expect(res[0][0][0]).to.equal("");
          expect(res[0][0][1].toNumber()).to.equal(5);
          expect(res[0][0][2].toNumber()).to.equal((i + 1) * 2);
          expect(res[0][0][3].toNumber()).to.equal(1);
        }
      });
    });

    describe("mintOneToRecipients", function () {
      it("Non minter cannot call", async function () {
        editions = editions.connect(fan1);

        await expect(editions.mintOneToRecipients(0, [fan1.address])).to.be.revertedWithCustomError(
          editions,
          Errors.NotMinter,
        );
      });

      it("Cannot mint on non-existent edition", async function () {
        await expect(editions.mintOneToRecipients(1, [fan1.address])).to.be.revertedWithCustomError(
          editions,
          Errors.EditionDoesNotExist,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(editions.freezeMints())
          .to.emit(editions, "MintsFrozen")
          .to.emit(observability, "MintsFrozen")
          .withArgs(editions.address);

        await expect(editions.mintOneToRecipients(0, [fan1.address])).to.be.revertedWithCustomError(
          editions,
          Errors.MintFrozen,
        );
      });

      it("Cannot mint more than maxSupply, in multiple variations", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address, fan1.address, fan1.address, fan1.address];
        await expect(editions.mintOneToRecipients(0, recipientAddresses)).to.be.revertedWithCustomError(
          editions,
          Errors.SoldOut,
        );

        await expect(editions.mintOneToRecipients(0, recipientAddresses.slice(0, 3)))
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3);

        await expect(editions.mintOneToRecipients(0, recipientAddresses.slice(0, 3))).to.be.revertedWithCustomError(
          editions,
          Errors.SoldOut,
        );
      });

      it("Minter can mint validly (simple variation)", async function () {
        const recipientAddresses = [fan1.address, editionsMetadataOwner.address, editionsOwner.address];
        await expect(editions.mintOneToRecipients(0, recipientAddresses))
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, editionsMetadataOwner.address, 2)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, editionsOwner.address, 3);

        let i = 1;
        for (const recipient of recipientAddresses) {
          expect((await editions.balanceOf(recipient)).toNumber()).to.equal(1);
          expect(await editions.ownerOf(i)).to.equal(recipient);
          expect((await editions.getEditionId(i)).toNumber()).to.equal(0);
          i += 1;
        }

        expect(
          (await editions.getEditionDetails(0)).map(x => {
            if (typeof x != "string") {
              return x.toNumber();
            } else {
              return x;
            }
          }),
        ).to.eql(["", 5, 3, 1]);

        const res = await editions.getEditionsDetailsAndUri([0]);
        expect(res[0][0][0]).to.equal("");
        expect(res[0][0][1].toNumber()).to.equal(5);
        expect(res[0][0][2].toNumber()).to.equal(3);
        expect(res[0][0][3].toNumber()).to.equal(1);
      });

      it("Minter can mint validly (running variation)", async function () {
        const recipientAddresses = [fan1.address, editionsOwner.address];
        for (let i = 0; i < 2; i++) {
          await expect(editions.mintOneToRecipients(0, recipientAddresses))
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i * 2 + 1)
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, editionsOwner.address, i * 2 + 2);

          let j = 1;
          for (const recipient of recipientAddresses) {
            expect((await editions.balanceOf(recipient)).toNumber()).to.equal(i + 1);
            expect(await editions.ownerOf(i * 2 + j)).to.equal(recipient);
            expect((await editions.getEditionId(i * 2 + j)).toNumber()).to.equal(0);
            j += 1;
          }

          expect(
            (await editions.getEditionDetails(0)).map(x => {
              if (typeof x != "string") {
                return x.toNumber();
              } else {
                return x;
              }
            }),
          ).to.eql(["", 5, (i + 1) * 2, 1]);

          const res = await editions.getEditionsDetailsAndUri([0]);
          expect(res[0][0][0]).to.equal("");
          expect(res[0][0][1].toNumber()).to.equal(5);
          expect(res[0][0][2].toNumber()).to.equal((i + 1) * 2);
          expect(res[0][0][3].toNumber()).to.equal(1);
        }
      });
    });

    describe("mintAmountToRecipients", function () {
      it("Non minter cannot call", async function () {
        editions = editions.connect(fan1);

        await expect(editions.mintAmountToRecipients(0, [fan1.address], 2)).to.be.revertedWithCustomError(
          editions,
          Errors.NotMinter,
        );
      });

      it("Cannot mint on non-existent edition", async function () {
        await expect(editions.mintAmountToRecipients(1, [fan1.address], 2)).to.be.revertedWithCustomError(
          editions,
          Errors.EditionDoesNotExist,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(editions.freezeMints()).to.emit(editions, "MintsFrozen");

        await expect(editions.mintAmountToRecipients(0, [fan1.address], 2)).to.be.revertedWithCustomError(
          editions,
          Errors.MintFrozen,
        );
      });

      it("Cannot mint more than maxSupply, in multiple variations", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address];
        await expect(editions.mintAmountToRecipients(0, recipientAddresses, 2)).to.be.revertedWithCustomError(
          editions,
          Errors.SoldOut,
        );

        await expect(editions.mintAmountToRecipients(0, recipientAddresses.slice(0, 2), 2))
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4);

        await expect(
          editions.mintAmountToRecipients(0, recipientAddresses.slice(0, 2), 1),
        ).to.be.revertedWithCustomError(editions, Errors.SoldOut);
      });

      it("Minter can mint validly (simple variation)", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address];
        await expect(editions.mintAmountToRecipients(0, recipientAddresses, 2)).to.be.revertedWithCustomError(
          editions,
          Errors.SoldOut,
        );

        await expect(editions.mintAmountToRecipients(0, recipientAddresses.slice(0, 2), 2))
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4);

        await expect(
          editions.mintAmountToRecipients(0, recipientAddresses.slice(0, 2), 2),
        ).to.be.revertedWithCustomError(editions, Errors.SoldOut);
      });

      it("Minter can mint validly (complex variation) (with multiple editions)", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address];
        await expect(editions.mintAmountToRecipients(0, recipientAddresses, 2)).to.be.revertedWithCustomError(
          editions,
          Errors.SoldOut,
        );

        await expect(editions.mintAmountToRecipients(0, recipientAddresses.slice(0, 2), 2))
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4);

        await expect(editions.createEdition("editionUri", 10, lockedTokenManager.address, zeroRoyalty, "0x"))
          .to.emit(editions, "EditionCreated")
          .withArgs(1, 10, lockedTokenManager.address);

        const recipientAddresses2 = [fan1.address, editionsOwner.address];

        for (let i = 0; i < 2; i++) {
          await expect(editions.mintAmountToRecipients(1, recipientAddresses2, 2))
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i * 4 + 1 + 5)
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i * 4 + 2 + 5)
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, editionsOwner.address, i * 4 + 3 + 5)
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, editionsOwner.address, i * 4 + 4 + 5);

          let j = 0;
          for (const recipient of recipientAddresses2) {
            expect((await editions.balanceOf(recipient)).toNumber()).to.equal((i + 1) * 2 + 4 * (1 - j)); // (1-j) encodes whether it's the fan or not (fan received 4 token prior already)
            expect(await editions.ownerOf(i * 4 + j * 2 + 1 + 5)).to.equal(recipient);
            expect(await editions.ownerOf(i * 4 + j * 2 + 2 + 5)).to.equal(recipient);
            expect((await editions.getEditionId(i * 4 + j * 2 + 1 + 5)).toNumber()).to.equal(1);
            expect((await editions.getEditionId(i * 4 + j * 2 + 2 + 5)).toNumber()).to.equal(1);
            j += 1;
          }

          expect(
            (await editions.getEditionDetails(1)).map(x => {
              if (typeof x != "string") {
                return x.toNumber();
              } else {
                return x;
              }
            }),
          ).to.eql(["", 10, (i + 1) * 4, 6]);

          const res = await editions.getEditionsDetailsAndUri([1]);
          expect(res[0][0][0]).to.equal("");
          expect(res[0][0][1].toNumber()).to.equal(10);
          expect(res[0][0][2].toNumber()).to.equal((i + 1) * 4);
          expect(res[0][0][3].toNumber()).to.equal(6);
        }

        expect((await editions.getEditionStartIds()).map(x => x.toNumber())).to.eql([1, 6]);
      });
    });

    describe("Contract metadata updates", function () {
      it("Owner can change the contract level metadata", async function () {
        editions = editions.connect(editionsOwner);

        await expect(editions.setContractMetadata("new name", "new symbol", "new contract uri"))
          .to.emit(observability, "ContractMetadataSet")
          .withArgs(editions.address, "new name", "new symbol", "new contract uri");

        expect(await editions.name()).to.equal("new name");
        expect(await editions.symbol()).to.equal("new symbol");
        expect(await editions.contractURI()).to.equal("new contract uri");
      });

      it("Non-owners cannot change the contract level metadata", async function () {
        editions = editions.connect(fan1);
        await expect(editions.setContractMetadata("new name", "new symbol", "new contract uri")).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );

        editions = editions.connect(editionsMetadataOwner);
        await expect(editions.setContractMetadata("new name", "new symbol", "new contract uri")).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });
    });
  });

  it("Can deploy with direct mint and create editions with direct mints after", async function () {
    editions = await setupMultipleEditionDFS(
      observability.address,
      editionsImplementation,
      mintManager.address,
      auctionManager.address,
      trustedForwarder.address,
      editionsOwner,
      100,
      "symbol",
      { ...DEFAULT_ONCHAIN_MINT_VECTOR, maxUserClaimableViaVector: 2 },
    );

    expect((await mintManager.getAbridgedVector(1)).slice(0, 14)).to.deep.equal([
      editions.address,
      DEFAULT_ONCHAIN_MINT_VECTOR.startTimestamp,
      DEFAULT_ONCHAIN_MINT_VECTOR.endTimestamp,
      editionsOwner.address,
      DEFAULT_ONCHAIN_MINT_VECTOR.maxTotalClaimableViaVector,
      0,
      ethers.constants.AddressZero,
      DEFAULT_ONCHAIN_MINT_VECTOR.tokenLimitPerTx,
      2,
      DEFAULT_ONCHAIN_MINT_VECTOR.pricePerToken,
      DEFAULT_ONCHAIN_MINT_VECTOR.editionId ?? 0,
      true,
      false,
      DEFAULT_ONCHAIN_MINT_VECTOR.allowlistRoot,
    ]);

    await expect(mintManager.vectorMint721(1, 2, editionsOwner.address, { value: parseEther("0.0008").mul(2) }))
      .to.emit(mintManager, "NumTokenMint")
      .withArgs(ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32), editions.address, true, 2);

    await expect(mintManager.vectorMint721(1, 1, editionsOwner.address)).to.be.revertedWithCustomError(
      mintManager,
      "OnchainVectorMintGuardFailed",
    );

    expect(await mintManager.userClaims(1, editionsOwner.address)).to.equal(2);

    const mintVectorData = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "uint48", "uint48", "uint192", "uint48", "uint48", "uint48", "bytes32"],
      [
        mintManager.address,
        editionsOwner.address,
        DEFAULT_ONCHAIN_MINT_VECTOR.startTimestamp,
        DEFAULT_ONCHAIN_MINT_VECTOR.endTimestamp,
        DEFAULT_ONCHAIN_MINT_VECTOR.pricePerToken,
        DEFAULT_ONCHAIN_MINT_VECTOR.tokenLimitPerTx,
        1,
        DEFAULT_ONCHAIN_MINT_VECTOR.maxUserClaimableViaVector,
        ethers.constants.HashZero,
      ],
    );
    await expect(
      editions.createEdition(
        "editionUri",
        10,
        ethers.constants.AddressZero,
        { recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 0 },
        mintVectorData,
      ),
    )
      .to.emit(editions, "EditionCreated")
      .withArgs(1, 10, ethers.constants.AddressZero)
      .to.emit(mintManager, "EditionVectorCreated")
      .withArgs(2, 1, editions.address);

    await expect(mintManager.vectorMint721(2, 1, editionsOwner.address, { value: parseEther("0.0008") }))
      .to.emit(mintManager, "NumTokenMint")
      .withArgs(ethers.utils.hexZeroPad(ethers.utils.hexlify(2), 32), editions.address, true, 1);

    await expect(mintManager.vectorMint721(2, 1, editionsOwner.address)).to.be.revertedWithCustomError(
      mintManager,
      "OnchainVectorMintGuardFailed",
    );

    expect(await mintManager.userClaims(2, editionsOwner.address)).to.equal(1);
  });
});

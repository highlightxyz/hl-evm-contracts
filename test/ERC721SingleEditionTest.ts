import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ERC721SingleEdition, EditionsMetadataRenderer, MinimalForwarder, MintManager, Observability } from "../types";
import { Errors } from "./__utils__/data";
import { DEFAULT_ONCHAIN_MINT_VECTOR, setupSingleEdition, setupSystem } from "./__utils__/helpers";

describe("ERC721SingleEdition functionality", () => {
  let editions: ERC721SingleEdition;
  let initialPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    editionsOwner: SignerWithAddress,
    fan1: SignerWithAddress;

  let emr: EditionsMetadataRenderer;
  let observability: Observability;
  let mintManager: MintManager;
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
  });

  beforeEach(async () => {
    editions = await setupSingleEdition(
      observability.address,
      singleEditionImplementation,
      mintManager.address,
      trustedForwarder.address,
      emr.address,
      editionsOwner,
      5,
      "name",
      "NM",
    );
  });

  describe("Minting", function () {
    beforeEach(async function () {
      await expect(editions.registerMinter(editionsOwner.address));

      expect(await editions.tokenManager(0)).to.eql(ethers.constants.AddressZero);
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
          expect((await editions.getEditionId(i)).toNumber()).to.equal(0);
          expect(
            (await editions.getEditionDetails(0)).map(x => {
              if (typeof x != "string") {
                return x.toNumber();
              } else {
                return x;
              }
            }),
          ).to.eql(["name", 5, i, 1]);
          const res = await editions.getEditionsDetailsAndUri([0]);
          expect(res[0][0][0]).to.equal("name");
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
        ).to.eql(["name", 5, 3, 1]);

        const res = await editions.getEditionsDetailsAndUri([0]);
        expect(res[0][0][0]).to.equal("name");
        expect(res[0][0][1].toNumber()).to.equal(5);
        expect(res[0][0][2].toNumber()).to.equal(3);
        expect(res[0][0][3].toNumber()).to.equal(1);
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
          ).to.eql(["name", 5, (i + 1) * 2, 1]);

          const res = await editions.getEditionsDetailsAndUri([0]);
          expect(res[0][0][0]).to.equal("name");
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
        await expect(editions.freezeMints()).to.emit(editions, "MintsFrozen");

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
        ).to.eql(["name", 5, 3, 1]);

        const res = await editions.getEditionsDetailsAndUri([0]);
        expect(res[0][0][0]).to.equal("name");
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
          ).to.eql(["name", 5, (i + 1) * 2, 1]);

          const res = await editions.getEditionsDetailsAndUri([0]);
          expect(res[0][0][0]).to.equal("name");
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

      it("Minter can mint validly (complex variation)", async function () {
        editions = await setupSingleEdition(
          observability.address,
          singleEditionImplementation,
          mintManager.address,
          trustedForwarder.address,
          emr.address,
          editionsOwner,
          8,
          "name",
          "NM",
        );
        await expect(editions.registerMinter(editionsOwner.address)).to.emit(editions, "MinterRegistrationChanged");
        const recipientAddresses = [fan1.address, editionsOwner.address];

        for (let i = 0; i < 2; i++) {
          await expect(editions.mintAmountToRecipients(0, recipientAddresses, 2))
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i * 4 + 1)
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i * 4 + 2)
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, editionsOwner.address, i * 4 + 3)
            .to.emit(editions, "Transfer")
            .withArgs(ethers.constants.AddressZero, editionsOwner.address, i * 4 + 4);

          let j = 0;
          for (const recipient of recipientAddresses) {
            expect((await editions.balanceOf(recipient)).toNumber()).to.equal((i + 1) * 2);
            expect(await editions.ownerOf(i * 4 + j * 2 + 1)).to.equal(recipient);
            expect(await editions.ownerOf(i * 4 + j * 2 + 2)).to.equal(recipient);
            expect((await editions.getEditionId(i * 4 + j * 2 + 1)).toNumber()).to.equal(0);
            expect((await editions.getEditionId(i * 4 + j * 2 + 2)).toNumber()).to.equal(0);
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
          ).to.eql(["name", 8, (i + 1) * 4, 1]);

          const res = await editions.getEditionsDetailsAndUri([0]);
          expect(res[0][0][0]).to.equal("name");
          expect(res[0][0][1].toNumber()).to.equal(8);
          expect(res[0][0][2].toNumber()).to.equal((i + 1) * 4);
          expect(res[0][0][3].toNumber()).to.equal(1);
        }
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

  it("Can deploy with direct mint", async function () {
    editions = await setupSingleEdition(
      observability.address,
      singleEditionImplementation,
      mintManager.address,
      trustedForwarder.address,
      emr.address,
      editionsOwner,
      100,
      "name",
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
      0,
      true,
      false,
      DEFAULT_ONCHAIN_MINT_VECTOR.allowlistRoot,
    ]);

    await expect(
      mintManager.vectorMintEdition721(1, 2, editionsOwner.address, {
        value: ethers.utils.parseEther("0.0008").mul(2),
      }),
    )
      .to.emit(mintManager, "NumTokenMint")
      .withArgs(ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32), editions.address, true, 2);

    await expect(mintManager.vectorMintEdition721(1, 1, editionsOwner.address)).to.be.revertedWithCustomError(
      mintManager,
      "OnchainVectorMintGuardFailed",
    );

    expect(await mintManager.userClaims(1, editionsOwner.address)).to.equal(2);
  });
});

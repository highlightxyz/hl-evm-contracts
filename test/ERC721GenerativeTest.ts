import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  ERC721General,
  MinimalForwarder,
  MintManager,
  Observability,
  OwnerOnlyTokenManager,
  TotalLockedTokenManager,
} from "../types";
import { setupGenerative, setupSystem } from "./__utils__/helpers";

describe("ERC721Generative functionality", () => {
  let totalLockedTokenManager: TotalLockedTokenManager;
  let ownerOnlyTokenManager: OwnerOnlyTokenManager;
  let generative: ERC721General;
  let initialPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    owner: SignerWithAddress,
    fan1: SignerWithAddress;

  let mintManager: MintManager;
  let observability: Observability;
  let trustedForwarder: MinimalForwarder;
  let generativeImplementation: string;

  before(async () => {
    [initialPlatformExecutor, mintManagerOwner, editionsMetadataOwner, platformPaymentAddress, owner, fan1] =
      await ethers.getSigners();
    const {
      mintManagerProxy,
      minimalForwarder,
      observability: observabilityInstance,
      generativeImplementationAddress,
    } = await setupSystem(
      platformPaymentAddress.address,
      mintManagerOwner.address,
      initialPlatformExecutor.address,
      editionsMetadataOwner.address,
      owner,
    );

    mintManager = mintManagerProxy;
    trustedForwarder = minimalForwarder;
    observability = observabilityInstance;
    generativeImplementation = generativeImplementationAddress;

    totalLockedTokenManager = await (await ethers.getContractFactory("TotalLockedTokenManager")).deploy();
    ownerOnlyTokenManager = await (await ethers.getContractFactory("OwnerOnlyTokenManager")).deploy();
  });

  beforeEach(async () => {
    generative = await setupGenerative(
      observability.address,
      generativeImplementation,
      trustedForwarder.address,
      mintManager.address,
      owner,
    );
  });

  describe("URIs", function () {
    beforeEach(async () => {
      // mint a couple tokens to validate uris
      await expect(generative.registerMinter(owner.address)).to.emit(generative, "MinterRegistrationChanged");

      await expect(generative.mintSameAmountToMultipleRecipients([owner.address, fan1.address], 2)).to.emit(
        generative,
        "Transfer",
      );
    });

    it("Base uri concatenation should be respected for tokens without overwritten uris", async function () {
      for (let i = 1; i <= 4; i++) {
        expect(await generative.tokenURI(i)).to.equal(`baseUri/${i}`);
      }
    });

    describe("setBaseUri", function () {
      it("Cannot set to empty string", async function () {
        await expect(generative.setBaseURI("")).to.be.revertedWith("Empty string");
      });

      it("If default manager is non-existent, invocation from non-owner fails", async function () {
        generative = generative.connect(fan1);
        await expect(generative.setBaseURI("testing")).to.be.revertedWith("Not owner");
      });

      it("If default manager is non-existent, invocation from owner succeeds", async function () {
        await expect(generative.setBaseURI("testing")).to.emit(generative, "BaseURISet").withArgs("baseUri", "testing");

        for (let i = 1; i <= 4; i++) {
          expect(await generative.tokenURI(i)).to.equal(`testing/${i}`);
        }
      });

      it("If default manager exists, invocation respects token manager", async function () {
        await expect(generative.setDefaultTokenManager(ownerOnlyTokenManager.address)).to.emit(
          generative,
          "DefaultTokenManagerChanged",
        );

        generative = generative.connect(fan1);
        await expect(generative.setBaseURI("testing")).to.be.revertedWith("Can't update base uri");

        generative = generative.connect(owner);
        await expect(generative.setBaseURI("testing")).to.emit(generative, "BaseURISet").withArgs("baseUri", "testing");

        for (let i = 1; i <= 4; i++) {
          expect(await generative.tokenURI(i)).to.equal(`testing/${i}`);
        }
      });
    });

    describe("setTokenUris", function () {
      it("ids and uris length cannot mismatch", async function () {
        await expect(generative.setTokenURIs([1, 2], ["test"])).to.be.revertedWith("Mismatched array lengths");
      });

      it("If token manager is non-existent, invocation from non-owner fails", async function () {
        generative = generative.connect(fan1);
        await expect(generative.setTokenURIs([1, 2], ["testing1", "testing2"])).to.be.revertedWith("Not owner");
      });

      it("If tokens manager is non-existent, invocation owner succeeds", async function () {
        await expect(generative.setTokenURIs([1, 2], ["testing1", "testing2"]))
          .to.emit(generative, "TokenURIsSet")
          .withArgs([1, 2], ["testing1", "testing2"])
          .to.emit(observability, "TokenURIsSet")
          .withArgs(generative.address, [1, 2], ["testing1", "testing2"]);

        for (let i = 1; i <= 2; i++) {
          expect(await generative.tokenURI(i)).to.equal(`testing${i}`);
        }
        for (let i = 3; i <= 4; i++) {
          expect(await generative.tokenURI(i)).to.equal(`baseUri/${i}`);
        }
      });

      it("If token manager exists either as a default or an overwriting token manager, invocation respects token manager", async function () {
        await expect(generative.setDefaultTokenManager(ownerOnlyTokenManager.address)).to.emit(
          generative,
          "DefaultTokenManagerChanged",
        );

        generative = generative.connect(fan1);
        await expect(generative.setTokenURIs([1, 2], ["testing1", "testing2"])).to.be.revertedWith("Can't update");

        generative = generative.connect(owner);

        await expect(generative.setTokenURIs([1, 2], ["testing1", "testing2"]))
          .to.emit(generative, "TokenURIsSet")
          .withArgs([1, 2], ["testing1", "testing2"]);

        for (let i = 1; i <= 2; i++) {
          expect(await generative.tokenURI(i)).to.equal(`testing${i}`);
        }
        for (let i = 3; i <= 4; i++) {
          expect(await generative.tokenURI(i)).to.equal(`baseUri/${i}`);
        }

        await expect(
          generative.setGranularTokenManagers(
            [1, 2],
            [totalLockedTokenManager.address, totalLockedTokenManager.address],
          ),
        ).to.emit(generative, "GranularTokenManagersSet");

        await expect(generative.setTokenURIs([1, 2, 3], ["testing1", "testing2", "testing3"])).to.be.revertedWith(
          "Can't update",
        );

        await expect(generative.setTokenURIs([2, 3], ["testing2", "testing3"])).to.be.revertedWith("Can't update");

        await expect(generative.setTokenURIs([1, 3], ["testing1", "testing3"])).to.be.revertedWith("Can't update");

        await expect(generative.setTokenURIs([3], ["testing3"]))
          .to.emit(generative, "TokenURIsSet")
          .withArgs([3], ["testing3"]);

        for (let i = 1; i <= 3; i++) {
          expect(await generative.tokenURI(i)).to.equal(`testing${i}`);
        }
        expect(await generative.tokenURI(4)).to.equal(`baseUri/4`);
      });
    });
  });

  describe("Minting", function () {
    beforeEach(async function () {
      await expect(generative.registerMinter(owner.address));

      expect(await generative.tokenManager(0)).to.eql(ethers.constants.AddressZero);

      await expect(generative.setLimitSupply(4)).to.emit(generative, "LimitSupplySet").withArgs(4);
    });

    describe("mintOneToOneRecipient", function () {
      it("Non minter cannot call", async function () {
        generative = generative.connect(fan1);

        await expect(generative.mintOneToOneRecipient(fan1.address)).to.be.revertedWith("Not minter");
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(generative.freezeMints()).to.emit(generative, "MintsFrozen");

        await expect(generative.mintOneToOneRecipient(fan1.address)).to.be.revertedWith("Mint frozen");
      });

      it("Can mint validly up until limit supply", async function () {
        for (let i = 1; i <= 4; i++) {
          await expect(generative.mintOneToOneRecipient(fan1.address))
            .to.emit(generative, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i);

          expect(await generative.balanceOf(fan1.address)).to.equal(ethers.BigNumber.from(i));
          expect(await generative.ownerOf(i)).to.equal(fan1.address);
        }

        await expect(generative.mintOneToOneRecipient(fan1.address)).to.be.revertedWith("Over limit supply");

        await expect(generative.setLimitSupply(0)).to.emit(generative, "LimitSupplySet").withArgs(0);

        for (let i = 5; i <= 8; i++) {
          await expect(generative.mintOneToOneRecipient(fan1.address))
            .to.emit(generative, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i);

          expect(await generative.balanceOf(fan1.address)).to.equal(ethers.BigNumber.from(i));
          expect(await generative.ownerOf(i)).to.equal(fan1.address);
        }
      });
    });

    describe("mintAmountToOneRecipient", function () {
      it("Non minter cannot call", async function () {
        generative = generative.connect(fan1);

        await expect(generative.mintAmountToOneRecipient(fan1.address, 2)).to.be.revertedWith("Not minter");
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(generative.freezeMints()).to.emit(generative, "MintsFrozen");

        await expect(generative.mintAmountToOneRecipient(fan1.address, 2)).to.be.revertedWith("Mint frozen");
      });

      it("Cannot mint more than limitSupply, in multiple variations", async function () {
        await expect(generative.mintAmountToOneRecipient(fan1.address, 6)).to.be.revertedWith("Over limit supply");

        await expect(generative.mintAmountToOneRecipient(fan1.address, 3))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3);

        await expect(generative.mintAmountToOneRecipient(fan1.address, 3)).to.be.revertedWith("Over limit supply");

        await expect(generative.setLimitSupply(0)).to.emit(generative, "LimitSupplySet").withArgs(0);

        await expect(generative.mintAmountToOneRecipient(fan1.address, 3))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 5)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 6);
      });

      it("Minter can mint validly (simple variation)", async function () {
        await expect(generative.mintAmountToOneRecipient(fan1.address, 3))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3);

        expect((await generative.balanceOf(fan1.address)).toNumber()).to.equal(3);

        for (let i = 1; i <= 3; i++) {
          expect(await generative.ownerOf(i)).to.equal(fan1.address);
        }
      });

      it("Minter can mint validly (running variation)", async function () {
        for (let i = 0; i < 2; i++) {
          await expect(generative.mintAmountToOneRecipient(fan1.address, 2))
            .to.emit(generative, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, 2 * i + 1)
            .to.emit(generative, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, 2 * i + 2);

          expect((await generative.balanceOf(fan1.address)).toNumber()).to.equal((i + 1) * 2);

          for (let j = 1; j <= (i + 1) * 2; j++) {
            expect(await generative.ownerOf(j)).to.equal(fan1.address);
          }
        }
      });
    });

    describe("mintOneToMultipleRecipients", function () {
      it("Non minter cannot call", async function () {
        generative = generative.connect(fan1);

        await expect(generative.mintOneToMultipleRecipients([fan1.address])).to.be.revertedWith("Not minter");
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(generative.freezeMints()).to.emit(generative, "MintsFrozen");

        await expect(generative.mintOneToMultipleRecipients([fan1.address])).to.be.revertedWith("Mint frozen");
      });

      it("Cannot mint more than limitSupply, in multiple variations", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address, fan1.address, fan1.address, fan1.address];
        await expect(generative.mintOneToMultipleRecipients(recipientAddresses)).to.be.revertedWith(
          "Over limit supply",
        );

        await expect(generative.mintOneToMultipleRecipients(recipientAddresses.slice(3)))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3);

        await expect(generative.mintOneToMultipleRecipients(recipientAddresses.slice(3))).to.be.revertedWith(
          "Over limit supply",
        );

        await expect(generative.setLimitSupply(0)).to.emit(generative, "LimitSupplySet").withArgs(0);

        await expect(generative.mintOneToMultipleRecipients(recipientAddresses.slice(3)))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 5)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 6);
      });

      it("Minter can mint validly (simple variation)", async function () {
        const recipientAddresses = [fan1.address, owner.address, editionsMetadataOwner.address];
        await expect(generative.mintOneToMultipleRecipients(recipientAddresses))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, owner.address, 2)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, editionsMetadataOwner.address, 3);

        let i = 1;
        for (const recipient of recipientAddresses) {
          expect((await generative.balanceOf(recipient)).toNumber()).to.equal(1);
          expect(await generative.ownerOf(i)).to.equal(recipient);
          i += 1;
        }
      });

      it("Minter can mint validly (running variation)", async function () {
        const recipientAddresses = [fan1.address, owner.address];
        for (let i = 0; i < 2; i++) {
          await expect(generative.mintOneToMultipleRecipients(recipientAddresses))
            .to.emit(generative, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i * 2 + 1)
            .to.emit(generative, "Transfer")
            .withArgs(ethers.constants.AddressZero, owner.address, i * 2 + 2);

          let j = 1;
          for (const recipient of recipientAddresses) {
            expect((await generative.balanceOf(recipient)).toNumber()).to.equal(i + 1);
            expect(await generative.ownerOf(i * 2 + j)).to.equal(recipient);
            j += 1;
          }
        }
      });
    });

    describe("mintSameAmountToMultipleRecipients", function () {
      it("Non minter cannot call", async function () {
        generative = generative.connect(fan1);

        await expect(generative.mintSameAmountToMultipleRecipients([fan1.address], 2)).to.be.revertedWith("Not minter");
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(generative.freezeMints()).to.emit(generative, "MintsFrozen");

        await expect(generative.mintSameAmountToMultipleRecipients([fan1.address], 2)).to.be.revertedWith(
          "Mint frozen",
        );
      });

      it("Cannot mint more than limitSupply, in multiple variations", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address];
        await expect(generative.mintSameAmountToMultipleRecipients(recipientAddresses, 2)).to.be.revertedWith(
          "Over limit supply",
        );

        await expect(generative.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 2))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4);

        await expect(generative.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 1)).to.be.revertedWith(
          "Over limit supply",
        );

        await expect(generative.setLimitSupply(0))
          .to.emit(generative, "LimitSupplySet")
          .withArgs(0)
          .to.emit(observability, "LimitSupplySet")
          .withArgs(generative.address, 0);

        await expect(generative.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 2))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 5)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 6)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 7)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 8);
      });

      it("Minter can mint validly (simple variation)", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address];
        await expect(generative.mintSameAmountToMultipleRecipients(recipientAddresses, 2)).to.be.revertedWith(
          "Over limit supply",
        );

        await expect(generative.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 2))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4);

        await expect(generative.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 2)).to.be.revertedWith(
          "Over limit supply",
        );
      });

      it("Minter can mint validly (complex variation)", async function () {
        const recipientAddresses = [fan1.address, owner.address];

        for (let i = 0; i < 2; i++) {
          await expect(generative.mintSameAmountToMultipleRecipients(recipientAddresses, 2))
            .to.emit(generative, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i * 4 + 1)
            .to.emit(generative, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i * 4 + 2)
            .to.emit(generative, "Transfer")
            .withArgs(ethers.constants.AddressZero, owner.address, i * 4 + 3)
            .to.emit(generative, "Transfer")
            .withArgs(ethers.constants.AddressZero, owner.address, i * 4 + 4);

          let j = 0;
          for (const recipient of recipientAddresses) {
            expect((await generative.balanceOf(recipient)).toNumber()).to.equal((i + 1) * 2);
            expect(await generative.ownerOf(i * 4 + j * 2 + 1)).to.equal(recipient);
            expect(await generative.ownerOf(i * 4 + j * 2 + 2)).to.equal(recipient);
            j += 1;
          }

          await expect(generative.setLimitSupply(8)).to.emit(generative, "LimitSupplySet").withArgs(8);
        }
      });
    });

    describe("mintSpecificTokenToOneRecipient", function () {
      it("Non minter cannot call", async function () {
        generative = generative.connect(fan1);

        await expect(generative.mintSpecificTokenToOneRecipient(fan1.address, 1)).to.be.revertedWith("Not minter");
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(generative.freezeMints()).to.emit(generative, "MintsFrozen");

        await expect(generative.mintSpecificTokenToOneRecipient(fan1.address, 2)).to.be.revertedWith("Mint frozen");
      });

      it("Cannot mint token not in range, but can mint in-range ones", async function () {
        await expect(generative.mintSpecificTokenToOneRecipient(fan1.address, 1)).to.emit(generative, "Transfer");
        await expect(generative.mintSpecificTokenToOneRecipient(fan1.address, 2)).to.emit(generative, "Transfer");
        await expect(generative.mintSpecificTokenToOneRecipient(fan1.address, 5)).to.be.revertedWith(
          "Token not in range",
        );
        await expect(generative.mintSpecificTokenToOneRecipient(fan1.address, 3)).to.emit(generative, "Transfer");
        await expect(generative.mintSpecificTokenToOneRecipient(fan1.address, 4)).to.emit(generative, "Transfer");
        await expect(generative.mintSpecificTokenToOneRecipient(fan1.address, 5)).to.be.revertedWith(
          "Token not in range",
        );

        await expect(generative.setLimitSupply(0)).to.emit(generative, "LimitSupplySet").withArgs(0);

        await expect(generative.mintSpecificTokenToOneRecipient(fan1.address, 5)).to.emit(generative, "Transfer");
      });

      it("Cannot mint already minted token", async function () {
        await expect(generative.mintSpecificTokenToOneRecipient(fan1.address, 4)).to.emit(generative, "Transfer");
        await expect(generative.mintSpecificTokenToOneRecipient(fan1.address, 4)).to.be.revertedWith(
          "ERC721: token minted",
        );
      });
    });

    describe("mintSpecificTokensToOneRecipient", function () {
      it("Non minter cannot call", async function () {
        generative = generative.connect(fan1);

        await expect(generative.mintSpecificTokensToOneRecipient(fan1.address, [1, 2])).to.be.revertedWith(
          "Not minter",
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(generative.freezeMints()).to.emit(generative, "MintsFrozen");

        await expect(generative.mintSpecificTokensToOneRecipient(fan1.address, [2])).to.be.revertedWith("Mint frozen");
      });

      it("Cannot mint token not in range, but can mint in-range ones", async function () {
        await expect(generative.mintSpecificTokensToOneRecipient(fan1.address, [1, 4]))
          .to.emit(generative, "Transfer")
          .to.emit(generative, "Transfer");
        await expect(generative.mintSpecificTokensToOneRecipient(fan1.address, [2, 5])).to.be.revertedWith(
          "Token not in range",
        );
        await expect(generative.mintSpecificTokensToOneRecipient(fan1.address, [2, 3]))
          .to.emit(generative, "Transfer")
          .to.emit(generative, "Transfer");

        await expect(generative.setLimitSupply(0)).to.emit(generative, "LimitSupplySet").withArgs(0);

        await expect(generative.mintSpecificTokensToOneRecipient(fan1.address, [6, 19, 20]))
          .to.emit(generative, "Transfer")
          .to.emit(generative, "Transfer")
          .to.emit(generative, "Transfer");
      });

      it("Cannot mint already minted token", async function () {
        await expect(generative.mintSpecificTokensToOneRecipient(fan1.address, [4, 1])).to.emit(generative, "Transfer");
        await expect(generative.mintSpecificTokensToOneRecipient(fan1.address, [2, 1, 3])).to.be.revertedWith(
          "ERC721: token minted",
        );
      });
    });
  });
});

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
import { Errors } from "./__utils__/data";
import { DEFAULT_ONCHAIN_MINT_VECTOR, setupGeneral, setupSystem } from "./__utils__/helpers";

describe("ERC721GeneralSequence functionality", () => {
  let totalLockedTokenManager: TotalLockedTokenManager;
  let ownerOnlyTokenManager: OwnerOnlyTokenManager;
  let general: ERC721General;
  let initialPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    owner: SignerWithAddress,
    fan1: SignerWithAddress;

  let mintManager: MintManager;
  let trustedForwarder: MinimalForwarder;
  let observability: Observability;
  let generalImplementation: string;

  before(async () => {
    [initialPlatformExecutor, mintManagerOwner, editionsMetadataOwner, platformPaymentAddress, owner, fan1] =
      await ethers.getSigners();
    const {
      mintManagerProxy,
      minimalForwarder,
      observability: observabilityInstance,
      generalSequenceImplementationAddress,
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
    generalImplementation = generalSequenceImplementationAddress;

    totalLockedTokenManager = await (await ethers.getContractFactory("TotalLockedTokenManager")).deploy();
    ownerOnlyTokenManager = await (await ethers.getContractFactory("OwnerOnlyTokenManager")).deploy();
  });

  beforeEach(async () => {
    general = await setupGeneral(
      observability.address,
      generalImplementation,
      trustedForwarder.address,
      mintManager.address,
      owner,
    );
  });

  describe("URIs", function () {
    beforeEach(async () => {
      // mint a couple tokens to validate uris
      await expect(general.registerMinter(owner.address)).to.emit(general, "MinterRegistrationChanged");

      await expect(general.mintSameAmountToMultipleRecipients([owner.address, fan1.address], 2)).to.emit(
        general,
        "Transfer",
      );
    });

    it("Base uri concatenation should be respected for tokens without overwritten uris", async function () {
      for (let i = 1; i <= 4; i++) {
        expect(await general.tokenURI(i)).to.equal(`baseUri/${i}`);
      }
    });

    describe("setBaseUri", function () {
      it("Cannot set to empty string", async function () {
        await expect(general.setBaseURI("")).to.be.revertedWithCustomError(general, Errors.EmptyString);
      });

      it("If default manager is non-existent, invocation from non-owner fails", async function () {
        general = general.connect(fan1);
        await expect(general.setBaseURI("testing")).to.be.revertedWithCustomError(general, Errors.Unauthorized);
      });

      it("If default manager is non-existent, invocation from owner succeeds", async function () {
        await expect(general.setBaseURI("testing"))
          .to.emit(general, "BaseURISet")
          .withArgs("baseUri", "testing")
          .to.emit(observability, "BaseUriSet")
          .withArgs(general.address, "testing");

        for (let i = 1; i <= 4; i++) {
          expect(await general.tokenURI(i)).to.equal(`testing/${i}`);
        }
      });

      it("If default manager exists, invocation respects token manager", async function () {
        await expect(general.setDefaultTokenManager(ownerOnlyTokenManager.address)).to.emit(
          general,
          "DefaultTokenManagerChanged",
        );

        general = general.connect(fan1);
        await expect(general.setBaseURI("testing")).to.be.revertedWithCustomError(general, Errors.Unauthorized);

        general = general.connect(owner);
        await expect(general.setBaseURI("testing")).to.emit(general, "BaseURISet").withArgs("baseUri", "testing");

        for (let i = 1; i <= 4; i++) {
          expect(await general.tokenURI(i)).to.equal(`testing/${i}`);
        }
      });
    });

    describe("setTokenUris", function () {
      it("ids and uris length cannot mismatch", async function () {
        await expect(general.setTokenURIs([1, 2], ["test"])).to.be.revertedWithCustomError(
          general,
          Errors.MismatchedArrayLengths,
        );
      });

      it("If token manager is non-existent, invocation from non-owner fails", async function () {
        general = general.connect(fan1);
        await expect(general.setTokenURIs([1, 2], ["testing1", "testing2"])).to.be.revertedWithCustomError(
          general,
          Errors.Unauthorized,
        );
      });

      it("If tokens manager is non-existent, invocation owner succeeds", async function () {
        await expect(general.setTokenURIs([1, 2], ["testing1", "testing2"]))
          .to.emit(general, "TokenURIsSet")
          .withArgs([1, 2], ["testing1", "testing2"]);

        for (let i = 1; i <= 2; i++) {
          expect(await general.tokenURI(i)).to.equal(`testing${i}`);
        }
        for (let i = 3; i <= 4; i++) {
          expect(await general.tokenURI(i)).to.equal(`baseUri/${i}`);
        }
      });

      it("If token manager exists either as a default or an overwriting token manager, invocation respects token manager", async function () {
        await expect(general.setDefaultTokenManager(ownerOnlyTokenManager.address)).to.emit(
          general,
          "DefaultTokenManagerChanged",
        );

        general = general.connect(fan1);
        await expect(general.setTokenURIs([1, 2], ["testing1", "testing2"])).to.be.revertedWithCustomError(
          general,
          Errors.Unauthorized,
        );

        general = general.connect(owner);

        await expect(general.setTokenURIs([1, 2], ["testing1", "testing2"]))
          .to.emit(general, "TokenURIsSet")
          .withArgs([1, 2], ["testing1", "testing2"])
          .to.emit(observability, "TokenURIsSet")
          .withArgs(general.address, [1, 2], ["testing1", "testing2"]);

        for (let i = 1; i <= 2; i++) {
          expect(await general.tokenURI(i)).to.equal(`testing${i}`);
        }
        for (let i = 3; i <= 4; i++) {
          expect(await general.tokenURI(i)).to.equal(`baseUri/${i}`);
        }

        await expect(
          general.setGranularTokenManagers([1, 2], [totalLockedTokenManager.address, totalLockedTokenManager.address]),
        )
          .to.emit(general, "GranularTokenManagersSet")
          .to.emit(observability, "GranularTokenManagersSet");

        await expect(
          general.setTokenURIs([1, 2, 3], ["testing1", "testing2", "testing3"]),
        ).to.be.revertedWithCustomError(general, Errors.Unauthorized);

        await expect(general.setTokenURIs([2, 3], ["testing2", "testing3"])).to.be.revertedWithCustomError(
          general,
          Errors.Unauthorized,
        );

        await expect(general.setTokenURIs([1, 3], ["testing1", "testing3"])).to.be.revertedWithCustomError(
          general,
          Errors.Unauthorized,
        );

        await expect(general.setTokenURIs([3], ["testing3"]))
          .to.emit(general, "TokenURIsSet")
          .withArgs([3], ["testing3"]);

        for (let i = 1; i <= 3; i++) {
          expect(await general.tokenURI(i)).to.equal(`testing${i}`);
        }
        expect(await general.tokenURI(4)).to.equal(`baseUri/4`);
      });
    });
  });

  describe("Minting", function () {
    beforeEach(async function () {
      await expect(general.registerMinter(owner.address));

      expect(await general.tokenManager(0)).to.eql(ethers.constants.AddressZero);

      await expect(general.setLimitSupply(4)).to.emit(general, "LimitSupplySet").withArgs(4);
    });

    describe("mintOneToOneRecipient", function () {
      it("Non minter cannot call", async function () {
        general = general.connect(fan1);

        await expect(general.mintOneToOneRecipient(fan1.address)).to.be.revertedWithCustomError(
          general,
          Errors.NotMinter,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(general.freezeMints()).to.emit(general, "MintsFrozen");

        await expect(general.mintOneToOneRecipient(fan1.address)).to.be.revertedWithCustomError(
          general,
          Errors.MintFrozen,
        );
      });

      it("Can mint validly up until limit supply", async function () {
        for (let i = 1; i <= 4; i++) {
          await expect(general.mintOneToOneRecipient(fan1.address))
            .to.emit(general, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i);

          expect(await general.balanceOf(fan1.address)).to.equal(ethers.BigNumber.from(i));
          expect(await general.ownerOf(i)).to.equal(fan1.address);
        }

        await expect(general.mintOneToOneRecipient(fan1.address)).to.be.revertedWithCustomError(
          general,
          Errors.OverLimitSupply,
        );

        await expect(general.setLimitSupply(0)).to.emit(general, "LimitSupplySet").withArgs(0);

        for (let i = 5; i <= 8; i++) {
          await expect(general.mintOneToOneRecipient(fan1.address))
            .to.emit(general, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i);

          expect(await general.balanceOf(fan1.address)).to.equal(ethers.BigNumber.from(i));
          expect(await general.ownerOf(i)).to.equal(fan1.address);
        }
      });
    });

    describe("mintAmountToOneRecipient", function () {
      it("Non minter cannot call", async function () {
        general = general.connect(fan1);

        await expect(general.mintAmountToOneRecipient(fan1.address, 2)).to.be.revertedWithCustomError(
          general,
          Errors.NotMinter,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(general.freezeMints()).to.emit(general, "MintsFrozen");

        await expect(general.mintAmountToOneRecipient(fan1.address, 2)).to.be.revertedWithCustomError(
          general,
          Errors.MintFrozen,
        );
      });

      it("Cannot mint more than limitSupply, in multiple variations", async function () {
        await expect(general.mintAmountToOneRecipient(fan1.address, 6)).to.be.revertedWithCustomError(
          general,
          Errors.OverLimitSupply,
        );

        await expect(general.mintAmountToOneRecipient(fan1.address, 3))
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3);

        await expect(general.mintAmountToOneRecipient(fan1.address, 3)).to.be.revertedWithCustomError(
          general,
          Errors.OverLimitSupply,
        );

        await expect(general.setLimitSupply(0))
          .to.emit(general, "LimitSupplySet")
          .withArgs(0)
          .to.emit(observability, "LimitSupplySet")
          .withArgs(general.address, 0);

        await expect(general.mintAmountToOneRecipient(fan1.address, 3))
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 5)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 6);
      });

      it("Minter can mint validly (simple variation)", async function () {
        await expect(general.mintAmountToOneRecipient(fan1.address, 3))
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3);

        expect((await general.balanceOf(fan1.address)).toNumber()).to.equal(3);

        for (let i = 1; i <= 3; i++) {
          expect(await general.ownerOf(i)).to.equal(fan1.address);
        }
      });

      it("Minter can mint validly (running variation)", async function () {
        for (let i = 0; i < 2; i++) {
          await expect(general.mintAmountToOneRecipient(fan1.address, 2))
            .to.emit(general, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, 2 * i + 1)
            .to.emit(general, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, 2 * i + 2);

          expect((await general.balanceOf(fan1.address)).toNumber()).to.equal((i + 1) * 2);

          for (let j = 1; j <= (i + 1) * 2; j++) {
            expect(await general.ownerOf(j)).to.equal(fan1.address);
          }
        }
      });
    });

    describe("mintOneToMultipleRecipients", function () {
      it("Non minter cannot call", async function () {
        general = general.connect(fan1);

        await expect(general.mintOneToMultipleRecipients([fan1.address])).to.be.revertedWithCustomError(
          general,
          Errors.NotMinter,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(general.freezeMints()).to.emit(general, "MintsFrozen");

        await expect(general.mintOneToMultipleRecipients([fan1.address])).to.be.revertedWithCustomError(
          general,
          Errors.MintFrozen,
        );
      });

      it("Cannot mint more than limitSupply, in multiple variations", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address, fan1.address, fan1.address, fan1.address];
        await expect(general.mintOneToMultipleRecipients(recipientAddresses)).to.be.revertedWithCustomError(
          general,
          Errors.OverLimitSupply,
        );

        await expect(general.mintOneToMultipleRecipients(recipientAddresses.slice(3)))
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3);

        await expect(general.mintOneToMultipleRecipients(recipientAddresses.slice(3))).to.be.revertedWithCustomError(
          general,
          Errors.OverLimitSupply,
        );

        await expect(general.setLimitSupply(0)).to.emit(general, "LimitSupplySet").withArgs(0);

        await expect(general.mintOneToMultipleRecipients(recipientAddresses.slice(3)))
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 5)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 6);
      });

      it("Minter can mint validly (simple variation)", async function () {
        const recipientAddresses = [fan1.address, owner.address, editionsMetadataOwner.address];
        await expect(general.mintOneToMultipleRecipients(recipientAddresses))
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, owner.address, 2)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, editionsMetadataOwner.address, 3);

        let i = 1;
        for (const recipient of recipientAddresses) {
          expect((await general.balanceOf(recipient)).toNumber()).to.equal(1);
          expect(await general.ownerOf(i)).to.equal(recipient);
          i += 1;
        }
      });

      it("Minter can mint validly (running variation)", async function () {
        const recipientAddresses = [fan1.address, owner.address];
        for (let i = 0; i < 2; i++) {
          await expect(general.mintOneToMultipleRecipients(recipientAddresses))
            .to.emit(general, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i * 2 + 1)
            .to.emit(general, "Transfer")
            .withArgs(ethers.constants.AddressZero, owner.address, i * 2 + 2);

          let j = 1;
          for (const recipient of recipientAddresses) {
            expect((await general.balanceOf(recipient)).toNumber()).to.equal(i + 1);
            expect(await general.ownerOf(i * 2 + j)).to.equal(recipient);
            j += 1;
          }
        }
      });
    });

    describe("mintSameAmountToMultipleRecipients", function () {
      it("Non minter cannot call", async function () {
        general = general.connect(fan1);

        await expect(general.mintSameAmountToMultipleRecipients([fan1.address], 2)).to.be.revertedWithCustomError(
          general,
          Errors.NotMinter,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(general.freezeMints()).to.emit(general, "MintsFrozen");

        await expect(general.mintSameAmountToMultipleRecipients([fan1.address], 2)).to.be.revertedWithCustomError(
          general,
          Errors.MintFrozen,
        );
      });

      it("Cannot mint more than limitSupply, in multiple variations", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address];
        await expect(general.mintSameAmountToMultipleRecipients(recipientAddresses, 2)).to.be.revertedWithCustomError(
          general,
          Errors.OverLimitSupply,
        );

        await expect(general.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 2))
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4);

        await expect(
          general.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 1),
        ).to.be.revertedWithCustomError(general, Errors.OverLimitSupply);

        await expect(general.setLimitSupply(0)).to.emit(general, "LimitSupplySet").withArgs(0);

        await expect(general.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 2))
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 5)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 6)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 7)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 8);
      });

      it("Minter can mint validly (simple variation)", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address];
        await expect(general.mintSameAmountToMultipleRecipients(recipientAddresses, 2)).to.be.revertedWithCustomError(
          general,
          Errors.OverLimitSupply,
        );

        await expect(general.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 2))
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4);

        await expect(
          general.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 2),
        ).to.be.revertedWithCustomError(general, Errors.OverLimitSupply);
      });

      it("Minter can mint validly (complex variation)", async function () {
        const recipientAddresses = [fan1.address, owner.address];

        for (let i = 0; i < 2; i++) {
          await expect(general.mintSameAmountToMultipleRecipients(recipientAddresses, 2))
            .to.emit(general, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i * 4 + 1)
            .to.emit(general, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i * 4 + 2)
            .to.emit(general, "Transfer")
            .withArgs(ethers.constants.AddressZero, owner.address, i * 4 + 3)
            .to.emit(general, "Transfer")
            .withArgs(ethers.constants.AddressZero, owner.address, i * 4 + 4);

          let j = 0;
          for (const recipient of recipientAddresses) {
            expect((await general.balanceOf(recipient)).toNumber()).to.equal((i + 1) * 2);
            expect(await general.ownerOf(i * 4 + j * 2 + 1)).to.equal(recipient);
            expect(await general.ownerOf(i * 4 + j * 2 + 2)).to.equal(recipient);
            j += 1;
          }

          await expect(general.setLimitSupply(8)).to.emit(general, "LimitSupplySet").withArgs(8);
        }
      });
    });

    describe("Contract metadata updates", function () {
      it("Owner can change the contract level metadata", async function () {
        general = general.connect(owner);

        await expect(general.setContractMetadata("new name", "new symbol", "new contract uri"))
          .to.emit(observability, "ContractMetadataSet")
          .withArgs(general.address, "new name", "new symbol", "new contract uri");

        expect(await general.name()).to.equal("new name");
        expect(await general.symbol()).to.equal("new symbol");
        expect(await general.contractURI()).to.equal("new contract uri");
      });

      it("Non-owners cannot change the contract level metadata", async function () {
        general = general.connect(fan1);
        await expect(general.setContractMetadata("new name", "new symbol", "new contract uri")).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );

        general = general.connect(editionsMetadataOwner);
        await expect(general.setContractMetadata("new name", "new symbol", "new contract uri")).to.be.revertedWith(
          "Ownable: caller is not the owner",
        );
      });
    });
  });

  it("Can deploy with direct mint", async function () {
    general = await setupGeneral(
      observability.address,
      generalImplementation,
      trustedForwarder.address,
      mintManager.address,
      owner,
      { ...DEFAULT_ONCHAIN_MINT_VECTOR, maxUserClaimableViaVector: 2 },
    );

    expect((await mintManager.getAbridgedVector(1)).slice(0, 14)).to.deep.equal([
      general.address,
      DEFAULT_ONCHAIN_MINT_VECTOR.startTimestamp,
      DEFAULT_ONCHAIN_MINT_VECTOR.endTimestamp,
      owner.address,
      DEFAULT_ONCHAIN_MINT_VECTOR.maxTotalClaimableViaVector,
      0,
      ethers.constants.AddressZero,
      DEFAULT_ONCHAIN_MINT_VECTOR.tokenLimitPerTx,
      2,
      DEFAULT_ONCHAIN_MINT_VECTOR.pricePerToken,
      0,
      false,
      false,
      DEFAULT_ONCHAIN_MINT_VECTOR.allowlistRoot,
    ]);

    await expect(mintManager.vectorMint721(1, 2, owner.address, { value: ethers.utils.parseEther("0.0008").mul(2) }))
      .to.emit(mintManager, "NumTokenMint")
      .withArgs(ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32), general.address, true, 2);

    await expect(mintManager.vectorMint721(1, 1, owner.address)).to.be.revertedWithCustomError(
      mintManager,
      "OnchainVectorMintGuardFailed",
    );

    expect(await mintManager.userClaims(1, owner.address)).to.equal(2);
  });
});

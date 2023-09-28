import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  ERC721General,
  ERC721GenerativeOnchain,
  ERC721GenerativeOnchain__factory,
  FileDeployer,
  MinimalForwarder,
  MintManager,
  Observability,
  OwnerOnlyTokenManager,
  TotalLockedTokenManager,
} from "../types";
import { Errors } from "./__utils__/data";
import { DEFAULT_ONCHAIN_MINT_VECTOR, setupGenerative, setupSystem } from "./__utils__/helpers";

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
        await expect(generative.setBaseURI("")).to.be.revertedWithCustomError(generative, Errors.EmptyString);
      });

      it("If default manager is non-existent, invocation from non-owner fails", async function () {
        generative = generative.connect(fan1);
        await expect(generative.setBaseURI("testing")).to.be.revertedWithCustomError(generative, Errors.Unauthorized);
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
        await expect(generative.setBaseURI("testing")).to.be.revertedWithCustomError(generative, Errors.Unauthorized);

        generative = generative.connect(owner);
        await expect(generative.setBaseURI("testing")).to.emit(generative, "BaseURISet").withArgs("baseUri", "testing");

        for (let i = 1; i <= 4; i++) {
          expect(await generative.tokenURI(i)).to.equal(`testing/${i}`);
        }
      });
    });

    describe("setTokenUris", function () {
      it("ids and uris length cannot mismatch", async function () {
        await expect(generative.setTokenURIs([1, 2], ["test"])).to.be.revertedWithCustomError(
          generative,
          Errors.MismatchedArrayLengths,
        );
      });

      it("If token manager is non-existent, invocation from non-owner fails", async function () {
        generative = generative.connect(fan1);
        await expect(generative.setTokenURIs([1, 2], ["testing1", "testing2"])).to.be.revertedWithCustomError(
          generative,
          Errors.Unauthorized,
        );
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
        await expect(generative.setTokenURIs([1, 2], ["testing1", "testing2"])).to.be.revertedWithCustomError(
          generative,
          Errors.Unauthorized,
        );

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

        await expect(
          generative.setTokenURIs([1, 2, 3], ["testing1", "testing2", "testing3"]),
        ).to.be.revertedWithCustomError(generative, Errors.Unauthorized);

        await expect(generative.setTokenURIs([2, 3], ["testing2", "testing3"])).to.be.revertedWithCustomError(
          generative,
          Errors.Unauthorized,
        );

        await expect(generative.setTokenURIs([1, 3], ["testing1", "testing3"])).to.be.revertedWithCustomError(
          generative,
          Errors.Unauthorized,
        );

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

        await expect(generative.mintOneToOneRecipient(fan1.address)).to.be.revertedWithCustomError(
          generative,
          Errors.NotMinter,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(generative.freezeMints()).to.emit(generative, "MintsFrozen");

        await expect(generative.mintOneToOneRecipient(fan1.address)).to.be.revertedWithCustomError(
          generative,
          Errors.MintFrozen,
        );
      });

      it("Can mint validly up until limit supply", async function () {
        for (let i = 1; i <= 4; i++) {
          await expect(generative.mintOneToOneRecipient(fan1.address))
            .to.emit(generative, "Transfer")
            .withArgs(ethers.constants.AddressZero, fan1.address, i);

          expect(await generative.balanceOf(fan1.address)).to.equal(ethers.BigNumber.from(i));
          expect(await generative.ownerOf(i)).to.equal(fan1.address);
        }

        await expect(generative.mintOneToOneRecipient(fan1.address)).to.be.revertedWithCustomError(
          generative,
          Errors.OverLimitSupply,
        );

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

        await expect(generative.mintAmountToOneRecipient(fan1.address, 2)).to.be.revertedWithCustomError(
          generative,
          Errors.NotMinter,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(generative.freezeMints()).to.emit(generative, "MintsFrozen");

        await expect(generative.mintAmountToOneRecipient(fan1.address, 2)).to.be.revertedWithCustomError(
          generative,
          Errors.MintFrozen,
        );
      });

      it("Cannot mint more than limitSupply, in multiple variations", async function () {
        await expect(generative.mintAmountToOneRecipient(fan1.address, 6)).to.be.revertedWithCustomError(
          generative,
          Errors.OverLimitSupply,
        );

        await expect(generative.mintAmountToOneRecipient(fan1.address, 3))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3);

        await expect(generative.mintAmountToOneRecipient(fan1.address, 3)).to.be.revertedWithCustomError(
          generative,
          Errors.OverLimitSupply,
        );

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

        await expect(generative.mintOneToMultipleRecipients([fan1.address])).to.be.revertedWithCustomError(
          generative,
          Errors.NotMinter,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(generative.freezeMints()).to.emit(generative, "MintsFrozen");

        await expect(generative.mintOneToMultipleRecipients([fan1.address])).to.be.revertedWithCustomError(
          generative,
          Errors.MintFrozen,
        );
      });

      it("Cannot mint more than limitSupply, in multiple variations", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address, fan1.address, fan1.address, fan1.address];
        await expect(generative.mintOneToMultipleRecipients(recipientAddresses)).to.be.revertedWithCustomError(
          generative,
          Errors.OverLimitSupply,
        );

        await expect(generative.mintOneToMultipleRecipients(recipientAddresses.slice(3)))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3);

        await expect(generative.mintOneToMultipleRecipients(recipientAddresses.slice(3))).to.be.revertedWithCustomError(
          generative,
          Errors.OverLimitSupply,
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

        await expect(generative.mintSameAmountToMultipleRecipients([fan1.address], 2)).to.be.revertedWithCustomError(
          generative,
          Errors.NotMinter,
        );
      });

      it("Cannot mint if mint frozen", async function () {
        await expect(generative.freezeMints()).to.emit(generative, "MintsFrozen");

        await expect(generative.mintSameAmountToMultipleRecipients([fan1.address], 2)).to.be.revertedWithCustomError(
          generative,
          Errors.MintFrozen,
        );
      });

      it("Cannot mint more than limitSupply, in multiple variations", async function () {
        const recipientAddresses = [fan1.address, fan1.address, fan1.address];
        await expect(
          generative.mintSameAmountToMultipleRecipients(recipientAddresses, 2),
        ).to.be.revertedWithCustomError(generative, Errors.OverLimitSupply);

        await expect(generative.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 2))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4);

        await expect(
          generative.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 1),
        ).to.be.revertedWithCustomError(generative, Errors.OverLimitSupply);

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
        await expect(
          generative.mintSameAmountToMultipleRecipients(recipientAddresses, 2),
        ).to.be.revertedWithCustomError(generative, Errors.OverLimitSupply);

        await expect(generative.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 2))
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 1)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 2)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 3)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, fan1.address, 4);

        await expect(
          generative.mintSameAmountToMultipleRecipients(recipientAddresses.slice(1), 2),
        ).to.be.revertedWithCustomError(generative, Errors.OverLimitSupply);
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
  });

  it("Can deploy with direct mint", async function () {
    generative = await setupGenerative(
      observability.address,
      generativeImplementation,
      trustedForwarder.address,
      mintManager.address,
      owner,
      { ...DEFAULT_ONCHAIN_MINT_VECTOR, maxUserClaimableViaVector: 2 },
      false,
      0,
      ethers.constants.AddressZero,
      fan1.address,
      1000,
    );

    expect((await generative.royaltyInfo(1, 10000)).royaltyAmount.toNumber()).to.equal(1000);
    expect((await generative.royaltyInfo(1, 10000)).receiver).to.equal(fan1.address);

    expect((await mintManager.getAbridgedVector(1)).slice(0, 14)).to.deep.equal([
      generative.address,
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

    await expect(
      mintManager.vectorMintSeries721(1, 2, owner.address, { value: ethers.utils.parseEther("0.0008").mul(2) }),
    )
      .to.emit(mintManager, "NumTokenMint")
      .withArgs(ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32), generative.address, true, 2);

    await expect(mintManager.vectorMintSeries721(1, 1, owner.address)).to.be.revertedWithCustomError(
      mintManager,
      "OnchainVectorMintGuardFailed",
    );

    expect(await mintManager.userClaims(1, owner.address)).to.equal(2);
  });

  describe("OCS onchain contracts", function () {
    let ocsERC721: ERC721GenerativeOnchain;
    let fileDeployer: FileDeployer;
    const file = `
      function _readBytecode(
        address pointer,
        uint256 start,
        uint256 size
      ) private view returns (bytes memory data) {
        /// @solidity memory-safe-assembly
        assembly {
            // Get a pointer to some free memory.
            data := mload(0x40)

            // Update the free memory pointer to prevent overriding our data.
            // We use and(x, not(31)) as a cheaper equivalent to sub(x, mod(x, 32)).
            // Adding 31 to size and running the result through the logic above ensures
            // the memory pointer remains word-aligned, following the Solidity convention.
            mstore(0x40, add(data, and(add(add(size, 32), 31), not(31))))

            // Store the size of the data in the first 32 byte chunk of free memory.
            mstore(data, size)

            // Copy the code into memory right after the 32 bytes we used to store the size.
            extcodecopy(pointer, add(data, 32), start, size)
        }
      }
      `;
    const secondFile = `
        function _revert(bytes4 errorSelector) internal pure virtual {
          assembly {
              mstore(0x00, errorSelector)
              revert(0x00, 0x04)
          }
      }
        `;
    const fileAddresses1: string[] = [];
    const fileAddresses2: string[] = [];

    before(async () => {
      // deploy FileDeployer
      const FileDeployer = await ethers.getContractFactory("FileDeployer");
      fileDeployer = await FileDeployer.deploy();
      await fileDeployer.deployed();

      const OCSERC721Implementation = await ethers.getContractFactory("ERC721GenerativeOnchain");
      const ocsERC721Implementation = await OCSERC721Implementation.deploy();
      await ocsERC721Implementation.deployed();

      // deploy instance of ocs721
      ocsERC721 = ERC721GenerativeOnchain__factory.connect(
        (
          await setupGenerative(
            observability.address,
            ocsERC721Implementation.address,
            trustedForwarder.address,
            mintManager.address,
            owner,
          )
        ).address,
        owner,
      );
    });

    it("Can deploy files via the file deployer", async function () {
      const filePart1 = file.slice(0, file.length / 3);
      const filePart2 = file.slice(file.length / 3, (file.length * 2) / 3);
      const filePart3 = file.slice((file.length * 2) / 3);

      const tx1 = await fileDeployer.deploy(
        ["1", "2"].map(name => {
          return ethers.utils.formatBytes32String(name);
        }),
        [filePart1, filePart2],
      );
      const receipt1 = await tx1.wait();
      fileAddresses1.push("0x" + receipt1.logs[0].topics[2].slice(26));
      fileAddresses1.push("0x" + receipt1.logs[1].topics[2].slice(26));

      const tx3 = await fileDeployer.deploy(
        ["3"].map(name => {
          return ethers.utils.formatBytes32String(name);
        }),
        [filePart3],
      );
      const receipt3 = await tx3.wait();
      fileAddresses1.push("0x" + receipt3.logs[0].topics[2].slice(26));

      const secondFilePart1 = secondFile.slice(0, secondFile.length / 2);
      const secondFilePart2 = secondFile.slice(secondFile.length / 2);
      const tx4 = await fileDeployer.deploy(
        ["4"].map(name => {
          return ethers.utils.formatBytes32String(name);
        }),
        [secondFilePart1],
      );
      const receipt4 = await tx4.wait();
      fileAddresses2.push("0x" + receipt4.logs[0].topics[2].slice(26));

      const tx5 = await fileDeployer.deploy(
        ["5"].map(name => {
          return ethers.utils.formatBytes32String(name);
        }),
        [secondFilePart2],
      );
      const receipt5 = await tx5.wait();
      fileAddresses2.push("0x" + receipt5.logs[0].topics[2].slice(26));
    });

    it("Owner can register files and view their contents + bytecode addresses", async function () {
      await expect(ocsERC721.addFile("readBytecodeSnippet.sol", fileAddresses1)).to.not.be.reverted;
      await expect(ocsERC721.addFile("revertSnippet.sol", fileAddresses2)).to.not.be.reverted;

      expect(await ocsERC721.files()).to.eql(["readBytecodeSnippet.sol", "revertSnippet.sol"]);
      expect((await ocsERC721.fileStorage("readBytecodeSnippet.sol")).map(address => address.toLowerCase())).to.eql(
        fileAddresses1.map(address => address.toLowerCase()),
      );
      expect((await ocsERC721.fileStorage("revertSnippet.sol")).map(address => address.toLowerCase())).to.eql(
        fileAddresses2.map(address => address.toLowerCase()),
      );

      // viewing contents
      expect(await ocsERC721.fileContents("readBytecodeSnippet.sol")).to.eql(file);
      expect(await ocsERC721.fileContents("revertSnippet.sol")).to.eql(secondFile);
    });

    it("Cannot register an already registered file", async function () {
      await expect(ocsERC721.addFile("readBytecodeSnippet.sol", fileAddresses1)).to.be.revertedWithCustomError(
        ocsERC721,
        "FileAlreadyRegistered",
      );
    });

    it("Non-owner cannot register a file", async function () {
      ocsERC721 = ocsERC721.connect(fan1);
      await expect(ocsERC721.addFile("readBytecodeSnippet3.sol", fileAddresses1)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      ocsERC721 = ocsERC721.connect(owner);
    });

    it("Cannot remove a non-registered file", async function () {
      await expect(ocsERC721.removeFile("readBytecodeSnippet3.sol")).to.be.revertedWithCustomError(
        ocsERC721,
        "FileNotRegistered",
      );
    });

    it("Non-owner cannot remove a file", async function () {
      ocsERC721 = ocsERC721.connect(fan1);
      await expect(ocsERC721.removeFile("readBytecodeSnippet.sol")).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      ocsERC721 = ocsERC721.connect(owner);
    });

    it("Owner can remove a file in any position", async function () {
      await expect(ocsERC721.addFile("readBytecodeSnippet2.sol", fileAddresses1)).to.not.be.reverted;
      expect(await ocsERC721.files()).to.eql([
        "readBytecodeSnippet.sol",
        "revertSnippet.sol",
        "readBytecodeSnippet2.sol",
      ]);

      await expect(ocsERC721.removeFile("readBytecodeSnippet.sol")).to.not.be.reverted;
      expect(await ocsERC721.files()).to.eql(["revertSnippet.sol", "readBytecodeSnippet2.sol"]);

      await expect(ocsERC721.removeFile("readBytecodeSnippet2.sol")).to.not.be.reverted;
      expect(await ocsERC721.files()).to.eql(["revertSnippet.sol"]);

      await expect(ocsERC721.addFile("readBytecodeSnippet.sol", fileAddresses1)).to.not.be.reverted;
      await expect(ocsERC721.addFile("readBytecodeSnippet2.sol", fileAddresses1)).to.not.be.reverted;
      expect(await ocsERC721.files()).to.eql([
        "revertSnippet.sol",
        "readBytecodeSnippet.sol",
        "readBytecodeSnippet2.sol",
      ]);

      await expect(ocsERC721.removeFile("readBytecodeSnippet.sol")).to.not.be.reverted;
      expect(await ocsERC721.files()).to.eql(["revertSnippet.sol", "readBytecodeSnippet2.sol"]);
    });
  });
});

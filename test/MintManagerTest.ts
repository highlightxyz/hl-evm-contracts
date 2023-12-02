import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  AuctionManager,
  ERC721Editions,
  ERC721EditionsDFS,
  ERC721General,
  ERC721GeneralSequence,
  ERC721GeneralSequence__factory,
  ERC721Generative,
  ERC721SingleEdition,
  ERC721SingleEditionDFS,
  EditionsMetadataRenderer,
  MinimalForwarder,
  MintManager,
  MintManager__factory,
  Observability,
} from "../types";
import { SAMPLE_ABRIDGED_VECTOR, SAMPLE_ABRIDGED_VECTOR_UPDATE_CONFIG } from "./__utils__/data";
import { Errors } from "./__utils__/data";
import {
  generateClaim,
  generateClaimWithMetaTxPackets,
  generateSeriesClaim,
  setupEditionsDFS,
  setupGeneral,
  setupGenerative,
  setupMultipleEdition,
  setupSingleEdition,
  setupSingleEditionDFS,
  setupSystem,
} from "./__utils__/helpers";
import { getExpiredClaimTimestamp, getValidClaimTimestamp } from "./__utils__/mint";

describe("Mint Manager", () => {
  let initialPlatformExecutor: SignerWithAddress,
    additionalPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    eWETHOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    editionsOwner: SignerWithAddress,
    generalOwner: SignerWithAddress,
    fan1: SignerWithAddress,
    randomEOA: SignerWithAddress;

  let emr: EditionsMetadataRenderer;
  let observability: Observability;
  let mintManager: MintManager;
  let auctionManager: AuctionManager;
  let trustedForwarder: MinimalForwarder;
  let editionsImplementation: string;
  let singleEditionImplementation: string;
  let singleEditionDFSImplementation: string;
  let generalImplementation: string;
  let generalSequenceImplementation: string;
  let generativeImplementation: string;
  let editionsDFSImplementation: string;

  const mintFeeWei = ethers.BigNumber.from("800000000000000");

  before(async () => {
    [
      initialPlatformExecutor,
      additionalPlatformExecutor,
      mintManagerOwner,
      editionsMetadataOwner,
      eWETHOwner,
      platformPaymentAddress,
      editionsOwner,
      generalOwner,
      fan1,
      randomEOA,
    ] = await ethers.getSigners();
  });

  describe("Platform Executor", function () {
    it("Should be able to add a new platform executor as Owner", async () => {
      const {
        emrProxy,
        mintManagerProxy,
        minimalForwarder,
        auctionManagerProxy,
        observability: observabilityInstance,
        editionsImplementationAddress,
        singleEditionImplementationAddress,
        generalImplementationAddress,
        generalSequenceImplementationAddress,
        generativeImplementationAddress,
        singleEditionDFSImplementationAddress,
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
      auctionManager = auctionManagerProxy;
      observability = observabilityInstance;
      emr = emrProxy;
      editionsImplementation = editionsImplementationAddress;
      editionsDFSImplementation = editionsDFSImplementationAddress;
      singleEditionImplementation = singleEditionImplementationAddress;
      generalImplementation = generalImplementationAddress;
      generalSequenceImplementation = generalSequenceImplementationAddress;
      generativeImplementation = generativeImplementationAddress;
      singleEditionDFSImplementation = singleEditionDFSImplementationAddress;

      const mintManagerOwnerBased = mintManager.connect(mintManagerOwner);

      await expect(mintManagerOwnerBased.addOrDeprecatePlatformExecutor(additionalPlatformExecutor.address)).to.not.be
        .reverted;
      expect(await mintManagerOwnerBased.isPlatformExecutor(additionalPlatformExecutor.address)).to.be.true;
    });
    it("Should be able to deprecate platform executor as Owner", async () => {
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
        mintManagerOwner,
      );
      mintManager = mintManagerProxy;
      trustedForwarder = minimalForwarder;
      auctionManager = auctionManagerProxy;
      observability = observabilityInstance;
      emr = emrProxy;
      editionsImplementation = editionsImplementationAddress;
      singleEditionImplementation = singleEditionImplementationAddress;
      generalImplementation = generalImplementationAddress;

      //Add platform executor
      await expect(mintManager.addOrDeprecatePlatformExecutor(additionalPlatformExecutor.address)).to.not.be.reverted;
      expect(await mintManager.isPlatformExecutor(additionalPlatformExecutor.address)).to.be.true;

      //deprecate platform executor
      await expect(mintManager.addOrDeprecatePlatformExecutor(additionalPlatformExecutor.address)).to.not.be.reverted;
      expect(await mintManager.isPlatformExecutor(additionalPlatformExecutor.address)).to.be.false;
    });
    it("Should not be able to add Zero address as platform executor", async () => {
      const {
        emrProxy,
        mintManagerProxy,
        minimalForwarder,
        auctionManagerProxy,
        editionsImplementationAddress,
        observability: observabilityInstance,
        singleEditionImplementationAddress,
        generalImplementationAddress,
      } = await setupSystem(
        platformPaymentAddress.address,
        mintManagerOwner.address,
        initialPlatformExecutor.address,
        editionsMetadataOwner.address,
        mintManagerOwner,
      );
      mintManager = mintManagerProxy;
      trustedForwarder = minimalForwarder;
      auctionManager = auctionManagerProxy;
      observability = observabilityInstance;
      emr = emrProxy;
      editionsImplementation = editionsImplementationAddress;
      singleEditionImplementation = singleEditionImplementationAddress;
      generalImplementation = generalImplementationAddress;
      await expect(
        mintManager.addOrDeprecatePlatformExecutor(ethers.constants.AddressZero),
      ).to.be.revertedWithCustomError(mintManager, Errors.InvalidExecutorChanged);
      expect(await mintManager.isPlatformExecutor(ethers.constants.AddressZero)).to.be.false;
    });
    it("Should not be able to add a platform executor that already exists", async () => {
      const {
        emrProxy,
        mintManagerProxy,
        minimalForwarder,
        auctionManagerProxy,
        editionsImplementationAddress,
        singleEditionImplementationAddress,
        generalImplementationAddress,
      } = await setupSystem(
        platformPaymentAddress.address,
        mintManagerOwner.address,
        initialPlatformExecutor.address,
        editionsMetadataOwner.address,
        mintManagerOwner,
      );
      mintManager = mintManagerProxy;
      trustedForwarder = minimalForwarder;
      auctionManager = auctionManagerProxy;
      emr = emrProxy;
      editionsImplementation = editionsImplementationAddress;
      singleEditionImplementation = singleEditionImplementationAddress;
      generalImplementation = generalImplementationAddress;
      await expect(mintManager.addOrDeprecatePlatformExecutor(additionalPlatformExecutor.address)).to.not.be.reverted;
      expect(await mintManager.isPlatformExecutor(additionalPlatformExecutor.address)).to.be.true;
    });
    it("Should reject all platform executor changes from non owner", async () => {
      const {
        emrProxy,
        mintManagerProxy,
        minimalForwarder,
        auctionManagerProxy,
        editionsImplementationAddress,
        singleEditionImplementationAddress,
        generalImplementationAddress,
      } = await setupSystem(
        platformPaymentAddress.address,
        mintManagerOwner.address,
        initialPlatformExecutor.address,
        editionsMetadataOwner.address,
        mintManagerOwner,
      );
      mintManager = mintManagerProxy;
      trustedForwarder = minimalForwarder;
      auctionManager = auctionManagerProxy;
      emr = emrProxy;
      editionsImplementation = editionsImplementationAddress;
      singleEditionImplementation = singleEditionImplementationAddress;
      generalImplementation = generalImplementationAddress;
      const mintManagerForFan1 = await mintManager.connect(fan1);

      //Add/deprecate
      await expect(
        mintManagerForFan1.addOrDeprecatePlatformExecutor(additionalPlatformExecutor.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
      expect(await mintManager.isPlatformExecutor(additionalPlatformExecutor.address)).be.false;
    });
  });

  describe("Off-Chain Claims", function () {
    let singleEdition: ERC721SingleEdition;
    before(async () => {
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
        mintManagerOwner,
      );
      mintManager = mintManagerProxy;
      trustedForwarder = minimalForwarder;
      auctionManager = auctionManagerProxy;
      observability = observabilityInstance;
      emr = emrProxy;
      editionsImplementation = editionsImplementationAddress;
      singleEditionImplementation = singleEditionImplementationAddress;
      generalImplementation = generalImplementationAddress;
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
      );
    });

    it("Should return true for valid claim", async function () {
      const { signature, claim } = await generateClaim(
        initialPlatformExecutor,
        mintManager.address,
        singleEdition.address,
        fan1.address,
        editionsOwner.address,
      );
      expect(await mintManager.verifyClaim(claim, signature, fan1.address)).to.be.true;
    });
    it("should return false for expired timestamp claim", async function () {
      const { signature, claim } = await generateClaim(
        initialPlatformExecutor,
        mintManager.address,
        singleEdition.address,
        fan1.address,
        editionsOwner.address,
        getExpiredClaimTimestamp(),
      );
      expect(await mintManager.verifyClaim(claim, signature, fan1.address)).to.be.false;
    });
    it("Should return false if not PlatformExecutor", async function () {
      const { signature, claim } = await generateClaim(
        randomEOA,
        mintManager.address,
        singleEdition.address,
        fan1.address,
        editionsOwner.address,
      );
      expect(await mintManager.verifyClaim(claim, signature, fan1.address)).to.be.false;
    });
    it("Should return false if maxPerVector reached", async function () {
      const { signature, claim } = await generateClaim(
        initialPlatformExecutor,
        mintManager.address,
        singleEdition.address,
        fan1.address,
        editionsOwner.address,
        getValidClaimTimestamp(),
        "0",
        1,
        1,
      );
      expect(await mintManager.verifyClaim(claim, signature, fan1.address)).to.be.true;
      const mintManagerForFan1 = mintManager.connect(fan1);
      const tx = await mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
        value: mintFeeWei.mul(claim.numTokensToMint),
      });
      await tx.wait();
      const { signature: signature2, claim: claim2 } = await generateClaim(
        initialPlatformExecutor,
        mintManagerForFan1.address,
        singleEdition.address,
        fan1.address,
        editionsOwner.address,
        getValidClaimTimestamp(),
        "0",
        1,
        1,
      );
      expect(await mintManagerForFan1.verifyClaim(claim2, signature2, fan1.address)).to.be.false;
    });
    it("Should return false if maxPerUser reached", async function () {
      const offChainVectorId = "maxPerUserTestVectorId";
      const { signature, claim } = await generateClaim(
        initialPlatformExecutor,
        mintManager.address,
        singleEdition.address,
        fan1.address,
        editionsOwner.address,
        getValidClaimTimestamp(),
        "0",
        1,
        0,
        1,
        0,
        offChainVectorId,
        "maxPerUserClaimNonce",
      );
      expect(await mintManager.verifyClaim(claim, signature, fan1.address)).to.be.true;
      const mintManagerForFan1 = mintManager.connect(fan1);
      const tx = await mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
        value: mintFeeWei.mul(claim.numTokensToMint),
      });
      await tx.wait();
      const { signature: signature2, claim: claim2 } = await generateClaim(
        initialPlatformExecutor,
        mintManager.address,
        singleEdition.address,
        fan1.address,
        editionsOwner.address,
        getValidClaimTimestamp(),
        "0",
        1,
        0,
        1,
        0,
        offChainVectorId,
        "maxPerUserClaimNonce1",
      );
      expect(await mintManager.verifyClaim(claim2, signature2, fan1.address)).to.be.false;
    });
    it("Should return false if claimNonce already used", async function () {
      const claimNonce = "claimNonceUsedClaimNonce";
      const offChainVectorId = "claimNonceUsedVectorId";
      const { signature, claim } = await generateClaim(
        initialPlatformExecutor,
        mintManager.address,
        singleEdition.address,
        fan1.address,
        editionsOwner.address,
        getValidClaimTimestamp(),
        "0",
        1,
        0,
        0,
        0,
        offChainVectorId,
        claimNonce,
      );
      expect(await mintManager.verifyClaim(claim, signature, fan1.address)).to.be.true;
      const mintManagerForFan1 = mintManager.connect(fan1);
      const tx = await mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
        value: mintFeeWei.mul(claim.numTokensToMint),
      });
      await tx.wait();
      const { signature: signature2, claim: claim2 } = await generateClaim(
        initialPlatformExecutor,
        mintManager.address,
        singleEdition.address,
        fan1.address,
        editionsOwner.address,
        getValidClaimTimestamp(),
        "0",
        1,
        0,
        0,
        0,
        offChainVectorId,
        claimNonce,
      );
      expect(await mintManager.verifyClaim(claim2, signature2, fan1.address)).to.be.false;
    });
  });

  describe("Gated Mints", function () {
    async function deployMetaTxnFixture() {
      const maticWETHFactory = await ethers.getContractFactory("MaticWETH", fan1);
      const maticWETH = await maticWETHFactory.deploy(initialPlatformExecutor.address);
      await maticWETH.deployed();

      const eWETHFactory = await ethers.getContractFactory("EthereumWETH", eWETHOwner);
      const eWETH = await eWETHFactory.deploy();
      await eWETH.deployed();

      const tx = await eWETH.mint(fan1.address, 100);
      await tx.wait();

      return { eWETH, maticWETH };
    }
    describe("General721", function () {
      let general: ERC721General;
      const offChainVectorId = "gatedMintGeneral721VectorId";
      const offchainVectorId2 = "gatedMintGeneral721VectorId2";
      const maxPerVector = 10;
      const maxPerUser = 10;
      before(async () => {
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
          mintManagerOwner,
        );
        mintManager = mintManagerProxy;
        trustedForwarder = minimalForwarder;
        auctionManager = auctionManagerProxy;
        emr = emrProxy;
        observability = observabilityInstance;
        editionsImplementation = editionsImplementationAddress;
        singleEditionImplementation = singleEditionImplementationAddress;
        generalImplementation = generalImplementationAddress;
        general = await setupGeneral(
          observability.address,
          generalImplementation,
          trustedForwarder.address,
          mintManager.address,
          generalOwner,
          null,
          null,
          false,
          false,
          0,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          0,
          "Test 1",
          "T1",
        );
      });
      it("Should be able to mint one to one recipient", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonce1";
        const { signature, claim } = await generateClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          getValidClaimTimestamp(),
          "0",
          1,
          maxPerVector,
          maxPerUser,
          0,
          offChainVectorId,
          claimNonce,
        );
        const mintManagerForFan1 = mintManager.connect(fan1);
        await expect(mintManagerForFan1.gatedSeriesMint(claim, signature, fan1.address)).to.be.revertedWithCustomError(
          mintManager,
          Errors.MintFeeTooLow,
        );
        await expect(
          mintManagerForFan1.gatedSeriesMint(claim, signature, fan1.address, {
            value: mintFeeWei.mul(claim.numTokensToMint),
          }),
        ).to.emit(general, "Transfer");
      });

      it("User limit is based on claimer address, and others can ferry mints", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonceA";
        const { signature, claim } = await generateClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          getValidClaimTimestamp(),
          "0",
          1,
          maxPerVector,
          1,
          0,
          offchainVectorId2,
          claimNonce,
        );
        const mintManagerNotForFan = mintManager.connect(generalOwner);
        await expect(
          mintManagerNotForFan.gatedSeriesMint(claim, signature, fan1.address, {
            value: mintFeeWei.mul(claim.numTokensToMint),
          }),
        ).to.emit(general, "Transfer");

        const claimNonce2 = "gatedMintGeneral721ClaimNonceB";
        const { signature: signature2, claim: claim2 } = await generateClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          getValidClaimTimestamp(),
          "0",
          1,
          maxPerVector,
          1,
          0,
          offchainVectorId2,
          claimNonce2,
        );
        const mintManagerForFan = mintManager.connect(fan1);
        await expect(
          mintManagerForFan.gatedSeriesMint(claim2, signature2, fan1.address, {
            value: mintFeeWei.mul(claim.numTokensToMint),
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidClaim);
      });

      it("Cannot mint with an unsafe mint recipient (tx not sent by claimer and to a recipient that's not the claimer)", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonceC";
        const { signature, claim } = await generateClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          getValidClaimTimestamp(),
          "0",
          1,
          maxPerVector,
          maxPerUser,
          0,
          offChainVectorId,
          claimNonce,
        );
        const mintManagerNotForFan = mintManager.connect(generalOwner);
        await expect(
          mintManagerNotForFan.gatedSeriesMint(claim, signature, generalOwner.address, {
            value: mintFeeWei.mul(claim.numTokensToMint),
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.UnsafeMintRecipient);
      });

      it("Should be able to mint multiple to one recipient", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonce2";
        const { signature, claim } = await generateClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          getValidClaimTimestamp(),
          "0.01",
          9,
          maxPerVector,
          maxPerUser,
          0,
          offChainVectorId,
          claimNonce,
        );
        const mintManagerForFan1 = mintManager.connect(fan1);
        await expect(
          mintManagerForFan1.gatedSeriesMint(claim, signature, fan1.address, {
            value: mintFeeWei.mul(claim.numTokensToMint),
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
        await expect(
          mintManagerForFan1.gatedSeriesMint(claim, signature, fan1.address, {
            value: ethers.utils.parseEther("0.09"),
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
        await expect(mintManagerForFan1.gatedSeriesMint(claim, signature, fan1.address)).to.be.revertedWithCustomError(
          mintManager,
          Errors.InvalidPaymentAmount,
        );
        await expect(
          mintManagerForFan1.gatedSeriesMint(claim, signature, fan1.address, {
            value: mintFeeWei.mul(claim.numTokensToMint).add(ethers.utils.parseEther("0.09")),
          }),
        ).to.emit(general, "Transfer");
      });
    });
    describe("General721 Series claims (choose token)", function () {
      let general: ERC721General;
      const offChainVectorId = "gatedSeriesMintVectorId";
      const maxPerVector = 10;
      const maxPerUser = 10;
      before(async () => {
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
          mintManagerOwner,
        );
        mintManager = mintManagerProxy;
        trustedForwarder = minimalForwarder;
        auctionManager = auctionManagerProxy;
        emr = emrProxy;
        observability = observabilityInstance;
        editionsImplementation = editionsImplementationAddress;
        singleEditionImplementation = singleEditionImplementationAddress;
        generalImplementation = generalImplementationAddress;
        general = await setupGeneral(
          observability.address,
          generalImplementation,
          trustedForwarder.address,
          mintManager.address,
          generalOwner,
          null,
          null,
          false,
          false,
          10,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          0,
          "Test 1",
          "T1",
        );
      });
      it("Should be able to mint a chosen token to a recipient", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonce1";
        const { signature, claim } = await generateSeriesClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          1,
          getValidClaimTimestamp(),
          "0",
          maxPerVector,
          maxPerUser,
          offChainVectorId,
          claimNonce,
        );
        // expect(await mintManager.verifySeriesClaim(claim, signature, fan1.address, [1])).to.be.true;
        const mintManagerForFan1 = mintManager.connect(fan1);
        await expect(
          mintManagerForFan1.gatedSeriesMintChooseToken(claim, signature, fan1.address, [1]),
        ).to.be.revertedWithCustomError(mintManager, Errors.MintFeeTooLow);
        await expect(
          mintManagerForFan1.gatedSeriesMintChooseToken(claim, signature, fan1.address, [1], { value: mintFeeWei }),
        ).to.emit(general, "Transfer");
      });
      it("Should be able to mint multiple chosen tokens to one recipient", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonce2";
        const { signature, claim } = await generateSeriesClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          2,
          getValidClaimTimestamp(),
          "0.01",
          maxPerVector,
          maxPerUser,
          offChainVectorId,
          claimNonce,
        );
        const mintManagerForFan1 = mintManager.connect(fan1);
        await expect(
          mintManagerForFan1.gatedSeriesMintChooseToken(claim, signature, fan1.address, [2, 3], {
            value: mintFeeWei.mul(2),
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
        await expect(
          mintManagerForFan1.gatedSeriesMintChooseToken(claim, signature, fan1.address, [2, 3], {
            value: ethers.utils.parseEther("0.02"),
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
        await expect(
          mintManagerForFan1.gatedSeriesMintChooseToken(claim, signature, fan1.address, [2, 3]),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
        await expect(
          mintManagerForFan1.gatedSeriesMintChooseToken(claim, signature, fan1.address, [2, 3], {
            value: mintFeeWei.mul(2).add(ethers.utils.parseEther("0.02")),
          }),
        ).to.emit(general, "Transfer");
      });

      it("Should not be able to mint chosen token that's already minted", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonce3";
        const { signature, claim } = await generateSeriesClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          2,
          getValidClaimTimestamp(),
          "0",
          maxPerVector,
          maxPerUser,
          offChainVectorId,
          claimNonce,
        );
        const mintManagerForFan1 = mintManager.connect(fan1);
        // expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4, 2])).to.be.false;
        await expect(
          mintManagerForFan1.gatedSeriesMintChooseToken(claim, signature, fan1.address, [4, 2], {
            value: mintFeeWei.mul(2),
          }),
        ).to.be.revertedWith("ERC721: token minted");
      });

      /*
      it("Invalid claim signer should fail", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonce4";
        const { signature, claim } = await generateSeriesClaim(
          generalOwner,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          2,
          getValidClaimTimestamp(),
          "0",
          maxPerVector,
          maxPerUser,
          offChainVectorId,
          claimNonce,
        );
        const mintManagerForFan1 = mintManager.connect(fan1);
        // expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4])).to.be.false;
      });

      it("Hitting the max per user limit should fail", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonce5";
        const { signature, claim } = await generateSeriesClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          3,
          getValidClaimTimestamp(),
          "0",
          maxPerVector,
          4,
          offChainVectorId,
          claimNonce,
        );
        const mintManagerForFan1 = mintManager.connect(fan1);
        // expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4, 5])).to.be.false;
      });

      it("Hitting the max per vector limit should fail", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonce6";
        const { signature, claim } = await generateSeriesClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          5,
          getValidClaimTimestamp(),
          "0",
          4,
          maxPerUser,
          offChainVectorId,
          claimNonce,
        );
        const mintManagerForFan1 = mintManager.connect(fan1);
        // expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4, 5])).to.be.false;
      });

      it("Expired claim should fail", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonce7";
        const { signature, claim } = await generateSeriesClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          1,
          "100",
          "0",
          maxPerVector,
          maxPerUser,
          offChainVectorId,
          claimNonce,
        );
        const mintManagerForFan1 = mintManager.connect(fan1);
        // expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4])).to.be.false;
      });

      it("Claim with taken nonce should fail", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonce1";
        const { signature, claim } = await generateSeriesClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          1,
          getValidClaimTimestamp(),
          "0",
          maxPerVector,
          maxPerUser,
          offChainVectorId,
          claimNonce,
        );
        const mintManagerForFan1 = mintManager.connect(fan1);
        // expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4])).to.be.false;
      });
      it("Cannot mint more tokens than the maxPerTxn", async function () {
        const claimNonce = "gatedMintGeneral721ClaimNonce9";
        const { signature, claim } = await generateSeriesClaim(
          initialPlatformExecutor,
          mintManager.address,
          general.address,
          fan1.address,
          generalOwner.address,
          0,
          getValidClaimTimestamp(),
          "0",
          maxPerVector,
          maxPerUser,
          offChainVectorId,
          claimNonce,
        );
        const mintManagerForFan1 = mintManager.connect(fan1);
        // expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4])).to.be.false;
      });
      */
    });
    describe("Edition721", function () {
      describe("Single Edition", function () {
        let singleEdition: ERC721SingleEdition, mintManager: MintManager;
        const offChainVectorId = "gatedMintEditions721VectorId";
        const maxPerVector = 10;
        const maxPerUser = 10;
        const editionSize = 10;

        async function deploySingleEditionFixture() {
          //Deploy Minimal Forwarder
          const minimalForwarderFactory = await ethers.getContractFactory("MinimalForwarder");
          const minimalForwarder = await minimalForwarderFactory.deploy();
          await minimalForwarder.deployed();

          //Deploy Mint Manager
          const mintManagerFactory = await ethers.getContractFactory("MintManager");
          const mintManager = await mintManagerFactory.deploy();
          await mintManager.deployed();
          const encodedFn = mintManager.interface.encodeFunctionData("initialize", [
            platformPaymentAddress.address,
            mintManagerOwner.address,
            minimalForwarder.address,
            initialPlatformExecutor.address,
            mintFeeWei,
          ]);

          const mintManagerProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
          const mintManagerProxy = await mintManagerProxyFactory.deploy(mintManager.address, encodedFn);
          await mintManagerProxy.deployed();

          // deploy AuctionManager
          const auctionManagerFactory = await ethers.getContractFactory("AuctionManager");
          const auctionManager = await auctionManagerFactory.deploy();
          await auctionManager.deployed();
          const amEncodedFn = auctionManager.interface.encodeFunctionData("initialize", [
            platformPaymentAddress.address,
            minimalForwarder.address,
            mintManagerOwner.address,
            initialPlatformExecutor.address,
          ]);

          const auctionManagerProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
          const auctionManagerProxy = await auctionManagerProxyFactory.deploy(auctionManager.address, amEncodedFn);
          await auctionManagerProxy.deployed();

          //Deploy EMR
          const emrFactory = await ethers.getContractFactory("EditionsMetadataRenderer");
          const emr = await emrFactory.deploy();
          await emr.deployed();
          const emrEncodedFn = emr.interface.encodeFunctionData("initialize", [editionsMetadataOwner.address]);

          const emrProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
          const emrProxy = await emrProxyFactory.deploy(emr.address, emrEncodedFn);
          await emrProxy.deployed();

          //Deploy Editions
          const editionsFactory = await ethers.getContractFactory("ERC721Editions");
          const editionsImpl = await editionsFactory.deploy();
          await editionsImpl.deployed();

          //Deploy Single Edition
          const singleEditionFactory = await ethers.getContractFactory("ERC721SingleEdition");
          const singleEditionImpl = await singleEditionFactory.deploy();
          await singleEditionImpl.deployed();

          //Deploy General
          const generalFactory = await ethers.getContractFactory("ERC721General");
          const generalImpl = await generalFactory.deploy();
          await generalImpl.deployed();

          const mintManagerWithOwner = MintManager__factory.connect(mintManagerProxy.address, mintManagerOwner);

          const singleEdition = await setupSingleEdition(
            observability.address,
            singleEditionImplementation,
            mintManagerProxy.address,
            minimalForwarder.address,
            emrProxy.address,
            editionsOwner,
            editionSize,
            "name",
            "SYM",
          );

          const maticWETHFactory = await ethers.getContractFactory("MaticWETH", fan1);
          const maticWETH = await maticWETHFactory.deploy(initialPlatformExecutor.address);
          await maticWETH.deployed();

          return { mintManagerWithOwner, singleEdition, maticWETH };
        }
        before(async () => {
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
            editionsOwner,
          );
          mintManager = mintManagerProxy;
          trustedForwarder = minimalForwarder;
          auctionManager = auctionManagerProxy;
          emr = emrProxy;
          observability = observabilityInstance;
          editionsImplementation = editionsImplementationAddress;
          singleEditionImplementation = singleEditionImplementationAddress;
          generalImplementation = generalImplementationAddress;
          singleEdition = await setupSingleEdition(
            observability.address,
            singleEditionImplementation,
            mintManager.address,
            trustedForwarder.address,
            emr.address,
            editionsOwner,
            editionSize,
            "name",
            "SYM",
          );
        });
        it("Should be able to mint one to one recipient", async function () {
          const claimNonce = "gatedMintEdition721ClaimNonce1";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManager.address,
            singleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            1,
            maxPerVector,
            maxPerUser,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManager.connect(fan1);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.emit(singleEdition, "Transfer");
          expect((await mintManager.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(1);
          expect(
            (await mintManager.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)).toNumber(),
          ).to.be.equal(1);
          expect(await mintManager.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.include(
            claim.claimNonce,
          );
        });
        it("Should be able to mint multiple to one recipient", async function () {
          const claimNonce = "gatedMintEdition721ClaimNonce2";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManager.address,
            singleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            9,
            maxPerVector,
            maxPerUser,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManager.connect(fan1);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.emit(singleEdition, "Transfer");
          expect((await mintManager.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(10);
          expect(
            (await mintManager.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)).toNumber(),
          ).to.be.equal(10);
          expect(await mintManager.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.include(
            claim.claimNonce,
          );
        });
        it("Should be able to mint with Native Currency", async function () {
          const { mintManagerWithOwner, singleEdition } = await deploySingleEditionFixture();
          const offChainVectorId = "gatedMintNativeVectorId";
          const claimNonce = "gatedMintNativePay";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManagerWithOwner.address,
            singleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0.00001",
            1,
            maxPerVector,
            maxPerUser,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManagerWithOwner.connect(fan1);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: claim.pricePerToken,
            }),
          ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address),
          ).to.be.revertedWithCustomError(mintManagerForFan1, Errors.InvalidPaymentAmount);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint).add(claim.pricePerToken),
            }),
          ).to.emit(singleEdition, "Transfer");
          expect((await mintManagerWithOwner.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(
            1,
          );
          expect(
            (
              await mintManagerWithOwner.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)
            ).toNumber(),
          ).to.be.equal(1);
          expect(await mintManagerWithOwner.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.include(
            claim.claimNonce,
          );
        });
        it("Should be able to mint with ERC20", async function () {
          const { mintManagerWithOwner, singleEdition, maticWETH } = await deploySingleEditionFixture();
          const offChainVectorId = "gatedMintERC20VectorId";
          const claimNonce = "gatedMintERC20";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManagerWithOwner.address,
            singleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            9,
            maxPerVector,
            maxPerUser,
            0,
            offChainVectorId,
            claimNonce,
            maticWETH.address,
          );
          const mintManagerForFan1 = mintManagerWithOwner.connect(fan1);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.emit(singleEdition, "Transfer");
          expect((await mintManagerForFan1.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(
            9,
          );
          expect(
            (
              await mintManagerForFan1.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)
            ).toNumber(),
          ).to.be.equal(9);
          expect(await mintManagerForFan1.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.include(
            claim.claimNonce,
          );
        });
        it.skip("Should be able to mint with meta-tx payment", async function () {
          const { maticWETH } = await deployMetaTxnFixture();
          const claimNonce = "gatedMintPacketClaimNonce2";
          const { signature, claim } = await generateClaimWithMetaTxPackets(
            initialPlatformExecutor,
            fan1,
            mintManager.address,
            singleEdition.address,
            editionsOwner.address,
            maticWETH.address,
            getValidClaimTimestamp(),
            "1",
            1,
            maxPerVector,
            maxPerUser,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManager.connect(fan1);
          console.log({ signature, claim, mintManagerForFan1 });
          /*
          await expect(mintManagerForFan1.gatedMintPaymentPacketEdition721(claim, signature, fan1.address)).to.emit(
            singleEdition,
            "Transfer",
          );
          */
          // expect((await mintManager.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(10);
          // expect(
          //   (await mintManager.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)).toNumber(),
          // ).to.be.equal(10);
          // expect(await mintManager.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.include(
          //   claim.claimNonce,
          // );
        });
        it("Should not be able to mint if claim nonce already used", async function () {
          const claimNonce = "gatedMintEdition721ClaimNonce2";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManager.address,
            singleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            1,
            0,
            0,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManager.connect(fan1);
          expect(await mintManager.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.include(
            claim.claimNonce,
          );
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.be.revertedWithCustomError(mintManagerForFan1, Errors.InvalidClaim);
          expect((await mintManager.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(10);
          expect(
            (await mintManager.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)).toNumber(),
          ).to.be.equal(10);
        });
        it("Should not be be able to mint after max per vector reached", async function () {
          const claimNonce = "gatedMintEdition721ClaimNonce3";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManager.address,
            singleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            9,
            maxPerVector,
            maxPerUser,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManager.connect(fan1);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.be.revertedWithCustomError(mintManagerForFan1, Errors.InvalidClaim);
          expect((await mintManager.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(10);
          expect(
            (await mintManager.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)).toNumber(),
          ).to.be.equal(10);
          expect(await mintManager.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.not.include(
            claim.claimNonce,
          );
        });
        it("Should not be be able to mint after edition size is reached", async function () {
          const claimNonce = "gatedMintEdition721ClaimNonce4";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManager.address,
            singleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            1,
            0,
            0,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManager.connect(fan1);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.be.revertedWithCustomError(singleEdition, Errors.SoldOut);
        });
      });
      describe("Multiple Editions", function () {
        let multipleEdition: ERC721Editions, mintManager: MintManager;
        const offChainVectorId = "gatedMintEdition721VectorId";
        const maxPerVector = 10;
        const maxPerUser = 10;
        const editionSize = 10;

        async function deployMultipleEditionFixture() {
          //Deploy Minimal Forwarder
          const minimalForwarderFactory = await ethers.getContractFactory("MinimalForwarder");
          const minimalForwarder = await minimalForwarderFactory.deploy();
          await minimalForwarder.deployed();

          //Deploy Mint Manager
          const mintManagerFactory = await ethers.getContractFactory("MintManager");
          const mintManager = await mintManagerFactory.deploy();
          await mintManager.deployed();
          const encodedFn = mintManager.interface.encodeFunctionData("initialize", [
            platformPaymentAddress.address,
            mintManagerOwner.address,
            minimalForwarder.address,
            initialPlatformExecutor.address,
            mintFeeWei,
          ]);

          const mintManagerProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
          const mintManagerProxy = await mintManagerProxyFactory.deploy(mintManager.address, encodedFn);
          await mintManagerProxy.deployed();

          // deploy AuctionManager
          const auctionManagerFactory = await ethers.getContractFactory("AuctionManager");
          const auctionManager = await auctionManagerFactory.deploy();
          await auctionManager.deployed();
          const amEncodedFn = auctionManager.interface.encodeFunctionData("initialize", [
            platformPaymentAddress.address,
            minimalForwarder.address,
            mintManagerOwner.address,
            initialPlatformExecutor.address,
          ]);

          const auctionManagerProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
          const auctionManagerProxy = await auctionManagerProxyFactory.deploy(auctionManager.address, amEncodedFn);
          await auctionManagerProxy.deployed();

          //Deploy EMR
          const emrFactory = await ethers.getContractFactory("EditionsMetadataRenderer");
          const emr = await emrFactory.deploy();
          await emr.deployed();
          const emrEncodedFn = emr.interface.encodeFunctionData("initialize", [editionsMetadataOwner.address]);

          const emrProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
          const emrProxy = await emrProxyFactory.deploy(emr.address, emrEncodedFn);
          await emrProxy.deployed();

          //Deploy Editions
          const editionsFactory = await ethers.getContractFactory("ERC721Editions");
          const editionsImpl = await editionsFactory.deploy();
          await editionsImpl.deployed();

          //Deploy Single Edition
          const singleEditionFactory = await ethers.getContractFactory("ERC721SingleEdition");
          const singleEditionImpl = await singleEditionFactory.deploy();
          await singleEditionImpl.deployed();

          //Deploy General
          const generalFactory = await ethers.getContractFactory("ERC721General");
          const generalImpl = await generalFactory.deploy();
          await generalImpl.deployed();

          const mintManagerWithOwner = MintManager__factory.connect(mintManagerProxy.address, mintManagerOwner);

          const multipleEdition = await setupMultipleEdition(
            observability.address,
            editionsImplementation,
            mintManagerProxy.address,
            auctionManagerProxy.address,
            minimalForwarder.address,
            emrProxy.address,
            editionsOwner,
            editionSize,
            "Test 1",
            "T1",
          );

          const maticWETHFactory = await ethers.getContractFactory("MaticWETH", fan1);
          const maticWETH = await maticWETHFactory.deploy(initialPlatformExecutor.address);
          await maticWETH.deployed();

          return { mintManagerWithOwner, multipleEdition, maticWETH };
        }
        before(async () => {
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
            editionsOwner,
          );
          mintManager = mintManagerProxy;
          trustedForwarder = minimalForwarder;
          auctionManager = auctionManagerProxy;
          emr = emrProxy;
          observability = observabilityInstance;
          editionsImplementation = editionsImplementationAddress;
          singleEditionImplementation = singleEditionImplementationAddress;
          generalImplementation = generalImplementationAddress;
          multipleEdition = await setupMultipleEdition(
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
        });
        it("Should be able to mint one to one recipient", async function () {
          const claimNonce = "gatedMintEditions721ClaimNonce1";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManager.address,
            multipleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            1,
            maxPerVector,
            maxPerUser,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManager.connect(fan1);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.emit(multipleEdition, "Transfer");
          expect((await mintManager.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(1);
          expect(
            (await mintManager.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)).toNumber(),
          ).to.be.equal(1);
          expect(await mintManager.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.include(
            claim.claimNonce,
          );
        });
        it("Should be able to mint multiple to one recipient", async function () {
          const claimNonce = "gatedMintEditions721ClaimNonce2";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManager.address,
            multipleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            9,
            maxPerVector,
            maxPerUser,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManager.connect(fan1);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.emit(multipleEdition, "Transfer");
          expect((await mintManager.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(10);
          expect(
            (await mintManager.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)).toNumber(),
          ).to.be.equal(10);
          expect(await mintManager.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.include(
            claim.claimNonce,
          );
        });
        it("Should be able to mint with Native Currency", async function () {
          const { mintManagerWithOwner, multipleEdition } = await deployMultipleEditionFixture();
          const offChainVectorId = "gatedMintNativeVectorId";
          const claimNonce = "gatedMintNativePay";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManagerWithOwner.address,
            multipleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0.00001",
            1,
            maxPerVector,
            maxPerUser,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManagerWithOwner.connect(fan1);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint).add(claim.pricePerToken),
            }),
          ).to.emit(multipleEdition, "Transfer");
          expect((await mintManagerWithOwner.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(
            1,
          );
          expect(
            (
              await mintManagerWithOwner.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)
            ).toNumber(),
          ).to.be.equal(1);
          expect(await mintManagerWithOwner.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.include(
            claim.claimNonce,
          );
        });
        it("Should be able to mint with ERC20", async function () {
          const { mintManagerWithOwner, multipleEdition, maticWETH } = await deployMultipleEditionFixture();
          const offChainVectorId = "gatedMintERC20VectorId";
          const claimNonce = "gatedMintERC20";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManagerWithOwner.address,
            multipleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            9,
            maxPerVector,
            maxPerUser,
            0,
            offChainVectorId,
            claimNonce,
            maticWETH.address,
          );
          const mintManagerForFan1 = mintManagerWithOwner.connect(fan1);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.emit(multipleEdition, "Transfer");
          expect((await mintManagerForFan1.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(
            9,
          );
          expect(
            (
              await mintManagerForFan1.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)
            ).toNumber(),
          ).to.be.equal(9);
          expect(await mintManagerForFan1.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.include(
            claim.claimNonce,
          );
        });
        it("Should not be able to mint if claim nonce already used", async function () {
          const claimNonce = "gatedMintEditions721ClaimNonce2";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManager.address,
            multipleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            1,
            0,
            0,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManager.connect(fan1);
          expect(await mintManager.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.include(
            claim.claimNonce,
          );
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.be.revertedWithCustomError(mintManagerForFan1, Errors.InvalidClaim);
          expect((await mintManager.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(10);
          expect(
            (await mintManager.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)).toNumber(),
          ).to.be.equal(10);
        });
        it("Should not be able to mint after max per vector reached", async function () {
          const claimNonce = "gatedMintEditions721ClaimNonce3";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManager.address,
            multipleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            1,
            maxPerVector,
            maxPerUser,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManager.connect(fan1);
          expect((await mintManager.offchainVectorsClaimState(claim.offchainVectorId)).toNumber()).to.be.equal(
            claim.maxClaimableViaVector,
          );
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.be.revertedWithCustomError(mintManagerForFan1, Errors.InvalidClaim);
          expect(
            (await mintManager.getNumClaimedPerUserOffchainVector(claim.offchainVectorId, fan1.address)).toNumber(),
          ).to.be.equal(10);
          expect(await mintManager.getClaimNoncesUsedForOffchainVector(claim.offchainVectorId)).to.not.include(
            claim.claimNonce,
          );
        });
        it("Should be not be able to mint after edition size is reached", async function () {
          const claimNonce = "gatedMintEditions721ClaimNonce4";
          const { signature, claim } = await generateClaim(
            initialPlatformExecutor,
            mintManager.address,
            multipleEdition.address,
            fan1.address,
            editionsOwner.address,
            getValidClaimTimestamp(),
            "0",
            1,
            0,
            0,
            0,
            offChainVectorId,
            claimNonce,
          );
          const mintManagerForFan1 = mintManager.connect(fan1);
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: mintFeeWei.mul(claim.numTokensToMint),
            }),
          ).to.be.revertedWithCustomError(multipleEdition, Errors.SoldOut);
        });
      });
    });
  });

  describe("Vectors", function () {
    let singleEdition: ERC721SingleEdition, mintManager: MintManager;
    const editionSize = 10;
    let vectorId = 1;
    before(async () => {
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
        editionsOwner,
      );
      mintManager = mintManagerProxy;
      trustedForwarder = minimalForwarder;
      auctionManager = auctionManagerProxy;
      emr = emrProxy;
      observability = observabilityInstance;
      editionsImplementation = editionsImplementationAddress;
      singleEditionImplementation = singleEditionImplementationAddress;
      generalImplementation = generalImplementationAddress;
      singleEdition = await setupSingleEdition(
        observability.address,
        singleEditionImplementation,
        mintManager.address,
        trustedForwarder.address,
        emr.address,
        editionsOwner,
        editionSize,
        "Test 1",
        "T1",
      );
    });
    it("Should be able to create new vector for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_ABRIDGED_VECTOR(singleEdition.address, editionsOwner.address, true);
      await expect(mintManagerForEditionOwner.createAbridgedVector(vector)).to.emit(
        mintManagerForEditionOwner,
        "EditionVectorCreated",
      );
      vectorId += 1;
    });
    it.skip("Should not be able to update vector when frozen", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_ABRIDGED_VECTOR(singleEdition.address, editionsOwner.address, true);
      await (await mintManagerForEditionOwner.createAbridgedVector(vector)).wait();
      /*
      await expect(mintManagerForEditionOwner.updateAbridgedVector(vectorId, vector)).to.be.revertedWithCustomError(
        mintManagerForEditionOwner,
        Errors.VectorUpdateActionFrozen,
      );
      */
      vectorId += 1;
    });
    it("Should be able to update vector for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_ABRIDGED_VECTOR(singleEdition.address, editionsOwner.address, true, 0, 100);
      const vectorUpdateConfig = SAMPLE_ABRIDGED_VECTOR_UPDATE_CONFIG({
        updateMaxTotalClaimableViaVector: true,
        updateTokenLimitPerTx: true,
      });
      await (await mintManagerForEditionOwner.createAbridgedVector(vector)).wait();
      await expect(
        mintManagerForEditionOwner.updateAbridgedVector(
          vectorId,
          { ...vector, maxUserClaimableViaVector: 57, tokenLimitPerTx: 32938 },
          vectorUpdateConfig,
          true,
          10009,
        ),
      ).to.emit(mintManagerForEditionOwner, "VectorUpdated");
      expect((await mintManagerForEditionOwner.getAbridgedVector(vectorId)).tokenLimitPerTx).to.equal(32938);
      expect((await mintManagerForEditionOwner.getAbridgedVector(vectorId)).maxTotalClaimableViaVector).to.equal(100);
      expect((await mintManagerForEditionOwner.getAbridgedVector(vectorId)).maxUserClaimableViaVector).to.not.equal(57);
      expect((await mintManagerForEditionOwner.getAbridgedVector(vectorId)).maxUserClaimableViaVector).to.equal(0);
      expect(await mintManagerForEditionOwner.getAbridgedVectorMetadata(vectorId)).to.eql([
        false,
        ethers.BigNumber.from(0),
      ]);
      vectorId += 1;
    });
    it.skip("Should not be able to delete vector when frozen for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_ABRIDGED_VECTOR(singleEdition.address, editionsOwner.address, true);
      await (await mintManagerForEditionOwner.createAbridgedVector(vector)).wait();
      await expect(mintManagerForEditionOwner.deleteAbridgedVector(vectorId)).to.be.revertedWithCustomError(
        mintManagerForEditionOwner,
        Errors.VectorUpdateActionFrozen,
      );
      vectorId += 1;
    });
    it("Should be able to delete vector for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_ABRIDGED_VECTOR(singleEdition.address, editionsOwner.address, true);
      await (await mintManagerForEditionOwner.createAbridgedVector(vector)).wait();
      await expect(mintManagerForEditionOwner.deleteAbridgedVector(vectorId)).to.emit(
        mintManagerForEditionOwner,
        "VectorDeleted",
      );
      vectorId += 1;
    });
    it.skip("Should not be able to pause vector when frozen for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_ABRIDGED_VECTOR(singleEdition.address, editionsOwner.address, true);
      await (await mintManagerForEditionOwner.createAbridgedVector(vector)).wait();
      /*
      await expect(mintManagerForEditionOwner.pauseVector(vectorId)).to.be.revertedWithCustomError(
        mintManagerForEditionOwner,
        Errors.VectorUpdateActionFrozen,
      );
      */
      vectorId += 1;
    });
    it.skip("Should be able to pause vector for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_ABRIDGED_VECTOR(singleEdition.address, editionsOwner.address, true);
      await (await mintManagerForEditionOwner.createAbridgedVector(vector)).wait();
      /*
      await expect(mintManagerForEditionOwner.pauseVector(vectorId)).to.emit(
        mintManagerForEditionOwner,
        "VectorPausedOrUnpaused",
      );
      */
      vectorId += 1;
    });
    it.skip("Should be able to pause vector for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_ABRIDGED_VECTOR(singleEdition.address, editionsOwner.address, true);
      await (await mintManagerForEditionOwner.createAbridgedVector(vector)).wait();
      /*
      await expect(mintManagerForEditionOwner.unpauseVector(vectorId)).to.emit(
        mintManagerForEditionOwner,
        "VectorPausedOrUnpaused",
      );
      */
      vectorId += 1;
    });
    it("Should reject all vector interactions for contract by non Owner", async () => {
      const vector = SAMPLE_ABRIDGED_VECTOR(singleEdition.address, editionsOwner.address, true, 0, 100);
      const vectorUpdateConfig = SAMPLE_ABRIDGED_VECTOR_UPDATE_CONFIG({ updateMaxTotalClaimableViaVector: true });
      const mintManagerForEditionOwner = mintManager.connect(editionsOwner);
      await (await mintManagerForEditionOwner.createAbridgedVector(vector)).wait();
      mintManager = mintManager.connect(fan1);
      await expect(mintManager.createAbridgedVector(vector)).to.be.revertedWithCustomError(
        mintManager,
        Errors.Unauthorized,
      );
      await expect(
        mintManager.updateAbridgedVector(vectorId, vector, vectorUpdateConfig, false, 0),
      ).to.be.revertedWithCustomError(mintManager, Errors.Unauthorized);
      await expect(mintManager.deleteAbridgedVector(vectorId)).to.be.revertedWithCustomError(
        mintManager,
        Errors.Unauthorized,
      );

      mintManager = mintManager.connect(editionsOwner);
    });
  });

  describe("Vector Mints", function () {
    async function vectorMintsFixture() {
      //Deploy Minimal Forwarder
      const minimalForwarderFactory = await ethers.getContractFactory("MinimalForwarder");
      const minimalForwarder = await minimalForwarderFactory.deploy();
      await minimalForwarder.deployed();

      //Deploy Mint Manager
      const mintManagerFactory = await ethers.getContractFactory("MintManager");
      const mintManager = await mintManagerFactory.deploy();
      await mintManager.deployed();
      const encodedFn = mintManager.interface.encodeFunctionData("initialize", [
        platformPaymentAddress.address,
        mintManagerOwner.address,
        minimalForwarder.address,
        initialPlatformExecutor.address,
        mintFeeWei,
      ]);

      const mintManagerProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
      const mintManagerProxy = await mintManagerProxyFactory.deploy(mintManager.address, encodedFn);
      await mintManagerProxy.deployed();

      // deploy AuctionManager
      const auctionManagerFactory = await ethers.getContractFactory("AuctionManager");
      const auctionManager = await auctionManagerFactory.deploy();
      await auctionManager.deployed();
      const amEncodedFn = auctionManager.interface.encodeFunctionData("initialize", [
        platformPaymentAddress.address,
        minimalForwarder.address,
        mintManagerOwner.address,
        initialPlatformExecutor.address,
      ]);

      const auctionManagerProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
      const auctionManagerProxy = await auctionManagerProxyFactory.deploy(auctionManager.address, amEncodedFn);
      await auctionManagerProxy.deployed();

      //Deploy EMR
      const emrFactory = await ethers.getContractFactory("EditionsMetadataRenderer");
      const emr = await emrFactory.deploy();
      await emr.deployed();
      const emrEncodedFn = emr.interface.encodeFunctionData("initialize", [editionsMetadataOwner.address]);

      const emrProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
      const emrProxy = await emrProxyFactory.deploy(emr.address, emrEncodedFn);
      await emrProxy.deployed();

      //Deploy Editions
      const editionsFactory = await ethers.getContractFactory("ERC721Editions");
      const editionsImpl = await editionsFactory.deploy();
      await editionsImpl.deployed();

      //Deploy Single Edition
      const singleEditionFactory = await ethers.getContractFactory("ERC721SingleEdition");
      const singleEditionImpl = await singleEditionFactory.deploy();
      await singleEditionImpl.deployed();

      //Deploy General
      const generalFactory = await ethers.getContractFactory("ERC721General");
      const generalImpl = await generalFactory.deploy();
      await generalImpl.deployed();

      const mintManagerWithOwner = MintManager__factory.connect(mintManagerProxy.address, mintManagerOwner);

      const observabilityFactory = await ethers.getContractFactory("Observability");
      const observability = await observabilityFactory.deploy();
      await observability.deployed();

      const generalERC721 = await setupGeneral(
        observability.address,
        generalImplementation,
        minimalForwarder.address,
        mintManagerProxy.address,
        generalOwner,
        null,
        null,
        false,
        false,
        0,
        ethers.constants.AddressZero,
        ethers.constants.AddressZero,
        0,
        "Test 1",
        "T1",
      );

      const singleEditionERC721 = await setupSingleEdition(
        observability.address,
        singleEditionImplementation,
        mintManagerProxy.address,
        minimalForwarder.address,
        emr.address,
        editionsOwner,
        10,
        "Test 1",
        "T1",
      );

      const multipleEditionERC721 = await setupMultipleEdition(
        observability.address,
        editionsImplementation,
        mintManagerProxy.address,
        auctionManagerProxy.address,
        minimalForwarder.address,
        emrProxy.address,
        editionsOwner,
        10,
        "Test 1",
        "T1",
      );

      return { mintManagerWithOwner, generalERC721, singleEditionERC721, multipleEditionERC721 };
    }
    describe("Edition721", function () {
      describe("Single Edition", function () {
        it("Should be able to mint one to one recipient", async function () {
          const { mintManagerWithOwner, singleEditionERC721 } = await vectorMintsFixture();
          const mintManagerForEditionOwner = await mintManagerWithOwner.connect(editionsOwner);
          const vector = SAMPLE_ABRIDGED_VECTOR(
            singleEditionERC721.address,
            editionsOwner.address,
            true,
            0,
            5,
            5,
            0,
            0,
            5,
            ethers.utils.parseEther("0.00000001"),
          );
          await expect(mintManagerForEditionOwner.createAbridgedVector(vector)).to.emit(
            mintManagerForEditionOwner,
            "EditionVectorCreated",
          );
          const mintManagerForFan1 = await mintManagerWithOwner.connect(fan1);
          await expect(mintManagerForFan1.vectorMint721(1, 1, fan1.address)).to.be.revertedWithCustomError(
            mintManagerForFan1,
            Errors.InvalidPaymentAmount,
          );
          await expect(
            mintManagerForFan1.vectorMint721(1, 1, fan1.address, {
              value: ethers.utils.parseEther("0.00000001"),
            }),
          ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
          await expect(
            mintManagerForFan1.vectorMint721(1, 1, fan1.address, { value: mintFeeWei }),
          ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
          await expect(
            mintManagerForFan1.vectorMint721(1, 1, fan1.address, {
              value: mintFeeWei.add(ethers.utils.parseEther("0.00000001")),
            }),
          ).to.emit(singleEditionERC721, "Transfer");
        });
      });
      describe("Multiple Edition", function () {
        let mintManagerForFan1: MintManager;
        let meERC721: ERC721Editions;

        it("Sending invalid mint fee should fail", async function () {
          const { mintManagerWithOwner, multipleEditionERC721 } = await vectorMintsFixture();
          const mintManagerForEditionOwner = mintManagerWithOwner.connect(editionsOwner);
          const vector = SAMPLE_ABRIDGED_VECTOR(multipleEditionERC721.address, editionsOwner.address, true);
          await expect(mintManagerForEditionOwner.createAbridgedVector(vector)).to.emit(
            mintManagerForEditionOwner,
            "EditionVectorCreated",
          );
          mintManagerForFan1 = await mintManagerWithOwner.connect(fan1);
          meERC721 = multipleEditionERC721;
          await expect(mintManagerForFan1.vectorMint721(1, 1, fan1.address)).to.be.revertedWithCustomError(
            mintManager,
            Errors.MintFeeTooLow,
          );
        });

        it("Should be able to mint one to one recipient", async function () {
          await expect(
            mintManagerForFan1.vectorMint721(1, 1, fan1.address, { value: mintFeeWei.sub(1) }),
          ).to.be.revertedWithCustomError(mintManager, Errors.MintFeeTooLow);

          const mintManagerForPlatform = mintManagerForFan1.connect(mintManagerOwner);
          await expect(mintManagerForPlatform.updatePlatformAndMintFee(mintManagerOwner.address, mintFeeWei.sub(1))).to
            .not.be.reverted;

          await expect(mintManagerForFan1.vectorMint721(1, 1, fan1.address, { value: mintFeeWei.sub(1) })).to.emit(
            meERC721,
            "Transfer",
          );
        });
      });

      describe("Mint fee updates", function () {
        it("Non-platform accounts can't update the mint fee", async function () {
          const { mintManagerWithOwner } = await vectorMintsFixture();

          let mintManagerUnauthorized = mintManagerWithOwner.connect(fan1);
          await expect(
            mintManagerUnauthorized.updatePlatformAndMintFee(mintManagerOwner.address, 1),
          ).to.be.revertedWith("Ownable: caller is not the owner");

          mintManagerUnauthorized = mintManagerUnauthorized.connect(editionsOwner);
          await expect(
            mintManagerUnauthorized.updatePlatformAndMintFee(mintManagerOwner.address, 1),
          ).to.be.revertedWith("Ownable: caller is not the owner");

          mintManagerUnauthorized = mintManagerUnauthorized.connect(editionsMetadataOwner);
          await expect(
            mintManagerUnauthorized.updatePlatformAndMintFee(mintManagerOwner.address, 1),
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });
      });
    });

    describe("Series vector mint", async function () {
      it("Should be able to mint one to one recipient", async function () {
        const { mintManagerWithOwner, generalERC721 } = await vectorMintsFixture();
        const mintManagerForGeneralOwner = await mintManagerWithOwner.connect(generalOwner);
        const vector = SAMPLE_ABRIDGED_VECTOR(
          generalERC721.address,
          generalOwner.address,
          false,
          0,
          10,
          5,
          0,
          0,
          5,
          ethers.utils.parseEther("0.00000001"),
        );
        await expect(mintManagerForGeneralOwner.createAbridgedVector(vector)).to.emit(
          mintManagerForGeneralOwner,
          "SeriesVectorCreated",
        );
        const mintManagerForFan1 = await mintManagerWithOwner.connect(fan1);
        await expect(mintManagerForFan1.vectorMint721(1, 1, fan1.address)).to.be.revertedWithCustomError(
          mintManagerForFan1,
          Errors.InvalidPaymentAmount,
        );
        await expect(
          mintManagerForFan1.vectorMint721(1, 1, fan1.address, {
            value: ethers.utils.parseEther("0.00000001"),
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
        await expect(
          mintManagerForFan1.vectorMint721(1, 1, fan1.address, { value: mintFeeWei }),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
        await expect(
          mintManagerForFan1.vectorMint721(1, 1, fan1.address, {
            value: mintFeeWei.add(ethers.utils.parseEther("0.00000001")),
          }),
        ).to.emit(generalERC721, "Transfer");
        await expect(
          mintManagerForFan1.vectorMint721(1, 4, fan1.address, {
            value: mintFeeWei.mul(4).add(ethers.utils.parseEther("0.00000001").mul(4)),
          }),
        )
          .to.emit(generalERC721, "Transfer")
          .to.emit(generalERC721, "Transfer")
          .to.emit(generalERC721, "Transfer")
          .to.emit(generalERC721, "Transfer");

        await expect(
          mintManagerForFan1.vectorMint721(1, 1, fan1.address, {
            value: mintFeeWei.add(ethers.utils.parseEther("0.00000001")),
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.OnchainVectorMintGuardFailed);
      });

      it("User limit is based on mint recipent", async function () {
        const { mintManagerWithOwner, generalERC721 } = await vectorMintsFixture();
        const mintManagerForGeneralOwner = await mintManagerWithOwner.connect(generalOwner);
        const vector = SAMPLE_ABRIDGED_VECTOR(
          generalERC721.address,
          generalOwner.address,
          false,
          0,
          10,
          1,
          0,
          0,
          5,
          ethers.utils.parseEther("0.00000001"),
        );
        await expect(mintManagerForGeneralOwner.createAbridgedVector(vector)).to.emit(
          mintManagerForGeneralOwner,
          "SeriesVectorCreated",
        );
        await expect(
          mintManagerForGeneralOwner.vectorMint721(1, 1, fan1.address, {
            value: mintFeeWei.add(ethers.utils.parseEther("0.00000001")),
          }),
        ).to.emit(generalERC721, "Transfer");
        await expect(
          mintManagerForGeneralOwner.vectorMint721(1, 1, fan1.address, {
            value: mintFeeWei.add(ethers.utils.parseEther("0.00000001")),
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.OnchainVectorMintGuardFailed);
        await expect(
          mintManagerForGeneralOwner.vectorMint721(1, 2, generalOwner.address, {
            value: mintFeeWei.mul(2).add(ethers.utils.parseEther("0.00000002")),
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.OnchainVectorMintGuardFailed);
      });

      it("Should be able to mint one to one recipient", async function () {
        const { mintManagerWithOwner, generalERC721 } = await vectorMintsFixture();
        const mintManagerForGeneralOwner = await mintManagerWithOwner.connect(generalOwner);

        /*
        const allowlistedAddresses = [
          fan1.address,
          editionsOwner.address,
          generalOwner.address,
          editionsMetadataOwner.address,
        ];
        const leaves = allowlistedAddresses.map(x => ethers.utils.keccak256(x));
        const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        const root = tree.getRoot().toString("hex");
        const hashedFan1Address = keccak256(fan1.address);
        const proof = tree.getHexProof(hashedFan1Address);
        */

        const vector = SAMPLE_ABRIDGED_VECTOR(
          generalERC721.address,
          generalOwner.address,
          false,
          0,
          5,
          5,
          0,
          0,
          5,
          ethers.utils.parseEther("0.00000001"),
          ethers.constants.HashZero,
        );
        await expect(mintManagerForGeneralOwner.createAbridgedVector(vector)).to.emit(
          mintManagerForGeneralOwner,
          "SeriesVectorCreated",
        );
        const mintManagerForFan1 = await mintManagerWithOwner.connect(fan1);
        await expect(mintManagerForFan1.vectorMint721(1, 1, fan1.address)).to.be.revertedWithCustomError(
          mintManagerForFan1,
          Errors.InvalidPaymentAmount,
        );
        await expect(
          mintManagerForFan1.vectorMint721(1, 1, fan1.address, {
            value: ethers.utils.parseEther("0.00000001"),
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
        await expect(
          mintManagerForFan1.vectorMint721(1, 1, fan1.address, { value: mintFeeWei }),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
        await expect(
          mintManagerForFan1.vectorMint721(1, 1, fan1.address, {
            value: mintFeeWei.add(ethers.utils.parseEther("0.00000001")),
          }),
        ).to.emit(generalERC721, "Transfer");

        const mintManagerForNonAllowlistedAccount = mintManagerForFan1.connect(platformPaymentAddress);
        await expect(
          mintManagerForNonAllowlistedAccount.vectorMint721(1, 1, platformPaymentAddress.address, {
            value: mintFeeWei,
          }),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
      });
    });

    describe("Direct mint vectors metadata", function () {
      let mintManagerForEditionOwner: MintManager;
      let mintManagerForGeneralOwner: MintManager;
      let sampleVector: any;

      beforeEach(async function () {
        const { mintManagerWithOwner, generalERC721, singleEditionERC721 } = await vectorMintsFixture();
        mintManagerForEditionOwner = await mintManagerWithOwner.connect(editionsOwner);
        mintManagerForGeneralOwner = await mintManagerWithOwner.connect(generalOwner);

        const vector1 = SAMPLE_ABRIDGED_VECTOR(generalERC721.address, generalOwner.address, false);
        await expect(mintManagerForGeneralOwner.createAbridgedVector(vector1)).to.emit(
          mintManagerForGeneralOwner,
          "SeriesVectorCreated",
        );
        sampleVector = vector1;

        const vector2 = SAMPLE_ABRIDGED_VECTOR(singleEditionERC721.address, editionsOwner.address, true, 0);
        await expect(mintManagerForEditionOwner.createAbridgedVector(vector2)).to.emit(
          mintManagerForEditionOwner,
          "EditionVectorCreated",
        );

        const vector3 = SAMPLE_ABRIDGED_VECTOR(
          generalERC721.address,
          generalOwner.address,
          false,
          0,
          5,
          5,
          0,
          0,
          5,
          ethers.utils.parseEther("0"),
          ethers.constants.HashZero,
        );
        await expect(mintManagerForGeneralOwner.createAbridgedVector(vector3)).to.emit(
          mintManagerForGeneralOwner,
          "SeriesVectorCreated",
        );

        const vector4 = SAMPLE_ABRIDGED_VECTOR(
          singleEditionERC721.address,
          editionsOwner.address,
          true,
          0,
          5,
          5,
          0,
          0,
          5,
          ethers.utils.parseEther("0"),
          ethers.constants.HashZero,
        );
        await expect(mintManagerForEditionOwner.createAbridgedVector(vector4)).to.emit(
          mintManagerForEditionOwner,
          "EditionVectorCreated",
        );
      });

      it("Direct mint vector metadata cannot be set by non contract owners", async function () {
        await expect(mintManagerForEditionOwner.setAbridgedVectorMetadata(1, true, 0)).to.be.revertedWithCustomError(
          mintManagerForEditionOwner,
          Errors.Unauthorized,
        );

        await expect(mintManagerForEditionOwner.setAbridgedVectorMetadata(3, true, 0)).to.be.revertedWithCustomError(
          mintManagerForEditionOwner,
          Errors.Unauthorized,
        );

        await expect(mintManagerForGeneralOwner.setAbridgedVectorMetadata(2, true, 0)).to.be.revertedWithCustomError(
          mintManagerForGeneralOwner,
          Errors.Unauthorized,
        );

        await expect(mintManagerForGeneralOwner.setAbridgedVectorMetadata(4, true, 0)).to.be.revertedWithCustomError(
          mintManagerForGeneralOwner,
          Errors.Unauthorized,
        );
      });

      it("Direct mint vector metadata can be set (composed) and read (decomposed) correctly", async function () {
        await expect(mintManagerForGeneralOwner.setAbridgedVectorMetadata(1, true, 589384))
          .to.emit(mintManagerForGeneralOwner, "VectorMetadataSet")
          .withArgs(1, true, 589384);

        expect(await mintManagerForGeneralOwner.getAbridgedVectorMetadata(1)).to.eql([
          true,
          ethers.BigNumber.from(589384),
        ]);
      });

      it("Pausing a direct mint vector pauses all types of direct mints", async function () {
        // mints paused
        const vectorUpdateConfig = SAMPLE_ABRIDGED_VECTOR_UPDATE_CONFIG({
          updateMetadata: true,
          updateMaxUserClaimableViaVector: true,
        });
        await expect(
          mintManagerForGeneralOwner.updateAbridgedVector(
            1,
            { ...sampleVector, maxUserClaimableViaVector: 57 },
            vectorUpdateConfig,
            true,
            1908,
          ),
        )
          .to.emit(mintManagerForGeneralOwner, "VectorMetadataSet")
          .withArgs(1, true, 1908);

        await expect(mintManagerForGeneralOwner.setAbridgedVectorMetadata(3, true, 0))
          .to.emit(mintManagerForGeneralOwner, "VectorMetadataSet")
          .withArgs(3, true, 0);

        await expect(mintManagerForEditionOwner.setAbridgedVectorMetadata(2, true, 0))
          .to.emit(mintManagerForEditionOwner, "VectorMetadataSet")
          .withArgs(2, true, 0);

        await expect(mintManagerForEditionOwner.setAbridgedVectorMetadata(4, true, 0))
          .to.emit(mintManagerForEditionOwner, "VectorMetadataSet")
          .withArgs(4, true, 0);

        await expect(
          mintManagerForGeneralOwner.vectorMint721(1, 1, fan1.address, { value: mintFeeWei }),
        ).to.be.revertedWithCustomError(mintManagerForGeneralOwner, Errors.MintPaused);

        await expect(
          mintManagerForGeneralOwner.vectorMint721(3, 1, fan1.address, {
            value: mintFeeWei,
          }),
        ).to.be.revertedWithCustomError(mintManagerForGeneralOwner, Errors.MintPaused);

        await expect(
          mintManagerForEditionOwner.vectorMint721(2, 1, fan1.address, { value: mintFeeWei }),
        ).to.be.revertedWithCustomError(mintManagerForEditionOwner, Errors.MintPaused);

        /*
        vectorMint721WithAllowlist DEPRECATED
        await expect(
          mintManagerForEditionOwner.vectorMint721WithAllowlist(4, 1, fan1.address, proofForFan, {
            value: mintFeeWei,
          }),
        ).to.be.revertedWithCustomError(mintManagerForEditionOwner, Errors.MintPaused);
        */

        // mints unpaused
        await expect(mintManagerForGeneralOwner.setAbridgedVectorMetadata(1, false, 0))
          .to.emit(mintManagerForGeneralOwner, "VectorMetadataSet")
          .withArgs(1, false, 0);

        await expect(
          mintManagerForGeneralOwner.updateAbridgedVector(
            3,
            sampleVector,
            SAMPLE_ABRIDGED_VECTOR_UPDATE_CONFIG({ updateMetadata: true }),
            false,
            2023,
          ),
        )
          .to.emit(mintManagerForGeneralOwner, "VectorMetadataSet")
          .withArgs(3, false, 2023);

        await expect(mintManagerForEditionOwner.setAbridgedVectorMetadata(2, false, 0))
          .to.emit(mintManagerForEditionOwner, "VectorMetadataSet")
          .withArgs(2, false, 0);

        await expect(mintManagerForEditionOwner.setAbridgedVectorMetadata(4, false, 0))
          .to.emit(mintManagerForEditionOwner, "VectorMetadataSet")
          .withArgs(4, false, 0);

        await expect(mintManagerForGeneralOwner.vectorMint721(1, 1, fan1.address, { value: mintFeeWei })).to.not.be
          .reverted;

        await expect(
          mintManagerForGeneralOwner.vectorMint721(3, 1, fan1.address, {
            value: mintFeeWei,
          }),
        ).to.not.be.reverted;

        await expect(mintManagerForEditionOwner.vectorMint721(2, 1, fan1.address, { value: mintFeeWei })).to.not.be
          .reverted;

        /*
        vectorMint721WithAllowlist DEPRECATED
        await expect(
          mintManagerForEditionOwner.vectorMint721WithAllowlist(4, 1, fan1.address, proofForFan, {
            value: mintFeeWei,
          }),
        ).to.not.be.reverted;
        */
      });
    });
  });

  describe("721a bug", function () {
    describe("Generative", function () {
      let generative: ERC721Generative;

      before(async function () {
        generative = await setupGenerative(
          observability.address,
          generativeImplementation,
          trustedForwarder.address,
          mintManager.address,
          generalOwner,
          SAMPLE_ABRIDGED_VECTOR(ethers.constants.AddressZero, generalOwner.address, false),
          null,
          false,
          0,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          0,
          "Test 1",
          "T1",
        );
      });

      it("Transfer bug is non-existent", async function () {
        mintManager = mintManager.connect(fan1);
        await expect(mintManager.vectorMint721(1, 1, fan1.address, { value: ethers.utils.parseEther("0.0008") })).to.not
          .be.reverted;
        await expect(
          mintManager.vectorMint721(1, 2, generalOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(2),
          }),
        ).to.not.be.reverted;

        expect(await generative.ownerOf(1)).to.equal(fan1.address);
        expect(await generative.ownerOf(2)).to.equal(generalOwner.address);
        expect(await generative.ownerOf(3)).to.equal(generalOwner.address);

        mintManager = mintManager.connect(generalOwner);
        await expect(generative.transferFrom(generalOwner.address, fan1.address, 3)).to.not.be.reverted;

        expect(await generative.ownerOf(3)).to.equal(fan1.address);

        // can still mint after the last transfer
        await expect(
          mintManager.vectorMint721(1, 2, generalOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(2),
          }),
        ).to.not.be.reverted;

        expect(await generative.ownerOf(4)).to.equal(generalOwner.address);
      });

      it("Parallel minting bug is non-existent", async function () {
        const signers = (await ethers.getSigners()).filter(
          signer => signer.address != fan1.address && signer.address != generalOwner.address,
        );

        await Promise.all(
          signers.map(async signer => {
            for (let i = 1; i <= 5; i++) {
              await expect(
                mintManager.vectorMint721(1, i, signer.address, {
                  value: ethers.utils.parseEther("0.0008").mul(i),
                }),
              ).to.not.be.reverted;
            }
          }),
        );

        await Promise.all(
          signers.map(async signer => {
            expect((await generative.balanceOf(signer.address)).toNumber()).to.equal(15);
          }),
        );
      });
    });

    describe("General Sequence", function () {
      let general: ERC721GeneralSequence;

      before(async function () {
        general = ERC721GeneralSequence__factory.connect(
          (
            await setupGeneral(
              observability.address,
              generalSequenceImplementation,
              trustedForwarder.address,
              mintManager.address,
              generalOwner,
              SAMPLE_ABRIDGED_VECTOR(ethers.constants.AddressZero, generalOwner.address, false),
            )
          ).address,
          generalOwner,
        );
      });

      it("Transfer bug is non-existent", async function () {
        mintManager = mintManager.connect(fan1);
        await expect(mintManager.vectorMint721(2, 1, fan1.address, { value: ethers.utils.parseEther("0.0008") })).to.not
          .be.reverted;
        await expect(
          mintManager.vectorMint721(2, 2, generalOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(2),
          }),
        ).to.not.be.reverted;

        expect(await general.ownerOf(1)).to.equal(fan1.address);
        expect(await general.ownerOf(2)).to.equal(generalOwner.address);
        expect(await general.ownerOf(3)).to.equal(generalOwner.address);

        mintManager = mintManager.connect(generalOwner);
        await expect(general.transferFrom(generalOwner.address, fan1.address, 3)).to.not.be.reverted;

        expect(await general.ownerOf(3)).to.equal(fan1.address);

        // can still mint after the last transfer
        await expect(
          mintManager.vectorMint721(2, 2, generalOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(2),
          }),
        ).to.not.be.reverted;

        expect(await general.ownerOf(4)).to.equal(generalOwner.address);
      });

      it("Parallel minting bug is non-existent", async function () {
        const signers = (await ethers.getSigners()).filter(
          signer => signer.address != fan1.address && signer.address != generalOwner.address,
        );

        await Promise.all(
          signers.map(async signer => {
            for (let i = 1; i <= 5; i++) {
              await expect(
                mintManager.vectorMint721(2, i, signer.address, {
                  value: ethers.utils.parseEther("0.0008").mul(i),
                }),
              ).to.not.be.reverted;
            }
          }),
        );

        await Promise.all(
          signers.map(async signer => {
            expect((await general.balanceOf(signer.address)).toNumber()).to.equal(15);
          }),
        );
      });
    });

    describe("Open Edition", function () {
      let edition: ERC721SingleEdition;

      before(async function () {
        edition = await setupSingleEdition(
          observability.address,
          singleEditionImplementation,
          mintManager.address,
          trustedForwarder.address,
          emr.address,
          editionsOwner,
          0,
          "Test 1",
          "T1",
          SAMPLE_ABRIDGED_VECTOR(ethers.constants.AddressZero, editionsOwner.address, true),
        );
      });

      it("Transfer bug is non-existent", async function () {
        mintManager = mintManager.connect(fan1);
        await expect(mintManager.vectorMint721(3, 1, fan1.address, { value: ethers.utils.parseEther("0.0008") })).to.not
          .be.reverted;
        await expect(
          mintManager.vectorMint721(3, 2, editionsOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(2),
          }),
        ).to.not.be.reverted;

        expect(await edition.ownerOf(1)).to.equal(fan1.address);
        expect(await edition.ownerOf(2)).to.equal(editionsOwner.address);
        expect(await edition.ownerOf(3)).to.equal(editionsOwner.address);

        mintManager = mintManager.connect(editionsOwner);
        await expect(edition.transferFrom(editionsOwner.address, fan1.address, 3)).to.not.be.reverted;

        expect(await edition.ownerOf(3)).to.equal(fan1.address);

        // can still mint after the last transfer
        await expect(
          mintManager.vectorMint721(3, 2, editionsOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(2),
          }),
        ).to.not.be.reverted;

        expect(await edition.ownerOf(4)).to.equal(editionsOwner.address);
      });

      it("Parallel minting bug is non-existent", async function () {
        const signers = (await ethers.getSigners()).filter(
          signer => signer.address != fan1.address && signer.address != editionsOwner.address,
        );

        await Promise.all(
          signers.map(async signer => {
            for (let i = 1; i <= 5; i++) {
              await expect(
                mintManager.vectorMint721(3, i, signer.address, {
                  value: ethers.utils.parseEther("0.0008").mul(i),
                }),
              ).to.not.be.reverted;
            }
          }),
        );

        await Promise.all(
          signers.map(async signer => {
            expect((await edition.balanceOf(signer.address)).toNumber()).to.equal(15);
          }),
        );
      });
    });

    describe("Open Edition DFS", function () {
      let edition: ERC721SingleEditionDFS;

      before(async function () {
        edition = await setupSingleEditionDFS(
          observability.address,
          singleEditionDFSImplementation,
          mintManager.address,
          trustedForwarder.address,
          editionsOwner,
          0,
          "Test 1",
          "T1",
          SAMPLE_ABRIDGED_VECTOR(ethers.constants.AddressZero, editionsOwner.address, true),
        );
      });

      it("Transfer bug is non-existent", async function () {
        mintManager = mintManager.connect(fan1);
        await expect(mintManager.vectorMint721(4, 1, fan1.address, { value: ethers.utils.parseEther("0.0008") })).to.not
          .be.reverted;
        await expect(
          mintManager.vectorMint721(4, 2, editionsOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(2),
          }),
        ).to.not.be.reverted;

        expect(await edition.ownerOf(1)).to.equal(fan1.address);
        expect(await edition.ownerOf(2)).to.equal(editionsOwner.address);
        expect(await edition.ownerOf(3)).to.equal(editionsOwner.address);

        mintManager = mintManager.connect(editionsOwner);
        await expect(edition.transferFrom(editionsOwner.address, fan1.address, 3)).to.not.be.reverted;

        expect(await edition.ownerOf(3)).to.equal(fan1.address);

        // can still mint after the last transfer
        await expect(
          mintManager.vectorMint721(4, 2, editionsOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(2),
          }),
        ).to.not.be.reverted;

        expect(await edition.ownerOf(4)).to.equal(editionsOwner.address);
      });

      it("Parallel minting bug is non-existent", async function () {
        const signers = (await ethers.getSigners()).filter(
          signer => signer.address != fan1.address && signer.address != editionsOwner.address,
        );

        await Promise.all(
          signers.map(async signer => {
            for (let i = 1; i <= 5; i++) {
              await expect(
                mintManager.vectorMint721(4, i, signer.address, {
                  value: ethers.utils.parseEther("0.0008").mul(i),
                }),
              ).to.not.be.reverted;
            }
          }),
        );

        await Promise.all(
          signers.map(async signer => {
            expect((await edition.balanceOf(signer.address)).toNumber()).to.equal(15);
          }),
        );
      });
    });
  });

  describe("Creator reserve mints", function () {
    describe("Series based", function () {
      let generative: ERC721Generative;
      let general: ERC721General;

      before(async function () {
        generative = await setupGenerative(
          observability.address,
          generativeImplementation,
          trustedForwarder.address,
          mintManager.address,
          generalOwner,
          SAMPLE_ABRIDGED_VECTOR(ethers.constants.AddressZero, generalOwner.address, false),
          null,
          false,
          0,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          0,
          "Test 1",
          "T1",
        );

        general = await setupGeneral(
          observability.address,
          generalImplementation,
          trustedForwarder.address,
          mintManager.address,
          generalOwner,
        );
      });

      it("Non-owner cannot mint creator reserves", async function () {
        mintManager = mintManager.connect(fan1);
        await expect(
          mintManager.creatorReservesMint(generative.address, false, 0, 3, [], false, generalOwner.address),
        ).to.be.revertedWithCustomError(mintManager, Errors.Unauthorized);

        await expect(
          mintManager.creatorReservesMint(general.address, false, 0, 0, [4, 7], true, generalOwner.address),
        ).to.be.revertedWithCustomError(mintManager, Errors.Unauthorized);
      });

      it("Cannot mint creator reserves with invalid mint fee", async function () {
        mintManager = mintManager.connect(generalOwner);
        await expect(
          mintManager.creatorReservesMint(generative.address, false, 0, 3, [], false, generalOwner.address),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);

        await expect(
          mintManager.creatorReservesMint(general.address, false, 0, 0, [4, 7], true, generalOwner.address),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
      });

      it("Owner can validly mint creator reserves multiple times", async function () {
        mintManager = mintManager.connect(generalOwner);
        await expect(
          mintManager.creatorReservesMint(generative.address, false, 0, 3, [], false, generalOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(3),
          }),
        )
          .to.emit(mintManager, "CreatorReservesNumMint")
          .withArgs(generative.address, false, 0, 3)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, generalOwner.address, 1)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, generalOwner.address, 2)
          .to.emit(generative, "Transfer")
          .withArgs(ethers.constants.AddressZero, generalOwner.address, 3);

        await expect(
          mintManager.creatorReservesMint(general.address, false, 0, 0, [4, 7], true, generalOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(2),
          }),
        )
          .to.emit(mintManager, "CreatorReservesChooseMint")
          .withArgs(general.address, [4, 7])
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, generalOwner.address, 4)
          .to.emit(general, "Transfer")
          .withArgs(ethers.constants.AddressZero, generalOwner.address, 7);
      });
    });

    describe("Editions based", function () {
      let editions: ERC721EditionsDFS;

      before(async function () {
        editions = await setupEditionsDFS(
          observability.address,
          editionsDFSImplementation,
          mintManager.address,
          auctionManager.address,
          trustedForwarder.address,
          editionsOwner,
        );
        editions = editions.connect(editionsOwner);
        await expect(
          editions.createEdition(
            "uri",
            100,
            ethers.constants.AddressZero,
            {
              royaltyPercentageBPS: 0,
              recipientAddress: ethers.constants.AddressZero,
            },
            "0x",
          ),
        ).to.not.be.reverted;

        await expect(
          editions.createEdition(
            "uri",
            100,
            ethers.constants.AddressZero,
            {
              royaltyPercentageBPS: 0,
              recipientAddress: ethers.constants.AddressZero,
            },
            "0x",
          ),
        ).to.not.be.reverted;
      });

      it("Non-owner cannot mint creator reserves", async function () {
        mintManager = mintManager.connect(fan1);
        await expect(
          mintManager.creatorReservesMint(editions.address, true, 0, 3, [], false, editionsOwner.address),
        ).to.be.revertedWithCustomError(mintManager, Errors.Unauthorized);
      });

      it("Cannot mint creator reserves with invalid mint fee", async function () {
        mintManager = mintManager.connect(editionsOwner);
        await expect(
          mintManager.creatorReservesMint(editions.address, true, 0, 3, [], false, editionsOwner.address),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
      });

      it("Owner can validly mint creator reserves multiple times on multiple editions on a contract", async function () {
        mintManager = mintManager.connect(editionsOwner);
        await expect(
          mintManager.creatorReservesMint(editions.address, true, 0, 3, [], false, editionsOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(3),
          }),
        )
          .to.emit(mintManager, "CreatorReservesNumMint")
          .withArgs(editions.address, true, 0, 3)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, editionsOwner.address, 1)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, editionsOwner.address, 2)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, editionsOwner.address, 3);

        await expect(
          mintManager.creatorReservesMint(editions.address, true, 1, 3, [], false, editionsOwner.address, {
            value: ethers.utils.parseEther("0.0008").mul(3),
          }),
        )
          .to.emit(mintManager, "CreatorReservesNumMint")
          .withArgs(editions.address, true, 1, 3)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, editionsOwner.address, 101)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, editionsOwner.address, 102)
          .to.emit(editions, "Transfer")
          .withArgs(ethers.constants.AddressZero, editionsOwner.address, 103);
      });
    });
  });
});

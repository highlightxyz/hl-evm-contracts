import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  AuctionManager,
  ERC721Editions,
  ERC721General,
  ERC721SingleEdition,
  EditionsMetadataRenderer,
  MinimalForwarder,
  MintManager,
  MintManager__factory,
  Observability,
} from "../types";
import { SAMPLE_VECTOR_1, SAMPLE_VECTOR_MUTABILITY_1 } from "./__utils__/data";
import {
  generateClaim,
  generateClaimWithMetaTxPackets,
  generateSeriesClaim,
  setupGeneral,
  setupMultipleEdition,
  setupSingleEdition,
  setupSystem,
} from "./__utils__/helpers";
import { getExpiredClaimTimestamp, getValidClaimTimestamp } from "./__utils__/mint";

//TODO: Gated MetaTx Tests
//TODO: Variations of Vector Mint

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
  let generalImplementation: string;

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
      singleEditionImplementation = singleEditionImplementationAddress;
      generalImplementation = generalImplementationAddress;

      const mintManagerOwnerBased = mintManager.connect(mintManagerOwner);

      await expect(mintManagerOwnerBased.addPlatformExecutor(additionalPlatformExecutor.address)).to.emit(
        mintManagerOwnerBased,
        "PlatformExecutorChanged",
      );
      expect(await mintManagerOwnerBased.platformExecutors()).to.include(additionalPlatformExecutor.address);
    });
    it("Should be able deprecate platform executor as Owner", async () => {
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
      await expect(mintManager.addPlatformExecutor(additionalPlatformExecutor.address)).to.emit(
        mintManager,
        "PlatformExecutorChanged",
      );
      expect(await mintManager.platformExecutors()).to.include(additionalPlatformExecutor.address);

      //deprecate platform executor
      await expect(mintManager.deprecatePlatformExecutor(additionalPlatformExecutor.address)).to.emit(
        mintManager,
        "PlatformExecutorChanged",
      );
      expect(await mintManager.platformExecutors()).to.not.include(additionalPlatformExecutor.address);
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
      await expect(mintManager.addPlatformExecutor(ethers.constants.AddressZero)).to.be.revertedWith(
        "Cannot set to null address",
      );
      expect(await mintManager.platformExecutors()).to.not.include(ethers.constants.AddressZero);
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
      await expect(mintManager.addPlatformExecutor(additionalPlatformExecutor.address)).to.emit(
        mintManager,
        "PlatformExecutorChanged",
      );
      expect(await mintManager.platformExecutors()).to.include(additionalPlatformExecutor.address);
      await expect(mintManager.addPlatformExecutor(additionalPlatformExecutor.address)).to.be.revertedWith(
        "Already added",
      );
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

      //Add platform executor
      await expect(mintManagerForFan1.addPlatformExecutor(additionalPlatformExecutor.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      expect(await mintManager.platformExecutors()).to.not.include(additionalPlatformExecutor.address);

      //deprecate platform executor
      await expect(mintManagerForFan1.deprecatePlatformExecutor(initialPlatformExecutor.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      expect(await mintManager.platformExecutors()).to.include(initialPlatformExecutor.address);
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
        await expect(mintManagerForFan1.gatedSeriesMint(claim, signature, fan1.address)).to.be.revertedWith(
          "Invalid mint fee",
        );
        await expect(
          mintManagerForFan1.gatedSeriesMint(claim, signature, fan1.address, {
            value: mintFeeWei.mul(claim.numTokensToMint),
          }),
        ).to.emit(general, "Transfer");
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
        ).to.be.revertedWith("Invalid amount");
        await expect(
          mintManagerForFan1.gatedSeriesMint(claim, signature, fan1.address, {
            value: ethers.utils.parseEther("0.09"),
          }),
        ).to.be.revertedWith("Invalid amount");
        await expect(mintManagerForFan1.gatedSeriesMint(claim, signature, fan1.address)).to.be.revertedWith(
          "Invalid amount",
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
        const mintManagerForFan1 = mintManager.connect(fan1);
        await expect(
          mintManagerForFan1.gatedSeriesMintChooseToken(claim, signature, fan1.address, [1]),
        ).to.be.revertedWith("Invalid mint fee");
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
        ).to.be.revertedWith("Invalid amount");
        await expect(
          mintManagerForFan1.gatedSeriesMintChooseToken(claim, signature, fan1.address, [2, 3], {
            value: ethers.utils.parseEther("0.02"),
          }),
        ).to.be.revertedWith("Invalid amount");
        await expect(
          mintManagerForFan1.gatedSeriesMintChooseToken(claim, signature, fan1.address, [2, 3]),
        ).to.be.revertedWith("Invalid amount");
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
        expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4, 2])).to.be.false;
        await expect(
          mintManagerForFan1.gatedSeriesMintChooseToken(claim, signature, fan1.address, [4, 2], {
            value: mintFeeWei.mul(2),
          }),
        ).to.be.revertedWith("ERC721: token minted");
      });

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
        expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4])).to.be.false;
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
        expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4, 5])).to.be.false;
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
        expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4, 5])).to.be.false;
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
        expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4])).to.be.false;
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
        expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4])).to.be.false;
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
        expect(await mintManagerForFan1.verifySeriesClaim(claim, signature, fan1.address, [4])).to.be.false;
      });
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
          ).to.be.revertedWith("Invalid amount");
          await expect(
            mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address, {
              value: claim.pricePerToken,
            }),
          ).to.be.revertedWith("Invalid amount");
          await expect(mintManagerForFan1.gatedMintEdition721(claim, signature, fan1.address)).to.be.revertedWith(
            "Invalid amount",
          );
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
          await expect(mintManagerForFan1.gatedMintPaymentPacketEdition721(claim, signature, fan1.address)).to.emit(
            singleEdition,
            "Transfer",
          );
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
          ).to.be.revertedWith("Invalid claim");
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
          ).to.be.revertedWith("Invalid claim");
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
          ).to.be.revertedWith("Sold out");
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
          ).to.be.revertedWith("Invalid claim");
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
          ).to.be.revertedWith("Invalid claim");
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
          ).to.be.revertedWith("Sold out");
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
      const vector = SAMPLE_VECTOR_1(singleEdition.address, editionsOwner.address);
      const vectorMutability = SAMPLE_VECTOR_MUTABILITY_1();
      await expect(mintManagerForEditionOwner.createVector(vector, vectorMutability, 0)).to.emit(
        mintManagerForEditionOwner,
        "VectorCreated",
      );
      vectorId += 1;
    });
    it("Should not be able to update vector when frozen", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_VECTOR_1(singleEdition.address, editionsOwner.address);
      const vectorMutability = SAMPLE_VECTOR_MUTABILITY_1(0, 0, 1);
      await (await mintManagerForEditionOwner.createVector(vector, vectorMutability, 0)).wait();
      await expect(mintManagerForEditionOwner.updateVector(vectorId, vector)).to.be.revertedWith("Updates frozen");
      vectorId += 1;
    });
    it("Should be able to update vector for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_VECTOR_1(singleEdition.address, editionsOwner.address);
      const vectorMutability = SAMPLE_VECTOR_MUTABILITY_1();
      await (await mintManagerForEditionOwner.createVector(vector, vectorMutability, 0)).wait();
      await expect(mintManagerForEditionOwner.updateVector(vectorId, vector)).to.emit(
        mintManagerForEditionOwner,
        "VectorUpdated",
      );
      vectorId += 1;
    });
    it("Should not be able to delete vector when frozen for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_VECTOR_1(singleEdition.address, editionsOwner.address);
      const vectorMutability = SAMPLE_VECTOR_MUTABILITY_1(1, 0, 0);
      await (await mintManagerForEditionOwner.createVector(vector, vectorMutability, 0)).wait();
      await expect(mintManagerForEditionOwner.deleteVector(vectorId)).to.be.revertedWith("Delete frozen");
      vectorId += 1;
    });
    it("Should be able to delete vector for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_VECTOR_1(singleEdition.address, editionsOwner.address);
      const vectorMutability = SAMPLE_VECTOR_MUTABILITY_1();
      await (await mintManagerForEditionOwner.createVector(vector, vectorMutability, 0)).wait();
      await expect(mintManagerForEditionOwner.deleteVector(vectorId)).to.emit(
        mintManagerForEditionOwner,
        "VectorDeleted",
      );
      vectorId += 1;
    });
    it("Should not be able to pause vector when frozen for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_VECTOR_1(singleEdition.address, editionsOwner.address);
      const vectorMutability = SAMPLE_VECTOR_MUTABILITY_1(0, 1, 0);
      await (await mintManagerForEditionOwner.createVector(vector, vectorMutability, 0)).wait();
      await expect(mintManagerForEditionOwner.pauseVector(vectorId)).to.be.revertedWith("Pauses frozen");
      vectorId += 1;
    });
    it("Should be able to pause vector for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_VECTOR_1(singleEdition.address, editionsOwner.address);
      const vectorMutability = SAMPLE_VECTOR_MUTABILITY_1();
      await (await mintManagerForEditionOwner.createVector(vector, vectorMutability, 0)).wait();
      await expect(mintManagerForEditionOwner.pauseVector(vectorId)).to.emit(
        mintManagerForEditionOwner,
        "VectorPausedOrUnpaused",
      );
      vectorId += 1;
    });
    it("Should be able to pause vector for contract by Owner", async () => {
      const mintManagerForEditionOwner = await mintManager.connect(editionsOwner);
      const vector = SAMPLE_VECTOR_1(singleEdition.address, editionsOwner.address);
      vector.paused = 1;
      const vectorMutability = SAMPLE_VECTOR_MUTABILITY_1();
      await (await mintManagerForEditionOwner.createVector(vector, vectorMutability, 0)).wait();
      await expect(mintManagerForEditionOwner.unpauseVector(vectorId)).to.emit(
        mintManagerForEditionOwner,
        "VectorPausedOrUnpaused",
      );
      vectorId += 1;
    });
    it("Should reject all vector interactions for contract by non Owner", async () => {
      const vector = SAMPLE_VECTOR_1(singleEdition.address, editionsOwner.address);
      const vectorMutability = SAMPLE_VECTOR_MUTABILITY_1();
      const mintManagerForEditionOwner = mintManager.connect(editionsOwner);
      await (await mintManagerForEditionOwner.createVector(vector, vectorMutability, 0)).wait();
      mintManager = mintManager.connect(fan1);
      await expect(mintManager.createVector(vector, vectorMutability, 0)).to.be.revertedWith("Not contract owner");
      await expect(mintManager.updateVector(vectorId, vector)).to.be.revertedWith("Not contract owner");
      await expect(mintManager.updateVectorMutability(vectorId, vectorMutability)).to.be.revertedWith(
        "Not contract owner",
      );
      await expect(mintManager.pauseVector(vectorId)).to.be.revertedWith("Not contract owner");
      await expect(mintManager.unpauseVector(vectorId)).to.be.revertedWith("Not contract owner");
      await expect(mintManager.deleteVector(vectorId)).to.be.revertedWith("Not contract owner");

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

      const multipleEditionERC721 = await await setupMultipleEdition(
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
          const vector = SAMPLE_VECTOR_1(
            singleEditionERC721.address,
            editionsOwner.address,
            10,
            5,
            ethers.utils.parseEther("0.00000001").toNumber(),
          );
          const vectorMutability = SAMPLE_VECTOR_MUTABILITY_1();
          await expect(mintManagerForEditionOwner.createVector(vector, vectorMutability, 0)).to.emit(
            mintManagerForEditionOwner,
            "VectorCreated",
          );
          const mintManagerForFan1 = await mintManagerWithOwner.connect(fan1);
          await expect(mintManagerForFan1.vectorMintEdition721(1, 1, fan1.address)).to.be.revertedWith(
            "Invalid amount",
          );
          await expect(
            mintManagerForFan1.vectorMintEdition721(1, 1, fan1.address, {
              value: ethers.utils.parseEther("0.00000001"),
            }),
          ).to.be.revertedWith("Invalid amount");
          await expect(
            mintManagerForFan1.vectorMintEdition721(1, 1, fan1.address, { value: mintFeeWei }),
          ).to.be.revertedWith("Invalid amount");
          await expect(
            mintManagerForFan1.vectorMintEdition721(1, 1, fan1.address, {
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
          const vector = SAMPLE_VECTOR_1(multipleEditionERC721.address, editionsOwner.address);
          const vectorMutability = SAMPLE_VECTOR_MUTABILITY_1();
          await expect(mintManagerForEditionOwner.createVector(vector, vectorMutability, 0)).to.emit(
            mintManagerForEditionOwner,
            "VectorCreated",
          );
          mintManagerForFan1 = await mintManagerWithOwner.connect(fan1);
          meERC721 = multipleEditionERC721;
          await expect(mintManagerForFan1.vectorMintEdition721(1, 1, fan1.address)).to.be.revertedWith(
            "Invalid mint fee",
          );
        });

        it("Should be able to mint one to one recipient", async function () {
          await expect(
            mintManagerForFan1.vectorMintEdition721(1, 1, fan1.address, { value: mintFeeWei.sub(1) }),
          ).to.be.revertedWith("Invalid mint fee");

          const mintManagerForPlatform = mintManagerForFan1.connect(mintManagerOwner);
          await expect(mintManagerForPlatform.updatePlatformMintFee(mintFeeWei.sub(1))).to.not.be.reverted;

          await expect(
            mintManagerForFan1.vectorMintEdition721(1, 1, fan1.address, { value: mintFeeWei.sub(1) }),
          ).to.emit(meERC721, "Transfer");
        });
      });

      describe("Mint fee updates", function () {
        it("Non-platform accounts can't update the mint fee", async function () {
          const { mintManagerWithOwner } = await vectorMintsFixture();

          let mintManagerUnauthorized = mintManagerWithOwner.connect(fan1);
          await expect(mintManagerUnauthorized.updatePlatformMintFee(1)).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );

          mintManagerUnauthorized = mintManagerUnauthorized.connect(editionsOwner);
          await expect(mintManagerUnauthorized.updatePlatformMintFee(1)).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );

          mintManagerUnauthorized = mintManagerUnauthorized.connect(editionsMetadataOwner);
          await expect(mintManagerUnauthorized.updatePlatformMintFee(1)).to.be.revertedWith(
            "Ownable: caller is not the owner",
          );
        });
      });
    });
  });
});

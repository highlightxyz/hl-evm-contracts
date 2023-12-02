import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  AuctionManager,
  DiscreteDutchAuctionMechanic,
  ERC721EditionsDFS,
  ERC721General,
  ERC721Generative,
  ERC721SingleEditionDFS,
  MinimalForwarder,
  MintManager,
  Observability,
} from "../types";
import { SAMPLE_DA_VECTOR } from "./__utils__/data";
import { Errors } from "./__utils__/data";
import {
  dutchAuctionUpdateArgs,
  encodeDAVectorData,
  encodeMechanicVectorData,
  produceMechanicVectorId,
  setupGeneral,
  setupGenerative,
  setupMultipleEditionDFS,
  setupSingleEditionDFS,
  setupSystem,
} from "./__utils__/helpers";

describe("Mechanic mint vectors", () => {
  let initialPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    editionsOwner: SignerWithAddress,
    generalOwner: SignerWithAddress,
    fan1: SignerWithAddress;

  let observability: Observability;
  let mintManager: MintManager;
  let auctionManager: AuctionManager;
  let trustedForwarder: MinimalForwarder;
  let dutchAuction: DiscreteDutchAuctionMechanic;
  let editionsDFSImplementation: string;
  let singleEditionDFSImplementation: string;
  let generalImplementation: string;
  let generativeImplementation: string;

  let generative: ERC721Generative;
  let editions: ERC721EditionsDFS;
  let singleEdition: ERC721SingleEditionDFS;
  let general: ERC721General;

  let generativeVectorId: string;
  let editionsVectorId: string;
  let singleEditionVectorId: string;
  let generalVectorId: string;

  const prices1 = ["0.001", "0.0001"];
  const prices2 = ["100", "0.189", "0.09", "0.08", "0.07", "0.06", "0.05", "0.00001"];
  const prices3 = ["0.00000000001", "0.0000000000000001"];
  const prices4: string[] = [];

  const mintFeeWei = ethers.BigNumber.from("800000000000000");

  before(async () => {
    [
      initialPlatformExecutor,
      mintManagerOwner,
      editionsMetadataOwner,
      platformPaymentAddress,
      editionsOwner,
      generalOwner,
      fan1,
    ] = await ethers.getSigners();

    const {
      mintManagerProxy,
      minimalForwarder,
      auctionManagerProxy,
      observability: observabilityInstance,
      editionsDFSImplementationAddress,
      singleEditionDFSImplementationAddress,
      generalImplementationAddress,
      generativeImplementationAddress,
      daMechanic,
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
    editionsDFSImplementation = editionsDFSImplementationAddress;
    singleEditionDFSImplementation = singleEditionDFSImplementationAddress;
    generalImplementation = generalImplementationAddress;
    generativeImplementation = generativeImplementationAddress;
    dutchAuction = daMechanic;
  });

  // in this, validate that contract deployments with mechanic vector registration works
  beforeEach(async function () {
    for (let i = 0; i < 30; i++) {
      prices4[i] = (1 - i * ((1 - 0.08) / 30)).toString();
    }

    const vector1 = SAMPLE_DA_VECTOR(dutchAuction.address, {});
    const vector2 = SAMPLE_DA_VECTOR(dutchAuction.address, { prices: prices2 });
    const vector3 = SAMPLE_DA_VECTOR(dutchAuction.address, { prices: prices3 });
    const vector4 = SAMPLE_DA_VECTOR(dutchAuction.address, { prices: prices4, periodDuration: 10000 });

    singleEdition = await setupSingleEditionDFS(
      observability.address,
      singleEditionDFSImplementation,
      mintManager.address,
      trustedForwarder.address,
      editionsOwner,
      5,
      "",
      "NM",
      null,
      vector1,
    );

    editions = await setupMultipleEditionDFS(
      observability.address,
      editionsDFSImplementation,
      mintManager.address,
      auctionManager.address,
      trustedForwarder.address,
      editionsOwner,
      100,
      "symbol",
      null,
      vector2,
    );

    general = await setupGeneral(
      observability.address,
      generalImplementation,
      trustedForwarder.address,
      mintManager.address,
      generalOwner,
      null,
      vector3,
      true,
    );

    generative = await setupGenerative(
      observability.address,
      generativeImplementation,
      trustedForwarder.address,
      mintManager.address,
      generalOwner,
      null,
      vector4,
    );

    singleEditionVectorId = produceMechanicVectorId(
      singleEdition.address,
      dutchAuction.address,
      parseInt(vector1.seed),
      0,
    );
    editionsVectorId = produceMechanicVectorId(editions.address, dutchAuction.address, parseInt(vector2.seed), 0);
    generalVectorId = produceMechanicVectorId(general.address, dutchAuction.address, parseInt(vector3.seed));
    generativeVectorId = produceMechanicVectorId(generative.address, dutchAuction.address, parseInt(vector4.seed));

    const vectorMeta1 = await mintManager.mechanicVectorMetadata(singleEditionVectorId);
    const vectorMeta2 = await mintManager.mechanicVectorMetadata(editionsVectorId);
    const vectorMeta3 = await mintManager.mechanicVectorMetadata(generalVectorId);
    const vectorMeta4 = await mintManager.mechanicVectorMetadata(generativeVectorId);
    expect(ethers.utils.getAddress(vectorMeta1.contractAddress)).to.equal(
      ethers.utils.getAddress(singleEdition.address),
    );
    expect(ethers.utils.getAddress(vectorMeta2.contractAddress)).to.equal(ethers.utils.getAddress(editions.address));
    expect(ethers.utils.getAddress(vectorMeta3.contractAddress)).to.equal(ethers.utils.getAddress(general.address));
    expect(ethers.utils.getAddress(vectorMeta4.contractAddress)).to.equal(ethers.utils.getAddress(generative.address));

    const daState1 = await dutchAuction.getVectorState(singleEditionVectorId);
    const daState2 = await dutchAuction.getVectorState(editionsVectorId);
    const daState3 = await dutchAuction.getVectorState(generalVectorId);
    const daState4 = await dutchAuction.getVectorState(generativeVectorId);

    expect(daState1._vector.numPrices.toString()).to.equal(prices1.length.toString());
    expect(
      daState1.prices.map(price => {
        return parseFloat(ethers.utils.formatEther(price));
      }),
    ).to.eql(
      prices1.map(price => {
        return parseFloat(price);
      }),
    );
    expect(daState2._vector.numPrices.toString()).to.equal(prices2.length.toString());
    expect(
      daState2.prices.map(price => {
        return parseFloat(ethers.utils.formatEther(price));
      }),
    ).to.eql(
      prices2.map(price => {
        return parseFloat(price);
      }),
    );
    expect(daState3._vector.numPrices.toString()).to.equal(prices3.length.toString());
    expect(
      daState3.prices.map(price => {
        return parseFloat(ethers.utils.formatEther(price));
      }),
    ).to.eql(
      prices3.map(price => {
        return parseFloat(price);
      }),
    );
    expect(daState4._vector.numPrices.toString()).to.equal(prices4.length.toString());
    expect(
      daState4.prices.map(price => {
        return parseFloat(ethers.utils.formatEther(price));
      }),
    ).to.eql(
      prices4.map(price => {
        return parseFloat(price);
      }),
    );
  });

  describe("Mechanic vector management", function () {
    it("Only the owner of a collection can register mechanic mint vectors", async function () {
      const seed = Math.floor(Date.now() / 1000);
      const vectorData = encodeMechanicVectorData(
        mintManager.address,
        fan1.address,
        SAMPLE_DA_VECTOR(dutchAuction.address, {}),
      );
      mintManager = mintManager.connect(fan1);
      await expect(
        mintManager.registerMechanicVector(
          {
            contractAddress: editions.address,
            editionId: 1,
            isChoose: false,
            paused: false,
            mechanic: dutchAuction.address,
            isEditionBased: true,
          },
          seed,
          vectorData,
        ),
      ).to.be.revertedWithCustomError(mintManager, Errors.Unauthorized);

      mintManager = mintManager.connect(generalOwner);
    });

    it("Only the owner can pause/unpause mechanic mint vectors, which cause the mints to be paused/unpaused", async function () {
      // do with both mechanicMintNum and mechanicMintChoose
      await expect(
        mintManager.mechanicMintNum(generativeVectorId, fan1.address, 2, "0x", {
          value: mintFeeWei.add(ethers.utils.parseEther(prices4[0])).mul(2),
        }),
      )
        .to.emit(mintManager, "NumTokenMint")
        .withArgs(generativeVectorId, generative.address, true, 2);
      await expect(
        mintManager.mechanicMintChoose(generalVectorId, fan1.address, [1, 2], "0x", {
          value: mintFeeWei.add(ethers.utils.parseEther(prices3[0])).mul(2),
        }),
      )
        .to.emit(mintManager, "ChooseTokenMint")
        .withArgs(generalVectorId, general.address, true, [1, 2]);

      await expect(mintManager.setPauseOnMechanicMintVector(generativeVectorId, true)).to.be.not.reverted;
      await expect(mintManager.setPauseOnMechanicMintVector(generalVectorId, true)).to.be.not.reverted;

      await expect(
        mintManager.mechanicMintNum(generativeVectorId, fan1.address, 2, "0x", {
          value: ethers.utils.parseEther("0.0008").mul(2),
        }),
      ).to.be.revertedWithCustomError(mintManager, Errors.MechanicPaused);
      await expect(
        mintManager.mechanicMintChoose(generalVectorId, fan1.address, [3], "0x", {
          value: ethers.utils.parseEther("0.0008").mul(2),
        }),
      ).to.be.revertedWithCustomError(mintManager, Errors.MechanicPaused);
    });

    it("Cannot try the wrong mint style", async function () {
      await expect(
        mintManager.mechanicMintNum(generalVectorId, fan1.address, 2, "0x", {
          value: ethers.utils.parseEther("0.0008").mul(2),
        }),
      ).to.be.revertedWithCustomError(mintManager, Errors.InvalidMechanic);
      await expect(
        mintManager.mechanicMintChoose(generativeVectorId, fan1.address, [3], "0x", {
          value: ethers.utils.parseEther("0.0008").mul(2),
        }),
      ).to.be.revertedWithCustomError(mintManager, Errors.InvalidMechanic);
    });

    describe("Dutch auction mechanic vector management", function () {
      it("Can register/create dutch auction mechanic mint vectors with different configurations", async function () {
        mintManager = mintManager.connect(editionsOwner);
        const editionId = 0;
        const seed = 1;

        await expect(
          mintManager.registerMechanicVector(
            {
              contractAddress: editions.address,
              editionId,
              isChoose: false,
              paused: false,
              mechanic: dutchAuction.address,
              isEditionBased: true,
            },
            seed,
            encodeDAVectorData(
              SAMPLE_DA_VECTOR(dutchAuction.address, {
                prices: ["0.001", "0.0001", "0.00009"],
                periodDuration: 10,
                maxTotalClaimableViaVector: 20,
                startTimestamp: Math.floor(Date.now() / 1000) + 1000,
                endTimestamp: Math.floor(Date.now() / 1000) + 1021, // 21 sec dutch auction / 2 periods of 10 sec each + 1 last period of 1 sec
              }),
              editionsOwner.address,
            ),
          ),
        )
          .to.emit(dutchAuction, "DiscreteDutchAuctionCreated")
          .withArgs(produceMechanicVectorId(editions.address, dutchAuction.address, seed, editionId));
      });

      it("Cannot register/create dutch auction mechanic mint vectors with invalid configurations", async function () {
        const editionId = 0;
        const seed = 1;

        await expect(
          mintManager.registerMechanicVector(
            {
              contractAddress: editions.address,
              editionId,
              isChoose: false,
              paused: false,
              mechanic: dutchAuction.address,
              isEditionBased: true,
            },
            seed,
            encodeDAVectorData(
              SAMPLE_DA_VECTOR(dutchAuction.address, {
                prices: ["0.001", "0.0001", "0.00009"],
                periodDuration: 10,
                maxTotalClaimableViaVector: 20,
                startTimestamp: Math.floor(Date.now() / 1000) + 1000,
                endTimestamp: Math.floor(Date.now() / 1000) + 1020, // invalid, no time for last period
              }),
              editionsOwner.address,
            ),
          ),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidVectorConfig);

        await expect(
          mintManager.registerMechanicVector(
            {
              contractAddress: editions.address,
              editionId,
              isChoose: false,
              paused: false,
              mechanic: dutchAuction.address,
              isEditionBased: true,
            },
            seed,
            encodeDAVectorData(SAMPLE_DA_VECTOR(dutchAuction.address, {}), ethers.constants.AddressZero),
          ),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidVectorConfig);

        await expect(
          mintManager.registerMechanicVector(
            {
              contractAddress: editions.address,
              editionId,
              isChoose: false,
              paused: false,
              mechanic: dutchAuction.address,
              isEditionBased: true,
            },
            seed,
            encodeDAVectorData(
              SAMPLE_DA_VECTOR(dutchAuction.address, {
                periodDuration: 0,
              }),
              ethers.constants.AddressZero,
            ),
          ),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidVectorConfig);

        await expect(
          mintManager.registerMechanicVector(
            {
              contractAddress: editions.address,
              editionId,
              isChoose: false,
              paused: false,
              mechanic: dutchAuction.address,
              isEditionBased: true,
            },
            seed,
            encodeDAVectorData(
              SAMPLE_DA_VECTOR(dutchAuction.address, {
                prices: ["0.001"],
              }),
              ethers.constants.AddressZero,
            ),
          ),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidVectorConfig);

        await expect(
          mintManager.registerMechanicVector(
            {
              contractAddress: editions.address,
              editionId,
              isChoose: false,
              paused: false,
              mechanic: dutchAuction.address,
              isEditionBased: true,
            },
            seed,
            encodeDAVectorData(
              SAMPLE_DA_VECTOR(dutchAuction.address, {
                prices: ["0.001", "0.0001", "0.01"],
              }),
              ethers.constants.AddressZero,
            ),
          ),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidVectorConfig);

        await expect(
          mintManager.registerMechanicVector(
            {
              contractAddress: editions.address,
              editionId,
              isChoose: false,
              paused: false,
              mechanic: dutchAuction.address,
              isEditionBased: true,
            },
            seed,
            encodeDAVectorData(
              SAMPLE_DA_VECTOR(dutchAuction.address, {
                prices: ["0.001", "0.0001", "0.0001"],
              }),
              ethers.constants.AddressZero,
            ),
          ),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidVectorConfig);
      });

      it("Non-owner of collection cannot update dutch auction", async function () {
        dutchAuction = dutchAuction.connect(fan1);
        const {
          dutchAuction: dutchAuction1,
          updateConfig: updateConfig1,
          packedPrices: packedPrices1,
        } = dutchAuctionUpdateArgs({
          prices: ["0.1", "0.0001", "0.00001"],
        });
        await expect(
          dutchAuction.updateVector(generativeVectorId, dutchAuction1, packedPrices1, updateConfig1),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.Unauthorized);
      });

      it("Can update auction mechanic mint vectors with different configurations", async function () {
        dutchAuction = dutchAuction.connect(generalOwner);
        const {
          numPrices: da1NumPrices,
          bytesPerPrice: da1BytesPerPrice,
          periodDuration: da1PeriodDuration,
          tokenLimitPerTx: da1TokenLimitPerTx,
          endTimestamp: da1EndTimestamp,
        } = (await dutchAuction.getRawVector(generativeVectorId))._vector;
        const {
          dutchAuction: dutchAuction1,
          updateConfig: updateConfig1,
          packedPrices: packedPrices1,
        } = dutchAuctionUpdateArgs({
          prices: ["1000", "0.0001", "0.00001"],
        });
        // none of periodDuration, tokenLimitPerTx, endTimestamp should update
        await expect(
          dutchAuction.updateVector(
            generativeVectorId,
            { ...dutchAuction1, periodDuration: 5, tokenLimitPerTx: 10, endTimestamp: 100 },
            packedPrices1,
            updateConfig1,
          ),
        )
          .to.emit(dutchAuction, "DiscreteDutchAuctionUpdated")
          .withArgs(generativeVectorId);
        const {
          numPrices: da1NewNumPrices,
          bytesPerPrice: da1NewBytesPerPrice,
          periodDuration: da1NewPeriodDuration,
          tokenLimitPerTx: da1NewTokenLimitPerTx,
          endTimestamp: da1NewEndTimestamp,
        } = (await dutchAuction.getRawVector(generativeVectorId))._vector;
        const newPackedPrices = (await dutchAuction.getRawVector(generativeVectorId)).packedPrices;
        expect(da1NumPrices.toString()).to.not.equal(da1NewNumPrices.toString());
        expect(da1NewNumPrices.toString()).to.equal("3");
        expect(da1BytesPerPrice.toString()).to.not.equal(da1NewBytesPerPrice.toString());
        expect(da1PeriodDuration.toString()).to.equal(da1NewPeriodDuration.toString());
        expect(da1TokenLimitPerTx.toString()).to.equal(da1NewTokenLimitPerTx.toString());
        expect(da1EndTimestamp.toString()).to.equal(da1NewEndTimestamp.toString());
        expect(packedPrices1).to.eql(newPackedPrices);
        expect(
          (await dutchAuction.getVectorState(generativeVectorId)).prices.map(price => {
            return ethers.utils.formatEther(price);
          }),
        ).to.eql(["1000.0", "0.0001", "0.00001"]);

        const {
          dutchAuction: dutchAuction2,
          updateConfig: updateConfig2,
          packedPrices: packedPrices2,
        } = dutchAuctionUpdateArgs({
          startTimestamp: 10000,
          endTimestamp: 20000,
          periodDuration: 334, // 30 periods, so 334 x 30 = 10020, on limit
          maxUserClaimableViaVector: 5,
          maxTotalClaimableViaVector: 10,
          tokenLimitPerTx: 5,
          paymentRecipient: fan1.address,
        });
        await expect(dutchAuction.updateVector(generativeVectorId, dutchAuction2, packedPrices2, updateConfig2))
          .to.emit(dutchAuction, "DiscreteDutchAuctionUpdated")
          .withArgs(generativeVectorId);
        const {
          startTimestamp: da2NewStartTimestamp,
          endTimestamp: da2NewEndTimestamp,
          periodDuration: da2NewPeriodDuration,
          maxUserClaimableViaVector: da2NewMaxUserClaimableViaVector,
          maxTotalClaimableViaVector: da2NewMaxTotalClaimableViaVector,
          tokenLimitPerTx: da2NewTokenLimitPerTx,
          paymentRecipient: da2NewPaymentRecipient,
        } = (await dutchAuction.getRawVector(generativeVectorId))._vector;

        expect(da2NewStartTimestamp.toString()).to.equal("10000");
        expect(da2NewEndTimestamp.toString()).to.equal("20000");
        expect(da2NewPeriodDuration.toString()).to.equal("334");
        expect(da2NewMaxUserClaimableViaVector.toString()).to.equal("5");
        expect(da2NewMaxTotalClaimableViaVector.toString()).to.equal("10");
        expect(da2NewTokenLimitPerTx.toString()).to.equal("5");
        expect(ethers.utils.getAddress(da2NewPaymentRecipient)).to.equal(ethers.utils.getAddress(fan1.address));
      });

      it("Cannot update dutch auction to set a time range that exceeds or equals (numPrices - 1) * periodDuration", async function () {
        // cannot set invalid times, given there are 30 prices
        const {
          dutchAuction: dutchAuction1,
          updateConfig: updateConfig1,
          packedPrices: packedPrices1,
        } = dutchAuctionUpdateArgs({
          periodDuration: 10,
          startTimestamp: 20,
          endTimestamp: 310,
        });
        await expect(
          dutchAuction.updateVector(generativeVectorId, dutchAuction1, packedPrices1, updateConfig1),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidVectorConfig);
      });

      it("Cannot update dutch auction with non-decreasing prices", async function () {
        const {
          dutchAuction: dutchAuctionData,
          updateConfig,
          packedPrices,
        } = dutchAuctionUpdateArgs({
          prices: ["0.001", "0.001"],
        });
        await expect(
          dutchAuction.updateVector(generativeVectorId, dutchAuctionData, packedPrices, updateConfig),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidVectorConfig);
      });

      it("Cannot update dutch auction with the payment recipient as the zero address", async function () {
        const {
          dutchAuction: dutchAuction3,
          updateConfig: updateConfig3,
          packedPrices: packedPrices3,
        } = dutchAuctionUpdateArgs({
          paymentRecipient: ethers.constants.AddressZero,
        });
        await expect(
          dutchAuction.updateVector(generativeVectorId, dutchAuction3, packedPrices3, updateConfig3),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidVectorConfig);
      });

      it("Cannot update dutch auction to make period duration 0", async function () {
        const {
          dutchAuction: dutchAuction3,
          updateConfig: updateConfig3,
          packedPrices: packedPrices3,
        } = dutchAuctionUpdateArgs({
          periodDuration: 0,
        });
        await expect(
          dutchAuction.updateVector(generativeVectorId, dutchAuction3, packedPrices3, updateConfig3),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidVectorConfig);
      });

      describe("Cannot update certain fields on dutch auction after first token is minted", function () {
        beforeEach(async function () {
          await expect(
            mintManager.mechanicMintNum(generativeVectorId, fan1.address, 2, "0x", {
              value: mintFeeWei.add(ethers.utils.parseEther("1")).mul(2),
            }),
          ).to.emit(mintManager, "NumTokenMint");

          const { _vector, payeePotentialEscrowedFunds, currentPrice } = await dutchAuction.getVectorState(
            generativeVectorId,
          );
          expect(_vector.lowestPriceSoldAtIndex).to.equal(0);
          expect(_vector.currentSupply).to.equal(2);
          expect(ethers.utils.formatEther(_vector.totalSales)).to.equal("2.0");
          expect(ethers.utils.formatEther(currentPrice)).to.equal("1.0");
          expect(ethers.utils.formatEther(payeePotentialEscrowedFunds)).to.equal("2.0");
        });

        it("maxTotalClaimableViaVector", async function () {
          const {
            dutchAuction: dutchAuctionData,
            updateConfig,
            packedPrices,
          } = dutchAuctionUpdateArgs({
            maxTotalClaimableViaVector: 30,
          });
          await expect(
            dutchAuction.updateVector(generativeVectorId, dutchAuctionData, packedPrices, updateConfig),
          ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidUpdate);
        });

        it("prices", async function () {
          const {
            dutchAuction: dutchAuctionData,
            updateConfig,
            packedPrices,
          } = dutchAuctionUpdateArgs({
            prices: ["0.008", "0.007"],
          });
          await expect(
            dutchAuction.updateVector(generativeVectorId, dutchAuctionData, packedPrices, updateConfig),
          ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidUpdate);
        });

        it("periodDuration", async function () {
          const {
            dutchAuction: dutchAuctionData,
            updateConfig,
            packedPrices,
          } = dutchAuctionUpdateArgs({
            periodDuration: 1001,
          });
          await expect(
            dutchAuction.updateVector(generativeVectorId, dutchAuctionData, packedPrices, updateConfig),
          ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidUpdate);
        });

        it("startTimestamp", async function () {
          const {
            dutchAuction: dutchAuctionData,
            updateConfig,
            packedPrices,
          } = dutchAuctionUpdateArgs({
            startTimestamp: 100,
          });
          await expect(
            dutchAuction.updateVector(generativeVectorId, dutchAuctionData, packedPrices, updateConfig),
          ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidUpdate);
        });
      });
    });
  });

  describe("Dutch auctions", function () {
    describe("Mints + rebates + escrow funds withdrawal (logic / state / errors)", function () {
      it("Cannot send too low of a mint fee", async function () {
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x"),
        ).to.be.revertedWithCustomError(mintManager, Errors.MintFeeTooLow);
      });

      it("Cannot send too low of a fee for the auction", async function () {
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x", { value: mintFeeWei }),
        ).to.be.revertedWithCustomError(mintManager, Errors.InvalidPaymentAmount);
      });

      it("Can only mint within the time bounds of the auction", async function () {
        dutchAuction = dutchAuction.connect(generalOwner);
        const currTime = Math.floor(Date.now() / 1000);
        const startTimestamp = currTime + 1000;
        const {
          dutchAuction: dutchAuctionData,
          updateConfig,
          packedPrices,
        } = dutchAuctionUpdateArgs({
          startTimestamp,
          endTimestamp: startTimestamp + 300000,
        });
        await expect(dutchAuction.updateVector(generativeVectorId, dutchAuctionData, packedPrices, updateConfig)).to.not
          .be.reverted;

        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther("1")),
          }),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidMint);
        await ethers.provider.send("evm_mine", [currTime + 200000]);
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther("1")),
          }),
        ).not.be.reverted;
        await ethers.provider.send("evm_mine", [currTime + 400000]);
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther("1")),
          }),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidMint);

        const currentPrice = (await dutchAuction.getVectorState(generativeVectorId)).currentPrice;
        const userInfo = await dutchAuction.getUserInfo(generativeVectorId, fan1.address);
        const rebate = userInfo[0];
        const { totalPosted } = userInfo[1];
        expect(ethers.utils.formatEther(totalPosted)).to.equal("1.0");
        expect(totalPosted.sub(currentPrice).eq(rebate)).to.equal(true);
      });

      it("Cannot mint over maxUser, maxTotal, and tokenLimitPerTx bounds", async function () {
        dutchAuction = dutchAuction.connect(generalOwner);
        const currTime = Math.floor(Date.now() / 1000);
        const {
          dutchAuction: dutchAuctionData,
          updateConfig,
          packedPrices,
        } = dutchAuctionUpdateArgs({
          maxTotalClaimableViaVector: 10,
          maxUserClaimableViaVector: 5,
          tokenLimitPerTx: 3,
          startTimestamp: currTime + 1000,
        });
        await expect(dutchAuction.updateVector(generativeVectorId, dutchAuctionData, packedPrices, updateConfig)).to.not
          .be.reverted;

        // tokenLimitPerTx
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 4, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther("1")).mul(4),
          }),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidMint);
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 3, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther("1")).mul(3),
          }),
        ).to.not.be.reverted;
        // maxUserClaimableViaVector
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 3, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther("1")).mul(3),
          }),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidMint);
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 2, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther("1")).mul(2),
          }),
        ).to.not.be.reverted;
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, generalOwner.address, 3, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther("1")).mul(3),
          }),
        ).to.not.be.reverted;
        // maxTotalClaimableViaVector
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, editionsOwner.address, 3, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther("1")).mul(3),
          }),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidMint);
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, editionsOwner.address, 2, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther("1")).mul(2),
          }),
        ).to.not.be.reverted;
      });

      it("State updates properly through multiple mints at different prices", async function () {
        dutchAuction = dutchAuction.connect(generalOwner);
        const currTime = Math.floor(Date.now() / 1000);
        const {
          dutchAuction: dutchAuctionData,
          updateConfig,
          packedPrices,
        } = dutchAuctionUpdateArgs({
          maxTotalClaimableViaVector: 15,
          startTimestamp: currTime + 1000000,
        });
        await expect(dutchAuction.updateVector(generativeVectorId, dutchAuctionData, packedPrices, updateConfig)).to.not
          .be.reverted;

        await ethers.provider.send("evm_mine", [currTime + 1000000]);
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 3, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther(prices4[0])).mul(3),
          }),
        ).to.not.be.reverted;
        await ethers.provider.send("evm_mine", [currTime + 1010000]);
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 3, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther(prices4[1])).mul(3),
          }),
        ).to.not.be.reverted;
        await ethers.provider.send("evm_mine", [currTime + 1030000]);
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 3, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther(prices4[3])).mul(3),
          }),
        ).to.not.be.reverted;

        const { _vector, currentPrice, collectionSupply, payeePotentialEscrowedFunds, escrowedFundsAmountFinalized } =
          await dutchAuction.getVectorState(generativeVectorId);
        expect(_vector.currentSupply).to.equal(9);
        expect(ethers.utils.formatEther(currentPrice)).to.equal(prices4[3]);
        expect(collectionSupply.toString()).to.equal("9");
        expect(payeePotentialEscrowedFunds.toString()).to.eql(ethers.utils.parseEther(prices4[3]).mul(9).toString());
        expect(escrowedFundsAmountFinalized).to.equal(false);
        expect(_vector.totalSales.toString()).to.equal(
          ethers.utils
            .parseEther(prices4[0])
            .add(ethers.utils.parseEther(prices4[1]))
            .add(ethers.utils.parseEther(prices4[3]))
            .mul(3)
            .toString(),
        );
        await ethers.provider.send("evm_mine", [currTime + 1040000]);
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, generalOwner.address, 5, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther(prices4[4])).mul(5),
          }),
        ).to.not.be.reverted;

        expect((await dutchAuction.getVectorState(generativeVectorId))._vector.lowestPriceSoldAtIndex).to.equal(4);

        await ethers.provider.send("evm_mine", [currTime + 1090000]);

        await expect(
          mintManager.mechanicMintNum(generativeVectorId, generalOwner.address, 1, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther(prices4[9])).mul(1),
          }),
        ).to.not.be.reverted;

        expect((await dutchAuction.getVectorState(generativeVectorId))._vector.lowestPriceSoldAtIndex).to.equal(9);

        const contractBalance = await ethers.provider.getBalance(dutchAuction.address);
        const collectorBalance = await ethers.provider.getBalance(generalOwner.address);
        const userInfo = await dutchAuction.getUserInfo(generativeVectorId, generalOwner.address);
        expect(userInfo[0].toString()).to.equal(
          ethers.utils.parseEther(prices4[4]).sub(ethers.utils.parseEther(prices4[9])).mul(5).toString(),
        );
        const generalOwnerTotalPosted = ethers.utils
          .parseEther(prices4[4])
          .mul(5)
          .add(ethers.utils.parseEther(prices4[9]));
        expect(userInfo[1].totalPosted.toString()).to.equal(generalOwnerTotalPosted.toString());

        // collect rebate
        await expect(dutchAuction.rebateCollector(generativeVectorId, generalOwner.address))
          .to.emit(dutchAuction, "DiscreteDutchAuctionCollectorRebate")
          .withArgs(
            generativeVectorId,
            generalOwner.address,
            userInfo[0],
            (
              await dutchAuction.getVectorState(generativeVectorId)
            ).currentPrice,
          );

        // validate 2 balances difference
        expect((await ethers.provider.getBalance(dutchAuction.address)).eq(contractBalance.sub(userInfo[0]))).to.equal(
          true,
        );
        // over 90% of the rebate (consider ether lost to gas)
        const newCollectorBalance = await ethers.provider.getBalance(generalOwner.address);
        expect(newCollectorBalance.lt(collectorBalance.add(userInfo[0]))).to.equal(true);
        expect(newCollectorBalance.gt(collectorBalance.add(userInfo[0]).mul(9).div(10))).to.equal(true);

        const state = await dutchAuction.getVectorState(generativeVectorId);
        const [rebateGeneralOwner, newUserInfoGeneralOwner] = await dutchAuction.getUserInfo(
          generativeVectorId,
          generalOwner.address,
        );
        const [rebateFan1, newUserInfoFan1] = await dutchAuction.getUserInfo(generativeVectorId, fan1.address);
        expect(state.escrowedFundsAmountFinalized).to.equal(true);
        expect(state.payeePotentialEscrowedFunds.toString()).to.equal(
          ethers.utils.parseEther(prices4[9]).mul(15).toString(),
        );
        expect(rebateGeneralOwner.eq(0)).to.equal(true);
        expect(newUserInfoGeneralOwner.totalPosted.eq(generalOwnerTotalPosted.sub(userInfo[0]))).to.equal(true); // new totalPosted = old totalPosted - rebate paid out
        expect(newUserInfoGeneralOwner.numRebates).to.equal(1);
        expect(newUserInfoGeneralOwner.numTokensBought).to.equal(6);
        const fan1TotalPosted = ethers.utils
          .parseEther(prices4[0])
          .add(ethers.utils.parseEther(prices4[1]))
          .add(ethers.utils.parseEther(prices4[3]))
          .mul(3);
        expect(newUserInfoFan1.totalPosted.eq(fan1TotalPosted)).to.equal(true);
        expect(rebateFan1.eq(fan1TotalPosted.sub(ethers.utils.parseEther(prices4[9]).mul(9)))).to.equal(true);
        expect(newUserInfoFan1.numRebates).to.equal(0);
        expect(newUserInfoFan1.numTokensBought).to.equal(9);

        expect(state._vector.auctionExhausted).to.equal(true);
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x", {
            value: mintFeeWei.add(state.currentPrice),
          }),
        ).to.be.revertedWithCustomError(dutchAuction, Errors.InvalidMint);
      });

      it("Underlying collection is exhausted and we validly withdraws escrowed funds", async function () {
        dutchAuction = dutchAuction.connect(generalOwner);
        const currTime = Math.floor(Date.now() / 1000);
        generative = generative.connect(generalOwner);
        await expect(generative.setLimitSupply(1)).to.not.be.reverted;

        const {
          dutchAuction: dutchAuctionData,
          updateConfig,
          packedPrices,
        } = dutchAuctionUpdateArgs({
          maxTotalClaimableViaVector: 15,
          startTimestamp: currTime + 2000000,
        });
        await expect(dutchAuction.updateVector(generativeVectorId, dutchAuctionData, packedPrices, updateConfig)).to.not
          .be.reverted;

        await ethers.provider.send("evm_mine", [currTime + 2000000]);
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther(prices4[0])),
          }),
        ).to.not.be.reverted;

        // cannot trigger a rebate if user isn't eligible
        expect((await dutchAuction.getUserInfo(generativeVectorId, fan1.address))[0].eq(0)).to.equal(true);
        await expect(dutchAuction.rebateCollector(generativeVectorId, fan1.address)).to.be.revertedWithCustomError(
          dutchAuction,
          Errors.CollectorNotOwedRebate,
        );

        const state = await dutchAuction.getVectorState(generativeVectorId);
        expect(state.auctionExhausted).to.equal(true);
        expect(state.escrowedFundsAmountFinalized).to.equal(true);
        expect(state.payeePotentialEscrowedFunds.eq(ethers.utils.parseEther("1"))).to.equal(true);
        expect(state._vector.lowestPriceSoldAtIndex).eq(0);

        dutchAuction = dutchAuction.connect(fan1);
        const contractBalance = await ethers.provider.getBalance(dutchAuction.address);
        const payeeBalance = await ethers.provider.getBalance(state._vector.paymentRecipient);
        await expect(dutchAuction.withdrawDPPFunds(generativeVectorId))
          .to.emit(dutchAuction, "DiscreteDutchAuctionDPPFundsWithdrawn")
          .withArgs(generativeVectorId, state._vector.paymentRecipient, ethers.utils.parseEther("1.0"), 1);
        expect(
          (await ethers.provider.getBalance(dutchAuction.address)).eq(
            contractBalance.sub(ethers.utils.parseEther("1")),
          ),
        ).to.equal(true);
        expect(
          (await ethers.provider.getBalance(state._vector.paymentRecipient)).eq(
            payeeBalance.add(ethers.utils.parseEther("1")),
          ),
        ).to.equal(true);

        // cannot re-trigger a withdrawal
        expect((await dutchAuction.getVectorState(generativeVectorId))._vector.payeeRevenueHasBeenWithdrawn).to.equal(
          true,
        );
        await expect(dutchAuction.withdrawDPPFunds(generativeVectorId)).to.be.revertedWithCustomError(
          dutchAuction,
          Errors.InvalidDPPFundsWithdrawl,
        );
      });

      it("Cannot trigger a rebate for a vector with no tokens minted through it", async function () {
        await expect(dutchAuction.rebateCollector(generativeVectorId, fan1.address)).to.be.revertedWithCustomError(
          dutchAuction,
          Errors.InvalidRebate,
        );
      });

      it("Cannot trigger a withdrawal when no tokens have been minted through the vector", async function () {
        await expect(dutchAuction.withdrawDPPFunds(generativeVectorId)).to.be.revertedWithCustomError(
          dutchAuction,
          Errors.InvalidDPPFundsWithdrawl,
        );
      });

      it("Cannot trigger a withdrawal if an auction isn't exhausted or in the FPP", async function () {
        dutchAuction = dutchAuction.connect(generalOwner);
        const currTime = Math.floor(Date.now() / 1000);

        const {
          dutchAuction: dutchAuctionData,
          updateConfig,
          packedPrices,
        } = dutchAuctionUpdateArgs({
          maxTotalClaimableViaVector: 15,
          startTimestamp: currTime + 3000000,
        });
        await expect(dutchAuction.updateVector(generativeVectorId, dutchAuctionData, packedPrices, updateConfig)).to.not
          .be.reverted;
        await ethers.provider.send("evm_mine", [currTime + 3000000]);

        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther(prices4[0])),
          }),
        ).to.not.be.reverted;

        await expect(dutchAuction.withdrawDPPFunds(generativeVectorId)).to.be.revertedWithCustomError(
          dutchAuction,
          Errors.InvalidDPPFundsWithdrawl,
        );
      });

      it("Keep rebating as price drops, down to FPP (with excess amounts sent), withdraw funds, then payments go straight to payee", async function () {
        dutchAuction = dutchAuction.connect(generalOwner);
        const currTime = Math.floor(Date.now() / 1000);

        const prices = ["1", "0.8", "0.6", "0.4"];
        const {
          dutchAuction: dutchAuctionData,
          updateConfig,
          packedPrices,
        } = dutchAuctionUpdateArgs({
          maxTotalClaimableViaVector: 4,
          startTimestamp: currTime + 4000000,
          prices,
        });
        await expect(dutchAuction.updateVector(generativeVectorId, dutchAuctionData, packedPrices, updateConfig)).to.not
          .be.reverted;
        await ethers.provider.send("evm_mine", [currTime + 4000000]);

        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther(prices[0])).add(ethers.utils.parseEther("0.5")),
          }),
        ).to.not.be.reverted;
        await ethers.provider.send("evm_mine", [currTime + 4010000]);
        await expect(dutchAuction.rebateCollector(generativeVectorId, fan1.address))
          .to.emit(dutchAuction, "DiscreteDutchAuctionCollectorRebate")
          .withArgs(
            generativeVectorId,
            fan1.address,
            ethers.utils.parseEther("0.7"),
            ethers.utils.parseEther(prices[1]),
          );
        expect((await dutchAuction.getUserInfo(generativeVectorId, fan1.address))[0].eq(0)).to.equal(true);

        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther(prices[1])).add(ethers.utils.parseEther("0.5")),
          }),
        ).to.not.be.reverted;
        await ethers.provider.send("evm_mine", [currTime + 4020000]);
        await expect(dutchAuction.rebateCollector(generativeVectorId, fan1.address))
          .to.emit(dutchAuction, "DiscreteDutchAuctionCollectorRebate")
          .withArgs(
            generativeVectorId,
            fan1.address,
            ethers.utils.parseEther("0.9"),
            ethers.utils.parseEther(prices[2]),
          );
        expect((await dutchAuction.getUserInfo(generativeVectorId, fan1.address))[0].eq(0)).to.equal(true);

        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther(prices[2])).add(ethers.utils.parseEther("0.5")),
          }),
        ).to.not.be.reverted;
        await ethers.provider.send("evm_mine", [currTime + 4030000]);
        await expect(dutchAuction.rebateCollector(generativeVectorId, fan1.address))
          .to.emit(dutchAuction, "DiscreteDutchAuctionCollectorRebate")
          .withArgs(
            generativeVectorId,
            fan1.address,
            ethers.utils.parseEther("1.1"),
            ethers.utils.parseEther(prices[3]),
          );
        expect((await dutchAuction.getUserInfo(generativeVectorId, fan1.address))[0].eq(0)).to.equal(true);

        const { _vector, auctionInFPP, auctionExhausted, escrowedFundsAmountFinalized, payeePotentialEscrowedFunds } =
          await dutchAuction.getVectorState(generativeVectorId);
        expect(_vector.currentSupply).to.equal(3);
        expect(escrowedFundsAmountFinalized).to.equal(true);
        expect(auctionExhausted).to.equal(false);
        expect(auctionInFPP).to.equal(true);
        expect(payeePotentialEscrowedFunds.eq(ethers.utils.parseEther("0.4").mul(3)));

        dutchAuction = dutchAuction.connect(fan1);
        mintManager = mintManager.connect(fan1);
        const payeeBalance = await ethers.provider.getBalance(_vector.paymentRecipient);
        await expect(dutchAuction.withdrawDPPFunds(generativeVectorId))
          .to.emit(dutchAuction, "DiscreteDutchAuctionDPPFundsWithdrawn")
          .withArgs(generativeVectorId, _vector.paymentRecipient, ethers.utils.parseEther("0.4"), 3);
        const intermediaryPayeeBalance = await ethers.provider.getBalance(_vector.paymentRecipient);
        expect(intermediaryPayeeBalance.sub(payeePotentialEscrowedFunds).eq(payeeBalance));

        // payments now go straight to payee
        await expect(
          mintManager.mechanicMintNum(generativeVectorId, fan1.address, 1, "0x", {
            value: mintFeeWei.add(ethers.utils.parseEther(prices[3])).add(ethers.utils.parseEther("0.5")),
          }),
        ).to.not.be.reverted;
        expect(
          (await ethers.provider.getBalance(_vector.paymentRecipient)).eq(
            intermediaryPayeeBalance.add(ethers.utils.parseEther("0.4")),
          ),
        );

        // can still collect rebate from overpay in FPP
        expect(
          (await dutchAuction.getUserInfo(generativeVectorId, fan1.address))[0].eq(ethers.utils.parseEther("0.5")),
        );
        await expect(dutchAuction.rebateCollector(generativeVectorId, fan1.address))
          .to.emit(dutchAuction, "DiscreteDutchAuctionCollectorRebate")
          .withArgs(generativeVectorId, fan1.address, ethers.utils.parseEther("0.5"), ethers.utils.parseEther("0.4"));
      });
    });
  });
});

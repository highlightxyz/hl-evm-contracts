import { parseEther } from "@ethersproject/units";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  AuctionManager,
  ERC721Editions,
  EditionsMetadataRenderer,
  IAuctionManager,
  MinimalForwarder,
  MintManager,
  Observability,
} from "../types";
import { signGatedBid } from "./__utils__/auction";
import { hourFromNow, setupEtherAuctionWithNewToken, setupSystem } from "./__utils__/helpers";

describe("Auction Manager", () => {
  let initialPlatformExecutor: SignerWithAddress,
    additionalPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    platformPaymentAccount: SignerWithAddress,
    editionsOwner: SignerWithAddress,
    fan1: SignerWithAddress,
    randomEOA: SignerWithAddress;

  let auctionManager: AuctionManager;
  let mintManager: MintManager;
  let emr: EditionsMetadataRenderer;
  let minimalForwarder: MinimalForwarder;
  let observability: Observability;

  let editionsImplementation: string;

  before(async () => {
    [
      initialPlatformExecutor,
      additionalPlatformExecutor,
      mintManagerOwner,
      editionsMetadataOwner,
      platformPaymentAccount,
      editionsOwner,
      fan1,
      randomEOA,
    ] = await ethers.getSigners();

    const {
      mintManagerProxy,
      auctionManagerProxy,
      emrProxy,
      observability: observabilityInstance,
      minimalForwarder: minimalForwarderContract,
      editionsImplementationAddress,
    } = await setupSystem(
      platformPaymentAccount.address,
      mintManagerOwner.address,
      initialPlatformExecutor.address,
      editionsMetadataOwner.address,
      editionsOwner,
    );
    auctionManager = auctionManagerProxy;
    mintManager = mintManagerProxy;
    emr = emrProxy;
    observability = observabilityInstance;
    minimalForwarder = minimalForwarderContract;
    editionsImplementation = editionsImplementationAddress;
  });

  describe("Platform Executor", function () {
    before(async () => {
      auctionManager = auctionManager.connect(mintManagerOwner);
    });
    it("Should be able add a new platform executor as Owner", async () => {
      await expect(auctionManager.addPlatformExecutor(additionalPlatformExecutor.address)).to.emit(
        auctionManager,
        "PlatformExecutorChanged",
      );
      expect(await auctionManager.platformExecutors()).to.include(additionalPlatformExecutor.address);
    });
    it("Should be able deprecate platform executor as Owner", async () => {
      //deprecate platform executor
      await expect(auctionManager.deprecatePlatformExecutor(additionalPlatformExecutor.address)).to.emit(
        auctionManager,
        "PlatformExecutorChanged",
      );
      expect(await auctionManager.platformExecutors()).to.not.include(additionalPlatformExecutor.address);
    });
    it("Should not be able to add Zero address as platform executor", async () => {
      await expect(auctionManager.addPlatformExecutor(ethers.constants.AddressZero)).to.be.revertedWith(
        "Cannot set to null address",
      );
      expect(await auctionManager.platformExecutors()).to.not.include(ethers.constants.AddressZero);
    });
    it("Should not be able to add a platform executor that already exists", async () => {
      await expect(auctionManager.addPlatformExecutor(additionalPlatformExecutor.address)).to.emit(
        auctionManager,
        "PlatformExecutorChanged",
      );
      expect(await auctionManager.platformExecutors()).to.include(additionalPlatformExecutor.address);
      await expect(auctionManager.addPlatformExecutor(additionalPlatformExecutor.address)).to.be.revertedWith(
        "Already added",
      );
    });
    it("Should reject all platform executor changes from non owner", async () => {
      const auctionManagerForFan1 = await auctionManager.connect(fan1);

      //Add platform executor
      await expect(auctionManagerForFan1.addPlatformExecutor(mintManagerOwner.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      expect(await auctionManagerForFan1.platformExecutors()).to.not.include(mintManagerOwner.address);

      //deprecate platform executor
      await expect(auctionManagerForFan1.deprecatePlatformExecutor(initialPlatformExecutor.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );
      expect(await auctionManagerForFan1.platformExecutors()).to.include(initialPlatformExecutor.address);
    });
  });

  describe("Auction for new tokens", function () {
    let editions: ERC721Editions;
    let editions2: ERC721Editions;
    let editionsWithMarketplaceFilterer: ERC721Editions;
    let defaultAuction: IAuctionManager.EnglishAuctionStruct;
    const endTime1 = hourFromNow();
    const endTime2 = hourFromNow();
    const endTime3 = hourFromNow();

    before(async () => {
      auctionManager = auctionManager.connect(editionsOwner);
      editions = await setupEtherAuctionWithNewToken(
        observability.address,
        editionsImplementation,
        mintManager.address,
        auctionManager.address,
        emr.address,
        minimalForwarder.address,
        editionsOwner,
        "id1",
        endTime1,
        editionsOwner.address,
      );
      editions2 = await setupEtherAuctionWithNewToken(
        observability.address,
        editionsImplementation,
        mintManager.address,
        auctionManager.address,
        emr.address,
        minimalForwarder.address,
        editionsOwner,
        "id2",
        endTime2,
        editionsOwner.address,
      );
      editionsWithMarketplaceFilterer = await setupEtherAuctionWithNewToken(
        observability.address,
        editionsImplementation,
        mintManager.address,
        auctionManager.address,
        emr.address,
        minimalForwarder.address,
        editionsOwner,
        "id3",
        endTime3,
        editionsOwner.address,
        true,
      );

      expect(await editions.operatorFiltererRegistry()).to.equal(ethers.constants.AddressZero);
      expect(await editionsWithMarketplaceFilterer.operatorFiltererRegistry()).to.equal(
        "0x000000000000AAeB6D7670E522A718067333cd4E",
      );

      const res = await auctionManager.getFullAuctionsData([
        ethers.utils.formatBytes32String("id1"),
        ethers.utils.formatBytes32String("id2"),
        ethers.utils.formatBytes32String("id3"),
      ]);
      expect(res[0][0][0]).to.equal(editions.address);
      expect(res[0][1][0]).to.equal(editions2.address);
      expect(res[0][2][0]).to.equal(editionsWithMarketplaceFilterer.address);
      expect(res[0][0][1]).to.equal(ethers.constants.AddressZero).to.equal(res[0][1][1]).to.equal(res[0][2][1]);
      expect(res[0][0][4].toNumber()).to.equal(endTime1);
      expect(res[0][1][4].toNumber()).to.equal(endTime2);
      expect(res[0][2][4].toNumber()).to.equal(endTime3);

      defaultAuction = {
        collection: editions.address,
        currency: ethers.constants.AddressZero,
        owner: editionsOwner.address,
        paymentRecipient: editionsOwner.address,
        endTime: hourFromNow() + hourFromNow(),
        tokenId: 0,
        mintWhenReserveMet: true,
        state: 0,
      };
    });

    // validate correct events being emitted in all of these

    it("Cannot create auction not as the collection owner", async function () {
      auctionManager = auctionManager.connect(fan1);
      await expect(
        auctionManager.createAuctionForExistingToken(ethers.utils.formatBytes32String("id4"), defaultAuction),
      ).to.be.revertedWith("Not collection owner or collection");

      await expect(
        auctionManager.createAuctionForNewToken(ethers.utils.formatBytes32String("id4"), defaultAuction),
      ).to.be.revertedWith("Not collection owner or collection");
    });

    it("Cannot create auction with already used auction id", async function () {
      auctionManager = auctionManager.connect(editionsOwner);
      await expect(
        auctionManager.createAuctionForNewToken(ethers.utils.formatBytes32String("id2"), defaultAuction),
      ).to.be.revertedWith("Auction id used");
    });

    it("Cannot bid with a non platform executor signer signing the claim", async function () {
      const { signature, claim } = await signGatedBid(editionsOwner, auctionManager, {
        auctionId: "id1",
        bidPrice: "1.0",
        reservePrice: "0.5",
        maxClaimsPerAccount: 0,
        claimExpiryTimestamp: "0",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 500,
        claimer: editionsOwner.address,
      });

      let errorOnRead = false;
      try {
        await auctionManager.verifyClaim(claim, signature, editionsOwner.address);
      } catch (error) {
        errorOnRead = true;
      }
      expect(errorOnRead).to.equal(true);

      await expect(auctionManager.bid(claim, signature, fan1.address)).to.be.revertedWith("Claim signer not executor");
    });

    it("Cannot bid on non-existent auction", async function () {
      const { signature, claim } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id4",
        bidPrice: "1.0",
        reservePrice: "0.5",
        maxClaimsPerAccount: 0,
        claimExpiryTimestamp: "0",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 500,
        claimer: editionsOwner.address,
      });

      let errorOnRead = false;
      try {
        await auctionManager.verifyClaim(claim, signature, editionsOwner.address);
      } catch (error) {
        errorOnRead = true;
      }
      expect(errorOnRead).to.equal(true);

      await expect(auctionManager.bid(claim, signature, fan1.address)).to.be.revertedWith("Not live");
    });

    it("Cannot bid with an expired claim", async function () {
      const { signature, claim } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id2",
        bidPrice: "1.0",
        reservePrice: "0.5",
        maxClaimsPerAccount: 0,
        claimExpiryTimestamp: "1",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 500,
        claimer: editionsOwner.address,
      });

      let errorOnRead = false;
      try {
        await auctionManager.verifyClaim(claim, signature, editionsOwner.address);
      } catch (error) {
        errorOnRead = true;
      }
      expect(errorOnRead).to.equal(true);

      await expect(auctionManager.bid(claim, signature, fan1.address)).to.be.revertedWith("Claim expired");
    });

    it("Cannot bid below reserve", async function () {
      const { signature, claim } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id2",
        bidPrice: "0.4999",
        reservePrice: "0.5",
        maxClaimsPerAccount: 0,
        claimExpiryTimestamp: "0",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 500,
        claimer: editionsOwner.address,
      });

      let errorOnRead = false;
      try {
        await auctionManager.verifyClaim(claim, signature, editionsOwner.address);
      } catch (error) {
        errorOnRead = true;
      }
      expect(errorOnRead).to.equal(true);

      await expect(auctionManager.bid(claim, signature, fan1.address)).to.be.revertedWith("Reserve price not met");
    });

    it("Non auction owners cannot update auction", async function () {
      auctionManager = auctionManager.connect(fan1);
      await expect(
        auctionManager.updateEndTime(ethers.utils.formatBytes32String("id1"), hourFromNow()),
      ).to.be.revertedWith("Not auction owner");

      await expect(
        auctionManager.updatePaymentRecipient(ethers.utils.formatBytes32String("id1"), initialPlatformExecutor.address),
      ).to.be.revertedWith("Not auction owner");
    });

    it("Non auction owners cannot cancel auction on chain", async function () {
      auctionManager = auctionManager.connect(fan1);
      await expect(auctionManager.cancelAuctionOnChain(ethers.utils.formatBytes32String("id1"))).to.be.revertedWith(
        "Not auction owner",
      );

      await expect(auctionManager.cancelAuctionOnChain(ethers.utils.formatBytes32String("id1"))).to.be.revertedWith(
        "Not auction owner",
      );
    });

    it("Auction owners only can cancel auction on chain before minimum reserve bid is made", async function () {
      auctionManager = auctionManager.connect(editionsOwner);
      await expect(auctionManager.cancelAuctionOnChain(ethers.utils.formatBytes32String("id3")))
        .to.emit(auctionManager, "AuctionCanceledOnChain")
        .withArgs(
          ethers.utils.formatBytes32String("id3"),
          editionsOwner.address,
          editionsWithMarketplaceFilterer.address,
          0,
        );
    });

    it("Cannot bid with invalid ether amount", async function () {
      const { signature, claim } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id1",
        bidPrice: "1.0",
        reservePrice: "0.5",
        maxClaimsPerAccount: 0,
        claimExpiryTimestamp: "0",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 500,
        claimer: editionsOwner.address,
      });

      await expect(auctionManager.bid(claim, signature, fan1.address)).to.be.revertedWith(
        "Invalid native gas token payment",
      );

      await expect(
        auctionManager.bid(claim, signature, fan1.address, { value: ethers.utils.parseEther("0.9") }),
      ).to.be.revertedWith("Invalid native gas token payment");
    });

    it("Can make valid first bid on auction", async function () {
      const { signature, claim } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id1",
        bidPrice: "1.0",
        reservePrice: "0.5",
        maxClaimsPerAccount: 0,
        claimExpiryTimestamp: "0",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 500,
        claimer: editionsOwner.address,
      });

      const claimVerified = await auctionManager.verifyClaim(claim, signature, editionsOwner.address);
      expect(claimVerified).to.equal(true);

      await expect(auctionManager.bid(claim, signature, fan1.address, { value: ethers.utils.parseEther("1.0") }))
        .to.emit(editions, "Transfer")
        .withArgs(ethers.constants.AddressZero, auctionManager.address, 1)
        .to.emit(auctionManager, "Bid")
        .withArgs(
          ethers.utils.formatBytes32String("id1"),
          editionsOwner.address,
          true,
          editions.address,
          ethers.BigNumber.from(1),
          parseEther("1.0"),
          false,
          fan1.address,
          ethers.BigNumber.from(endTime1),
        );

      expect(await editionsOwner.provider?.getBalance(auctionManager.address)).to.equal(ethers.utils.parseEther("1.0"));
      expect(await editions.ownerOf(1)).to.equal(auctionManager.address);
      expect(await editions.tokenURI(1)).to.equal(
        "data:application/json;base64,eyJuYW1lIjogImR1bW15IiwgImRlc2NyaXB0aW9uIjogImRlc2NyaXB0aW9uIiwgImltYWdlIjogImltYWdlVXJsIiwgImFuaW1hdGlvbl91cmwiOiAiYW5pbWF0aW9uVXJsIiwgImV4dGVybmFsX3VybCI6ICJleHRlcm5hbFVybCIsICJhdHRyaWJ1dGVzIjogYXR0cmlidXRlc30=",
      );
      const res = await auctionManager.getFullAuctionData(ethers.utils.formatBytes32String("id1"));
      expect(res[0][0]).to.equal(editions.address);
      // highest bidder data
      expect(res[1][0]).to.equal(editionsOwner.address);
      expect(res[1][1]).to.equal(fan1.address);
      expect(res[1][2]).to.equal(ethers.utils.parseEther("1.0"));
    });

    it("Cannot update end time of auction after minimum reserve bid is made", async function () {
      auctionManager = auctionManager.connect(editionsOwner);
      await expect(auctionManager.updateEndTime(ethers.utils.formatBytes32String("id1"), endTime2)).to.be.revertedWith(
        "Can't update after first valid bid",
      );
    });

    it("Cannot update end time of non-live auction", async function () {
      auctionManager = auctionManager.connect(editionsOwner);
      await expect(auctionManager.updateEndTime(ethers.utils.formatBytes32String("id3"), endTime2)).to.be.revertedWith(
        "Not live",
      );
    });

    it("Cannot cancel auction after minimum reserve bid is made", async function () {
      auctionManager = auctionManager.connect(editionsOwner);
      await expect(auctionManager.cancelAuctionOnChain(ethers.utils.formatBytes32String("id1"))).to.be.revertedWith(
        "Reserve price met already",
      );
    });

    it("Cannot bid on cancelled auction", async function () {
      const { signature, claim } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id3",
        bidPrice: "0.6",
        reservePrice: "0.5",
        maxClaimsPerAccount: 0,
        claimExpiryTimestamp: "0",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 500,
        claimer: editionsOwner.address,
      });

      let errorOnRead = false;
      try {
        await auctionManager.verifyClaim(claim, signature, editionsOwner.address);
      } catch (error) {
        errorOnRead = true;
      }
      expect(errorOnRead).to.equal(true);

      await expect(auctionManager.bid(claim, signature, fan1.address)).to.be.revertedWith("Not live");
    });

    it("Auction owners only can update an auction's payment recipient", async function () {
      auctionManager = auctionManager.connect(editionsOwner);
      await expect(auctionManager.updatePaymentRecipient(ethers.utils.formatBytes32String("id1"), randomEOA.address))
        .to.emit(auctionManager, "PaymentRecipientUpdated")
        .withArgs(ethers.utils.formatBytes32String("id1"), editionsOwner.address, randomEOA.address);
    });

    it("Cannot make bid with bid price not sufficiently higher than the previous one", async function () {
      const { signature: signature1, claim: claim1 } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id1",
        bidPrice: "1.04",
        reservePrice: "0.5",
        maxClaimsPerAccount: 0,
        claimExpiryTimestamp: "0",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 500,
        claimer: editionsOwner.address,
      });

      let errorOnRead1 = false;
      try {
        await auctionManager.verifyClaim(claim1, signature1, editionsOwner.address);
      } catch (error) {
        errorOnRead1 = true;
      }
      expect(errorOnRead1).to.equal(true);

      await expect(auctionManager.bid(claim1, signature1, fan1.address)).to.be.revertedWith(
        "Bid not big enough of a jump",
      );

      const { signature: signature2, claim: claim2 } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id1",
        bidPrice: "1.059",
        reservePrice: "0.5",
        maxClaimsPerAccount: 0,
        claimExpiryTimestamp: "0",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 600,
        claimer: editionsOwner.address,
      });

      let errorOnRead2 = false;
      try {
        await auctionManager.verifyClaim(claim2, signature2, editionsOwner.address);
      } catch (error) {
        errorOnRead2 = true;
      }
      expect(errorOnRead2).to.equal(true);

      await expect(auctionManager.bid(claim2, signature2, fan1.address)).to.be.revertedWith(
        "Bid not big enough of a jump",
      );
    });

    it("Cannot make bid if user exceeds maxClaimsPerAccount", async function () {
      const numBids = await auctionManager.auctionBids(ethers.utils.formatBytes32String("id1"), editionsOwner.address);
      expect(numBids).to.equal(ethers.BigNumber.from(1));
      const { signature, claim } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id1",
        bidPrice: "1.1",
        reservePrice: "0.5",
        maxClaimsPerAccount: 1,
        claimExpiryTimestamp: "0",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 500,
        claimer: editionsOwner.address,
      });

      let errorOnRead1 = false;
      try {
        await auctionManager.verifyClaim(claim, signature, editionsOwner.address);
      } catch (error) {
        errorOnRead1 = true;
      }
      expect(errorOnRead1).to.equal(true);

      await expect(auctionManager.bid(claim, signature, fan1.address)).to.be.revertedWith(
        "Exceeded max claims for account",
      );
    });

    it("Can make valid higher bids", async function () {
      auctionManager = auctionManager.connect(fan1);
      const prevHighestBidderBalance = await editionsOwner.provider?.getBalance(editionsOwner.address);
      const { signature, claim } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id1",
        bidPrice: "1.04",
        reservePrice: "1.8", // reserve price shouldn't matter
        maxClaimsPerAccount: 1,
        claimExpiryTimestamp: "0",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 0,
        claimer: fan1.address,
      });

      const claimVerified = await auctionManager.verifyClaim(claim, signature, fan1.address);
      expect(claimVerified).to.equal(true);

      await expect(auctionManager.bid(claim, signature, fan1.address, { value: ethers.utils.parseEther("1.04") }))
        .to.emit(auctionManager, "Bid")
        .withArgs(
          ethers.utils.formatBytes32String("id1"),
          fan1.address,
          false,
          editions.address,
          ethers.BigNumber.from(1),
          parseEther("1.04"),
          false,
          fan1.address,
          ethers.BigNumber.from(endTime1),
        );

      // refunded to previous highest bidder
      expect(await editionsOwner.provider?.getBalance(editionsOwner.address)).to.equal(
        prevHighestBidderBalance?.add(ethers.utils.parseEther("1")),
      );
      expect(await editionsOwner.provider?.getBalance(auctionManager.address)).to.equal(
        ethers.utils.parseEther("1.04"),
      );
      expect(await editions.ownerOf(1)).to.equal(auctionManager.address);
      const res = await auctionManager.getFullAuctionData(ethers.utils.formatBytes32String("id1"));
      expect(res[0][0]).to.equal(editions.address);
      // highest bidder data
      expect(res[1][0]).to.equal(fan1.address);
      expect(res[1][1]).to.equal(fan1.address);
      expect(res[1][2]).to.equal(ethers.utils.parseEther("1.04"));
    });

    it("Cannot bid same price even if minimum percentage increase is 0", async function () {
      auctionManager = auctionManager.connect(fan1);
      const { signature, claim } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id1",
        bidPrice: "1.04",
        reservePrice: "0.5",
        maxClaimsPerAccount: 0,
        claimExpiryTimestamp: "0",
        buffer: 300,
        minimumIncrementPerBidPctBPS: 0,
        claimer: fan1.address,
      });

      let errorOnRead1 = false;
      try {
        await auctionManager.verifyClaim(claim, signature, editionsOwner.address);
      } catch (error) {
        errorOnRead1 = true;
      }
      expect(errorOnRead1).to.equal(true);

      await expect(auctionManager.bid(claim, signature, fan1.address)).to.be.revertedWith("Bid not higher");
    });

    it("If bid is made in buffer, end time is extended to current time + buffer", async function () {
      auctionManager = auctionManager.connect(fan1);
      const { signature, claim } = await signGatedBid(initialPlatformExecutor, auctionManager, {
        auctionId: "id2",
        bidPrice: "2",
        reservePrice: "1.8", // reserve price shouldn't matter
        maxClaimsPerAccount: 1,
        claimExpiryTimestamp: "0",
        buffer: 300000000,
        minimumIncrementPerBidPctBPS: 0,
        claimer: fan1.address,
      });

      const claimVerified = await auctionManager.verifyClaim(claim, signature, fan1.address);
      expect(claimVerified).to.equal(true);

      const blockTime = Math.floor(Date.now() / 1000) + 1000;
      const newEndTimeExpectedMin = ethers.BigNumber.from(blockTime + 300000000).add(2);
      await time.setNextBlockTimestamp(blockTime);
      await expect(auctionManager.bid(claim, signature, fan1.address, { value: ethers.utils.parseEther("2") }))
        .to.emit(editions2, "Transfer")
        .to.emit(auctionManager, "TimeLengthened")
        .to.emit(auctionManager, "Bid")
        .withArgs(
          ethers.utils.formatBytes32String("id2"),
          fan1.address,
          true,
          editions2.address,
          ethers.BigNumber.from(1),
          parseEther("2"),
          true,
          fan1.address,
          newEndTimeExpectedMin,
        );

      expect(await editionsOwner.provider?.getBalance(auctionManager.address)).to.equal(
        ethers.utils.parseEther("3.04"),
      );
      expect(await editions2.ownerOf(1)).to.equal(auctionManager.address);
      const res = await auctionManager.getFullAuctionData(ethers.utils.formatBytes32String("id2"));
      expect(res[0][0]).to.equal(editions2.address);
      // highest bidder data
      expect(res[1][0]).to.equal(fan1.address);
      expect(res[1][1]).to.equal(fan1.address);
      expect(res[1][2]).to.equal(ethers.utils.parseEther("2"));
      expect(res[0][4]).to.be.equal(newEndTimeExpectedMin);
    });

    it("Cannot fulfill an auction before it has ended", async function () {
      await expect(auctionManager.fulfillAuction(ethers.utils.formatBytes32String("id2"))).to.be.revertedWith(
        "Auction hasn't ended",
      );
    });

    it("Cannot fulfill a cancelled auction", async function () {
      await expect(auctionManager.fulfillAuction(ethers.utils.formatBytes32String("id3"))).to.be.revertedWith(
        "Not live",
      );
    });

    it("Anyone can fulfill won auction", async function () {
      await time.increaseTo(Math.floor(Date.now() / 1000) + 300005000);
      const provider = editionsOwner.provider!;
      const paymentRecipientPreviousBalance = await provider.getBalance(randomEOA.address);
      const platformPreviousBalance = await provider.getBalance(platformPaymentAccount.address);
      const recipientCut = ethers.utils.parseEther("1.04").mul(9500).div(10000);
      const platformCut = ethers.utils.parseEther("1.04").sub(recipientCut);
      console.log("pre fulfill");
      await expect(auctionManager.fulfillAuction(ethers.utils.formatBytes32String("id1")))
        .to.emit(auctionManager, "AuctionWon")
        .withArgs(
          ethers.utils.formatBytes32String("id1"),
          1,
          editions.address,
          editionsOwner.address,
          fan1.address,
          randomEOA.address,
          fan1.address,
          ethers.constants.AddressZero,
          ethers.utils.parseEther("1.04"),
          9500,
        );
      console.log("post fulfill");

      expect(await provider.getBalance(randomEOA.address)).to.equal(paymentRecipientPreviousBalance.add(recipientCut));
      expect(await provider.getBalance(platformPaymentAccount.address)).to.equal(
        platformPreviousBalance.add(platformCut),
      );
      expect(await provider.getBalance(auctionManager.address)).to.equal(ethers.utils.parseEther("2.0"));
      expect(await editions.ownerOf(1)).to.equal(fan1.address);
      const res = await auctionManager.getFullAuctionData(ethers.utils.formatBytes32String("id1"));
      expect(res[0][7]).to.equal(3); // FULFILLED state
    });

    it("Cannot fulfill already fulfilled auction", async function () {
      await expect(auctionManager.fulfillAuction(ethers.utils.formatBytes32String("id1"))).to.be.revertedWith(
        "Not live",
      );
    });

    it("Non highest bidder cannot call updatePreferredNFTRecipient", async function () {
      auctionManager = auctionManager.connect(editionsOwner);
      await expect(
        auctionManager.updatePreferredNFTRecipient(ethers.utils.formatBytes32String("id2"), mintManager.address),
      ).to.be.revertedWith("Not current highest bidder");
    });

    it("If preferred nft recipient is invalid, revert", async function () {
      auctionManager = auctionManager.connect(fan1);
      await expect(
        auctionManager.updatePreferredNFTRecipient(ethers.utils.formatBytes32String("id2"), mintManager.address),
      )
        .to.emit(auctionManager, "PreferredNFTRecipientUpdated")
        .withArgs(ethers.utils.formatBytes32String("id2"), editionsOwner.address, mintManager.address);

      await expect(auctionManager.fulfillAuction(ethers.utils.formatBytes32String("id2"))).to.be.revertedWith(
        "Preferred nft recipient is an invalid receiver",
      );
    });
  });

  describe("Auctions for existing tokens", function () {
    // in the beforeEach, create 2 auctions, one each via each method
    // one in native gas token, other in erc20
    // in the beforeEach, do the validations on the created parameters
    /*
      await expect(
        auctionManager.createAuctionForExistingToken(ethers.utils.formatBytes32String("id1"), defaultAuction),
      ).to.be.revertedWith("ERC721: invalid token ID");
    */
  });

  describe("Multiple auctions", function () {
    // just validate that there's no logic mishap with multiple auctions (one new token, one existing), don't need to validate as much as previous 2 describes
  });

  describe("Admin", function () {
    it("Only the owner can update the platform account", async function () {
      auctionManager = auctionManager.connect(editionsOwner);
      await expect(auctionManager.updatePlatform(editionsOwner.address)).to.be.revertedWith(
        "Ownable: caller is not the owner",
      );

      auctionManager = auctionManager.connect(mintManagerOwner);
      await expect(auctionManager.updatePlatform(editionsOwner.address))
        .to.emit(auctionManager, "PlatformUpdated")
        .withArgs(editionsOwner.address);
    });

    it("Only the owner can upgrade the auction manager", async function () {
      // upgrade to mock contract
      // validate
    });
  });
});

// need to validate behaviour with many auctions, for eg.
// to show that correct amount of tokens / native currency held by contract is retained (through auctions)

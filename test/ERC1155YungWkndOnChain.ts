import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  AuctionManager,
  EditionsMetadataRenderer,
  InvalidRoyaltyManager,
  InvalidTokenManager,
  LockedRoyaltyManager,
  LockedTokenManager,
  MinimalForwarder,
  MintManager,
  Observability,
  OwnerOnlyRoyaltyManager,
  OwnerOnlyTokenManager,
  ERC1155YungWkndOnChain,
} from "../types";
import { Errors } from "./__utils__/data";
import { setupSystem, setupYungWknd } from "./__utils__/helpers";

enum BaseEvents {
  MinterRegistrationChanged = "MinterRegistrationChanged",
  GranularTokenManagersSet = "GranularTokenManagersSet",
  GranularTokenManagersRemoved = "GranularTokenManagersRemoved",
  DefaultTokenManagerChanged = "DefaultTokenManagerChanged",
  DefaultRoyaltySet = "DefaultRoyaltySet",
  GranularRoyaltiesSet = "GranularRoyaltiesSet",
  RoyaltyManagerChanged = "RoyaltyManagerChanged",
  MintsFrozen = "MintsFrozen",
}

const defaultEditionInfo = ethers.utils.defaultAbiCoder.encode(
  ["tuple(string, string, string, string, string, string)"],
  [["name", "description", "imageUrl", "animationUrl", "externalUrl", "attributes"]],
);

describe("ERC1155 YungWknd functionality", () => {
  let invalidRoyaltyManager: InvalidRoyaltyManager;
  let lockedRoyaltyManager: LockedRoyaltyManager;
  let ownerOnlyRoyaltyManager: OwnerOnlyRoyaltyManager;
  let invalidTokenManager: InvalidTokenManager;
  let lockedTokenManager: LockedTokenManager;
  let ownerOnlyTokenManager: OwnerOnlyTokenManager;
  let initialPlatformExecutor: SignerWithAddress,
    mintManagerOwner: SignerWithAddress,
    editionsMetadataOwner: SignerWithAddress,
    platformPaymentAddress: SignerWithAddress,
    editionsOwner: SignerWithAddress,
    fan1: SignerWithAddress;

  let emr: EditionsMetadataRenderer;
  let mintManager: MintManager;
  let auctionManager: AuctionManager;
  let trustedForwarder: MinimalForwarder;
  let observability: Observability;
  let editionsImplementation: string;
  let singleEditionImplementation: string;

  const zeroRoyalty = {
    recipientAddress: ethers.constants.AddressZero,
    royaltyPercentageBPS: 0,
  };

  before(async () => {
    [initialPlatformExecutor, mintManagerOwner, editionsMetadataOwner, platformPaymentAddress, editionsOwner, fan1] =
      await ethers.getSigners();
    const {
      emrProxy,
      mintManagerProxy,
      minimalForwarder,
      auctionManagerProxy,
      observability: observabilityInstance,
      editionsImplementationAddress,
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
    trustedForwarder = minimalForwarder;
    auctionManager = auctionManagerProxy;
    observability = observabilityInstance;
    editionsImplementation = editionsImplementationAddress;
    singleEditionImplementation = singleEditionImplementationAddress;

    invalidRoyaltyManager = await (await ethers.getContractFactory("InvalidRoyaltyManager")).deploy();
    lockedRoyaltyManager = await (await ethers.getContractFactory("LockedRoyaltyManager")).deploy();
    ownerOnlyRoyaltyManager = await (await ethers.getContractFactory("OwnerOnlyRoyaltyManager")).deploy();

    invalidTokenManager = await (await ethers.getContractFactory("InvalidTokenManager")).deploy();
    lockedTokenManager = await (await ethers.getContractFactory("LockedTokenManager")).deploy();
    ownerOnlyTokenManager = await (await ethers.getContractFactory("OwnerOnlyTokenManager")).deploy();
  });

  describe("ERC1155YungWkndRenderer", function () {
    let yw: ERC1155YungWkndOnChain;

    beforeEach(async () => {
      yw = await setupYungWknd(
        observability.address,
        editionsImplementation,
        mintManager.address,
        auctionManager.address,
        trustedForwarder.address,
        emr.address,
        editionsOwner,
      );
    });

    describe("Minter registration", function () {
      it("Non-owners cannot register or unregister minters2", async function () {
        yw = yw.connect(fan1);
        await expect(yw.registerMinter(fan1.address)).to.be.revertedWith("Ownable: caller is not the owner");

        await expect(yw.unregisterMinter(fan1.address)).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Can only register unregistered minters", async function () {
        await expect(yw.registerMinter(fan1.address))
          .to.emit(yw, BaseEvents.MinterRegistrationChanged)
          .withArgs(fan1.address, true)
          .to.emit(observability, BaseEvents.MinterRegistrationChanged)
          .withArgs(yw.address, fan1.address, true);

        await expect(yw.registerMinter(fan1.address)).to.be.revertedWithCustomError(
          yw,
          Errors.MinterRegistrationInvalid,
        );
      });

      it("Can only unregister registered minters", async function () {
        await expect(yw.unregisterMinter(fan1.address)).to.be.revertedWithCustomError(
          yw,
          Errors.MinterRegistrationInvalid,
        );

        await yw.registerMinter(fan1.address);

        await expect(yw.unregisterMinter(fan1.address))
          .to.emit(yw, BaseEvents.MinterRegistrationChanged)
          .withArgs(fan1.address, false)
          .to.emit(observability, BaseEvents.MinterRegistrationChanged)
          .withArgs(yw.address, fan1.address, false);
      });
    });

    describe("Granular token managers management", function () {
      describe("Current token manager not existing", function () {
        it("An invalid token manager cannot be set", async function () {
          await expect(
            yw.setGranularTokenManagers([0, 1], [invalidTokenManager.address, invalidTokenManager.address]),
          ).to.be.revertedWithCustomError(yw, Errors.InvalidManager);

          await expect(
            yw.setGranularTokenManagers([0, 1], [lockedTokenManager.address, invalidTokenManager.address]),
          ).to.be.revertedWithCustomError(yw, Errors.InvalidManager);

          await expect(
            yw.setGranularTokenManagers([0, 1], [invalidTokenManager.address, lockedTokenManager.address]),
          ).to.be.revertedWithCustomError(yw, Errors.InvalidManager);
        });

        it("Non owners cannot call", async function () {
          yw = yw.connect(fan1);
          await expect(
            yw.setGranularTokenManagers([0, 1], [lockedTokenManager.address, lockedTokenManager.address]),
          ).to.be.revertedWithCustomError(yw, Errors.Unauthorized);
        });

        it("Owner can set granular token managers", async function () {
          await expect(
            yw.setGranularTokenManagers([0, 1], [lockedTokenManager.address, lockedTokenManager.address]),
          )
            .to.be.emit(yw, BaseEvents.GranularTokenManagersSet)
            .withArgs([0, 1], [lockedTokenManager.address, lockedTokenManager.address]);

          expect(await yw.tokenManager(0)).to.eql(lockedTokenManager.address);
          expect(await yw.tokenManager(1)).to.eql(lockedTokenManager.address);
        });

        it("Cannot remove non-existent token manager", async function () {
          await expect(yw.removeGranularTokenManagers([0])).to.be.revertedWithCustomError(
            yw,
            Errors.ManagerDoesNotExist,
          );
        });
      });

      describe("Current token manager exists", async function () {
        beforeEach(async function () {
          await yw.setGranularTokenManagers(
            [0, 1],
            [ownerOnlyTokenManager.address, ownerOnlyTokenManager.address],
          );

          expect(await yw.tokenManager(0)).to.eql(ownerOnlyTokenManager.address);
          expect(await yw.tokenManager(1)).to.eql(ownerOnlyTokenManager.address);
        });

        it("Swap attempts respect the wishes of current token managers", async function () {
          yw = yw.connect(fan1);

          await expect(
            yw.setGranularTokenManagers([0, 1], [lockedTokenManager.address, lockedTokenManager.address]),
          ).to.be.revertedWithCustomError(yw, Errors.ManagerSwapBlocked);

          yw = yw.connect(editionsOwner);

          await expect(yw.setGranularTokenManagers([0], [lockedTokenManager.address]))
            .to.be.emit(yw, BaseEvents.GranularTokenManagersSet)
            .withArgs([0], [lockedTokenManager.address]);

          expect(await yw.tokenManager(0)).to.eql(lockedTokenManager.address);

          await expect(
            yw.setGranularTokenManagers([0, 1], [ownerOnlyTokenManager.address, lockedTokenManager.address]),
          ).to.be.revertedWithCustomError(yw, Errors.ManagerSwapBlocked);

          await expect(yw.setGranularTokenManagers([1], [lockedTokenManager.address]))
            .to.be.emit(yw, BaseEvents.GranularTokenManagersSet)
            .withArgs([1], [lockedTokenManager.address]);

          expect(await yw.tokenManager(1)).to.eql(lockedTokenManager.address);
        });

        it("Remove attempts respect the wishes of current token managers", async function () {
          yw = yw.connect(fan1);

          await expect(yw.removeGranularTokenManagers([0, 1])).to.be.revertedWithCustomError(
            yw,
            Errors.ManagerRemoveBlocked,
          );

          yw = yw.connect(editionsOwner);

          await expect(yw.removeGranularTokenManagers([0]))
            .to.emit(yw, BaseEvents.GranularTokenManagersRemoved)
            .withArgs([0])
            .to.emit(observability, BaseEvents.GranularTokenManagersRemoved)
            .withArgs(yw.address, [0]);

          expect(await yw.tokenManager(0)).to.eql(ethers.constants.AddressZero);
        });
      });
    });

    describe("Default token manager management", function () {
      describe("Current default token manager not existing", function () {
        it("An invalid default token manager cannot be set", async function () {
          await expect(yw.setDefaultTokenManager(invalidTokenManager.address)).to.be.revertedWithCustomError(
            yw,
            Errors.InvalidManager,
          );
        });

        it("Non owners cannot call", async function () {
          yw = yw.connect(fan1);
          await expect(yw.setDefaultTokenManager(lockedTokenManager.address)).to.be.revertedWithCustomError(
            yw,
            Errors.Unauthorized,
          );
        });

        it("Owner can set default token manager", async function () {
          await expect(yw.setDefaultTokenManager(lockedTokenManager.address))
            .to.be.emit(yw, BaseEvents.DefaultTokenManagerChanged)
            .withArgs(lockedTokenManager.address);

          for (let i = 0; i < 5; i++) {
            expect(await yw.tokenManager(0)).to.eql(lockedTokenManager.address);
          }
        });

        it("Cannot remove non-existent default token manager", async function () {
          await expect(yw.removeDefaultTokenManager()).to.be.revertedWithCustomError(
            yw,
            Errors.ManagerDoesNotExist,
          );
        });
      });

      describe("Current default token manager existing", function () {
        beforeEach(async function () {
          yw = await setupYungWknd(
            observability.address,
            editionsImplementation,
            mintManager.address,
            auctionManager.address,
            trustedForwarder.address,
            emr.address,
            editionsOwner,
            null,
            null,
            ownerOnlyTokenManager.address,
          );

          for (let i = 0; i < 5; i++) {
            expect(await yw.tokenManager(0)).to.eql(ownerOnlyTokenManager.address);
          }
        });

        it("Swap attempts respect the wishes of current default token manager", async function () {
          yw = yw.connect(fan1);

          await expect(yw.setDefaultTokenManager(lockedTokenManager.address)).to.be.revertedWithCustomError(
            yw,
            Errors.ManagerSwapBlocked,
          );

          yw = yw.connect(editionsOwner);

          await expect(yw.setDefaultTokenManager(lockedTokenManager.address))
            .to.emit(yw, BaseEvents.DefaultTokenManagerChanged)
            .withArgs(lockedTokenManager.address)
            .to.emit(observability, BaseEvents.DefaultTokenManagerChanged)
            .withArgs(yw.address, lockedTokenManager.address);

          for (let i = 0; i < 5; i++) {
            expect(await yw.tokenManager(0)).to.eql(lockedTokenManager.address);
          }

          await expect(yw.setDefaultTokenManager(ownerOnlyTokenManager.address)).to.be.revertedWithCustomError(
            yw,
            Errors.ManagerSwapBlocked,
          );
        });

        it("Remove attempts respect the wishes of current default token", async function () {
          yw = yw.connect(fan1);

          await expect(yw.removeDefaultTokenManager()).to.be.revertedWithCustomError(
            yw,
            Errors.ManagerRemoveBlocked,
          );

          yw = yw.connect(editionsOwner);

          await expect(yw.removeDefaultTokenManager())
            .to.emit(yw, BaseEvents.DefaultTokenManagerChanged)
            .withArgs(ethers.constants.AddressZero);

          for (let i = 0; i < 5; i++) {
            expect(await yw.tokenManager(0)).to.eql(ethers.constants.AddressZero);
          }
        });
      });
    });

    describe("Royalty manager management", function () {
      describe("Current royalty manager not existing", function () {
        it("An invalid royalty manager cannot be set", async function () {
          await expect(yw.setRoyaltyManager(invalidRoyaltyManager.address)).to.be.revertedWithCustomError(
            yw,
            Errors.InvalidManager,
          );
        });

        it("Non owners cannot call", async function () {
          yw = yw.connect(fan1);
          await expect(yw.setRoyaltyManager(ownerOnlyRoyaltyManager.address)).to.be.revertedWithCustomError(
            yw,
            Errors.Unauthorized,
          );
        });

        it("Owner can set royalty manager", async function () {
          await expect(yw.setRoyaltyManager(ownerOnlyRoyaltyManager.address))
            .to.be.emit(yw, BaseEvents.RoyaltyManagerChanged)
            .withArgs(ownerOnlyRoyaltyManager.address);

          expect(await yw.royaltyManager()).to.eql(ownerOnlyRoyaltyManager.address);
        });

        it("Cannot remove non-existent royalty manager", async function () {
          await expect(yw.removeRoyaltyManager()).to.be.revertedWithCustomError(
            yw,
            Errors.ManagerDoesNotExist,
          );
        });
      });

      describe("Current royalty manager exists", function () {
        beforeEach(async function () {
          await expect(yw.setRoyaltyManager(ownerOnlyRoyaltyManager.address))
            .to.be.emit(yw, BaseEvents.RoyaltyManagerChanged)
            .withArgs(ownerOnlyRoyaltyManager.address);

          expect(await yw.royaltyManager()).to.eql(ownerOnlyRoyaltyManager.address);
        });

        it("Swap attempts respect the wishes of current royalty manager", async function () {
          yw = yw.connect(fan1);

          await expect(yw.setRoyaltyManager(lockedRoyaltyManager.address)).to.be.revertedWithCustomError(
            yw,
            Errors.ManagerSwapBlocked,
          );

          yw = yw.connect(editionsOwner);

          await expect(yw.setRoyaltyManager(lockedRoyaltyManager.address))
            .to.be.emit(yw, BaseEvents.RoyaltyManagerChanged)
            .withArgs(lockedRoyaltyManager.address)
            .to.be.emit(observability, BaseEvents.RoyaltyManagerChanged)
            .withArgs(yw.address, lockedRoyaltyManager.address);

          expect(await yw.royaltyManager()).to.eql(lockedRoyaltyManager.address);

          await expect(yw.setRoyaltyManager(ownerOnlyRoyaltyManager.address)).to.be.revertedWithCustomError(
            yw,
            Errors.ManagerSwapBlocked,
          );
        });

        it("Remove attempts respect the wishes of current royalty manager", async function () {
          yw = yw.connect(fan1);

          await expect(yw.removeRoyaltyManager()).to.be.revertedWithCustomError(
            yw,
            Errors.ManagerRemoveBlocked,
          );

          yw = yw.connect(editionsOwner);

          await expect(yw.removeRoyaltyManager())
            .to.emit(yw, BaseEvents.RoyaltyManagerChanged)
            .withArgs(ethers.constants.AddressZero);

          expect(await yw.royaltyManager()).to.eql(ethers.constants.AddressZero);
        });
      });
    });

    describe("Royalty management", function () {
      describe("Current royalty manager does not exist", async function () {
        it("Royalty perentage BPS cannot be greater than 10000 for setting default royalty", async function () {
          await expect(
            yw.setDefaultRoyalty({ recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 10001 }),
          ).to.be.revertedWithCustomError(yw, Errors.RoyaltyBPSInvalid);
        });

        it("Non-owner cannot set default royalty", async function () {
          yw = yw.connect(fan1);

          await expect(
            yw.setDefaultRoyalty({ recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 100 }),
          ).to.be.revertedWithCustomError(yw, Errors.Unauthorized);
        });

        it("Owner can set default royalty", async function () {
          await expect(
            yw.setDefaultRoyalty({ recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 100 }),
          )
            .to.emit(yw, BaseEvents.DefaultRoyaltySet)
            .withArgs(ethers.constants.AddressZero, 100)
            .to.emit(observability, BaseEvents.DefaultRoyaltySet)
            .withArgs(yw.address, ethers.constants.AddressZero, 100);

          // mint some tokens to test royalties
          // await expect(
          //   yw.createEdition(defaultEditionInfo, 4, ethers.constants.AddressZero, zeroRoyalty, "0x"),
          // ).to.emit(yw, "EditionCreated");

          await expect(yw.registerMinter(editionsOwner.address)).to.emit(yw, "MinterRegistrationChanged");

          await expect(yw.mintOneToOneRecipient(editionsOwner.address)).to.emit(yw, "TransferSingle");

          const royaltyInfo = await yw.royaltyInfo(1, 10000);
          expect(royaltyInfo.receiver).to.eql(ethers.constants.AddressZero);
          expect(royaltyInfo.royaltyAmount.toNumber()).to.eql(100);
        });

        it("Royalty perentage BPS cannot be greater than 10000 for setting granular royalties", async function () {
          await expect(
            yw.setGranularRoyalties(
              [0, 1],
              [
                { recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 100 },
                { recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 10001 },
              ],
            ),
          ).to.be.revertedWithCustomError(yw, Errors.RoyaltyBPSInvalid);
        });

        it("Non-owner cannot set granular royalties", async function () {
          yw = yw.connect(fan1);

          await expect(
            yw.setGranularRoyalties(
              [0, 1],
              [
                { recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 100 },
                { recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 1000 },
              ],
            ),
          ).to.be.revertedWithCustomError(yw, Errors.Unauthorized);
        });

        it("Owner can set granular royalties", async function () {
          await expect(
            yw.setGranularRoyalties(
              [1, 2],
              [
                { recipientAddress: fan1.address, royaltyPercentageBPS: 100 },
                { recipientAddress: fan1.address, royaltyPercentageBPS: 1000 },
              ],
            ),
          )
            .to.emit(yw, BaseEvents.GranularRoyaltiesSet)
            .to.emit(observability, BaseEvents.GranularRoyaltiesSet);

          // mint some tokens to test royalties
          // await expect(
          //   yw.createEdition(defaultEditionInfo, 1, ethers.constants.AddressZero, zeroRoyalty, "0x"),
          // ).to.emit(yw, "EditionCreated");

          // await expect(
          //   yw.createEdition(defaultEditionInfo, 1, ethers.constants.AddressZero, zeroRoyalty, "0x"),
          // ).to.emit(yw, "EditionCreated");

          await expect(yw.registerMinter(editionsOwner.address)).to.emit(yw, "MinterRegistrationChanged");

          await expect(yw.mintOneToOneRecipient(editionsOwner.address)).to.emit(yw, "TransferSingle");

          await expect(yw.mintOneToOneRecipient(editionsOwner.address)).to.emit(yw, "TransferSingle");

          const royaltyInfo1 = await yw.royaltyInfo(1, 10000);
          expect(royaltyInfo1.receiver).to.eql(fan1.address);
          expect(royaltyInfo1.royaltyAmount.toNumber()).to.eql(100);

          const royaltyInfo2 = await yw.royaltyInfo(2, 10000);
          expect(royaltyInfo2.receiver).to.eql(fan1.address);
          expect(royaltyInfo2.royaltyAmount.toNumber()).to.eql(1000);
        });
      });

      describe("Current royalty manager does exist", async function () {
        beforeEach(async function () {
          await expect(yw.setRoyaltyManager(ownerOnlyRoyaltyManager.address))
            .to.be.emit(yw, BaseEvents.RoyaltyManagerChanged)
            .withArgs(ownerOnlyRoyaltyManager.address);
        });

        it("Setting royalties respects the wishes of current royalty manager", async function () {
          yw = yw.connect(fan1);

          await expect(
            yw.setDefaultRoyalty({ recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 100 }),
          ).to.be.revertedWithCustomError(yw, Errors.RoyaltySetBlocked);

          await expect(
            yw.setGranularRoyalties(
              [1, 2],
              [
                { recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 100 },
                { recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 1000 },
              ],
            ),
          ).to.be.revertedWithCustomError(yw, Errors.RoyaltySetBlocked);

          yw = yw.connect(editionsOwner);

          // // mint some tokens to test royalties
          // await expect(
          //   yw.createEdition(defaultEditionInfo, 2, ethers.constants.AddressZero, zeroRoyalty, "0x"),
          // ).to.emit(yw, "EditionCreated");

          await expect(yw.registerMinter(editionsOwner.address)).to.emit(yw, "MinterRegistrationChanged");

          await expect(yw.mintOneToOneRecipient(editionsOwner.address)).to.emit(yw, "TransferSingle");
          await expect(yw.mintExistingOneToOneRecipient(editionsOwner.address, 0)).to.emit(yw, "TransferSingle");

          await expect(yw.setDefaultRoyalty({ recipientAddress: fan1.address, royaltyPercentageBPS: 100 }))
            .to.emit(yw, BaseEvents.DefaultRoyaltySet)
            .withArgs(fan1.address, 100);

          const royaltyInfo1 = await yw.royaltyInfo(1, 10000);
          expect(royaltyInfo1.receiver).to.eql(fan1.address);
          expect(royaltyInfo1.royaltyAmount.toNumber()).to.eql(100);

          await expect(
            yw.setGranularRoyalties(
              [1],
              [{ recipientAddress: editionsOwner.address, royaltyPercentageBPS: 1000 }],
            ),
          ).to.emit(yw, BaseEvents.GranularRoyaltiesSet);

          const royaltyInfo2 = await yw.royaltyInfo(1, 10000);
          expect(royaltyInfo2.receiver).to.eql(editionsOwner.address);
          expect(royaltyInfo2.royaltyAmount.toNumber()).to.eql(1000);

          await expect(yw.setRoyaltyManager(lockedRoyaltyManager.address))
            .to.be.emit(yw, BaseEvents.RoyaltyManagerChanged)
            .withArgs(lockedRoyaltyManager.address);

          await expect(
            yw.setDefaultRoyalty({ recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 100 }),
          ).to.be.revertedWithCustomError(yw, Errors.RoyaltySetBlocked);

          await expect(
            yw.setGranularRoyalties(
              [0, 1],
              [
                { recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 100 },
                { recipientAddress: ethers.constants.AddressZero, royaltyPercentageBPS: 1000 },
              ],
            ),
          ).to.be.revertedWithCustomError(yw, Errors.RoyaltySetBlocked);
        });
      });
    });
  });
});

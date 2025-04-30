// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "../erc721/onchain/ERC721GenerativeOnchain.sol";
import "../erc721/ERC721General.sol";
import "../erc721/ERC721GeneralSequence.sol";
import "../erc721/ERC721SingleEditionDFS.sol";
import "../erc721/ERC721EditionsDFS.sol";
import "../erc1155/ERC1155EditionsDFS.sol";
import "../royaltyManager/interfaces/IRoyaltyManager.sol";
import "../auction/interfaces/IAuctionManager.sol";
import "../mint/interfaces/IAbridgedMintVector.sol";

/**
 * @notice Highlight Factory for NFT contracts
 * @author highlight.xyz
 */
contract HighlightFactory {
    /**
     * @notice Deploy Generative Series nft contract (ERC721)
     */
    function deployGenerativeSeries721(
        bytes32 salt,
        address creator,
        address generativeSeriesImplementation,
        bytes memory initializeData,
        bytes memory mintVectorData,
        bytes memory mechanicVectorData,
        address observability
    ) external returns (address) {
        address clone = Clones.cloneDeterministic(generativeSeriesImplementation, salt);
        ERC721GenerativeOnchain(clone).initialize(address(this), initializeData, observability);

        if (mintVectorData.length > 0) {
            (
                address mintManager,
                address paymentRecipient,
                uint48 startTimestamp,
                uint48 endTimestamp,
                uint192 pricePerToken,
                uint48 tokenLimitPerTx,
                uint48 maxTotalClaimableViaVector,
                uint48 maxUserClaimableViaVector,
                address currency
            ) = abi.decode(
                    mintVectorData,
                    (address, address, uint48, uint48, uint192, uint48, uint48, uint48, address)
                );

            IAbridgedMintVector(mintManager).createAbridgedVector(
                IAbridgedMintVector.AbridgedVectorData(
                    uint160(clone),
                    startTimestamp,
                    endTimestamp,
                    uint160(paymentRecipient),
                    maxTotalClaimableViaVector,
                    0,
                    uint160(currency),
                    tokenLimitPerTx,
                    maxUserClaimableViaVector,
                    pricePerToken,
                    0,
                    false,
                    false,
                    0
                )
            );
        }

        if (mechanicVectorData.length != 0) {
            (uint96 seed, address mechanic, address mintManager, bytes memory vectorData) = abi.decode(
                mechanicVectorData,
                (uint96, address, address, bytes)
            );

            IMechanicMintManager(mintManager).registerMechanicVector(
                IMechanicData.MechanicVectorMetadata(clone, 0, mechanic, false, false, false),
                seed,
                vectorData
            );
        }

        Ownable(clone).transferOwnership(creator);
    }

    /**
     * @notice Deploy Series nft contract (ERC721)
     */
    function deploySeries721(
        bytes32 salt,
        address creator,
        address seriesImplementation,
        bytes memory initializeData,
        bytes memory mintVectorData,
        bytes memory mechanicVectorData,
        bool isCollectorsChoice
    ) external returns (address) {
        address clone = Clones.cloneDeterministic(seriesImplementation, salt);
        if (isCollectorsChoice) {
            ERC721General(clone).initialize(address(this), initializeData);
        } else {
            ERC721GeneralSequence(clone).initialize(address(this), initializeData);
        }

        if (mintVectorData.length > 0) {
            (
                address mintManager,
                address paymentRecipient,
                uint48 startTimestamp,
                uint48 endTimestamp,
                uint192 pricePerToken,
                uint48 tokenLimitPerTx,
                uint48 maxTotalClaimableViaVector,
                uint48 maxUserClaimableViaVector,
                address currency
            ) = abi.decode(
                    mintVectorData,
                    (address, address, uint48, uint48, uint192, uint48, uint48, uint48, address)
                );

            IAbridgedMintVector(mintManager).createAbridgedVector(
                IAbridgedMintVector.AbridgedVectorData(
                    uint160(clone),
                    startTimestamp,
                    endTimestamp,
                    uint160(paymentRecipient),
                    maxTotalClaimableViaVector,
                    0,
                    uint160(currency),
                    tokenLimitPerTx,
                    maxUserClaimableViaVector,
                    pricePerToken,
                    0,
                    false,
                    false,
                    0
                )
            );
        }

        if (mechanicVectorData.length != 0) {
            (uint96 seed, address mechanic, address mintManager, bytes memory vectorData) = abi.decode(
                mechanicVectorData,
                (uint96, address, address, bytes)
            );

            IMechanicMintManager(mintManager).registerMechanicVector(
                IMechanicData.MechanicVectorMetadata(clone, 0, mechanic, false, isCollectorsChoice, false),
                seed,
                vectorData
            );
        }

        Ownable(clone).transferOwnership(creator);
    }

    /**
     * @notice Deploy Single Edition nft contract (ERC721)
     */
    function deploySingleEdition721(
        bytes32 salt,
        address creator,
        address singleEditionImplementation,
        bytes memory initializeData,
        bytes memory mintVectorData,
        bytes memory mechanicVectorData,
        address _observability
    ) external returns (address) {
        address clone = Clones.cloneDeterministic(singleEditionImplementation, salt);
        ERC721SingleEditionDFS(clone).initialize(address(this), initializeData, _observability);

        if (mintVectorData.length > 0) {
            (
                address mintManager,
                address paymentRecipient,
                uint48 startTimestamp,
                uint48 endTimestamp,
                uint192 pricePerToken,
                uint48 tokenLimitPerTx,
                uint48 maxTotalClaimableViaVector,
                uint48 maxUserClaimableViaVector,
                address currency
            ) = abi.decode(
                    mintVectorData,
                    (address, address, uint48, uint48, uint192, uint48, uint48, uint48, address)
                );

            IAbridgedMintVector(mintManager).createAbridgedVector(
                IAbridgedMintVector.AbridgedVectorData(
                    uint160(clone),
                    startTimestamp,
                    endTimestamp,
                    uint160(paymentRecipient),
                    maxTotalClaimableViaVector,
                    0,
                    uint160(currency),
                    tokenLimitPerTx,
                    maxUserClaimableViaVector,
                    pricePerToken,
                    0,
                    true,
                    false,
                    0
                )
            );
        }

        if (mechanicVectorData.length != 0) {
            (uint96 seed, address mechanic, address mintManager, bytes memory vectorData) = abi.decode(
                mechanicVectorData,
                (uint96, address, address, bytes)
            );

            IMechanicMintManager(mintManager).registerMechanicVector(
                IMechanicData.MechanicVectorMetadata(clone, 0, mechanic, true, false, false),
                seed,
                vectorData
            );
        }

        Ownable(clone).transferOwnership(creator);
    }

    /**
     * @notice Deploy Multiple Editions nft contract (ERC721)
     */
    function deployMultipleEditions721(
        bytes32 salt,
        address creator,
        address multipleEditionsImplementation,
        bytes memory initializeData,
        string memory _editionUri,
        uint256 editionSize,
        address _editionTokenManager,
        IRoyaltyManager.Royalty memory editionRoyalty,
        bytes memory auctionData,
        bytes memory mintVectorData,
        bytes memory mechanicVectorData
    ) external returns (address) {
        address clone = Clones.cloneDeterministic(multipleEditionsImplementation, salt);
        ERC721EditionsDFS(clone).initialize(address(this), initializeData);

        // create edition
        /* solhint-disable max-line-length */
        if (bytes(_editionUri).length > 0) {
            if (mintVectorData.length > 0 && mechanicVectorData.length > 0) {
                ERC721EditionsDFS(clone).createEditionWithMechanicVectorAndPublicFixedPriceVector(
                    _editionUri,
                    editionSize,
                    _editionTokenManager,
                    editionRoyalty,
                    mintVectorData,
                    mechanicVectorData
                );
            } else if (mechanicVectorData.length > 0) {
                ERC721EditionsDFS(clone).createEditionWithMechanicVector(
                    _editionUri,
                    editionSize,
                    _editionTokenManager,
                    editionRoyalty,
                    mechanicVectorData
                );
            } else {
                ERC721EditionsDFS(clone).createEdition(
                    _editionUri,
                    editionSize,
                    _editionTokenManager,
                    editionRoyalty,
                    mintVectorData
                );
            }
        }

        if (auctionData.length > 0) {
            // if creating auction for this edition, validate that edition size was 1
            require(editionSize == 1, "Invalid edition size for auction");

            (
                address auctionManagerAddress,
                bytes32 auctionId,
                address auctionCurrency,
                address payable auctionPaymentRecipient,
                uint256 auctionEndTime
            ) = abi.decode(auctionData, (address, bytes32, address, address, uint256));

            // edition id guaranteed to be = 0
            IAuctionManager(auctionManagerAddress).createAuctionForNewEdition(
                auctionId,
                IAuctionManager.EnglishAuction(
                    clone,
                    auctionCurrency,
                    msg.sender,
                    auctionPaymentRecipient,
                    auctionEndTime,
                    0,
                    true,
                    IAuctionManager.AuctionState.LIVE_ON_CHAIN
                ),
                0
            );
        }

        Ownable(clone).transferOwnership(creator);
    }

    /**
     * @notice Deploy Editions nft contract (ERC1155)
     */
    function deployEditions1155(
        bytes32 salt,
        address creator,
        address editions1155Implementation,
        bytes memory initializeData,
        string memory _editionUri,
        uint256 editionSize,
        address _editionTokenManager,
        IRoyaltyManager.Royalty memory editionRoyalty,
        bytes memory mintVectorData,
        bytes memory mechanicVectorData
    ) external returns (address) {
        address clone = Clones.cloneDeterministic(editions1155Implementation, salt);
        ERC1155EditionsDFS(clone).initialize(address(this), initializeData);

        // create edition
        /* solhint-disable max-line-length */
        if (bytes(_editionUri).length > 0) {
            if (mintVectorData.length > 0 && mechanicVectorData.length > 0) {
                ERC1155EditionsDFS(clone).createEditionWithMechanicVectorAndPublicFixedPriceVector(
                    _editionUri,
                    editionSize,
                    _editionTokenManager,
                    editionRoyalty,
                    mintVectorData,
                    mechanicVectorData
                );
            } else if (mechanicVectorData.length > 0) {
                ERC1155EditionsDFS(clone).createEditionWithMechanicVector(
                    _editionUri,
                    editionSize,
                    _editionTokenManager,
                    editionRoyalty,
                    mechanicVectorData
                );
            } else {
                ERC1155EditionsDFS(clone).createEdition(
                    _editionUri,
                    editionSize,
                    _editionTokenManager,
                    editionRoyalty,
                    mintVectorData
                );
            }
        }

        Ownable(clone).transferOwnership(creator);
    }

    /**
     * @notice Predict CREATE2-deployed nft contract address
     */
    function predictContractAddress(address nftContractImplementation, bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(nftContractImplementation, salt);
    }
}

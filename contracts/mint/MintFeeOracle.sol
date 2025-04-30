// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

import "./interfaces/IMintFeeOracle.sol";
import "./interfaces/IAbridgedMintVector.sol";
import "./mechanics/interfaces/IMechanicMintManagerView.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../utils/FullMath.sol";
import "../utils/IUniswapV3PoolState.sol";
import "./referrals/IReferralManagerView.sol";
import "../erc1155/interfaces/IERC1155Standard.sol";

/**
 * @title MintManager's mint fee oracle
 * @author highlight.xyz
 */
contract MintFeeOracle is UUPSUpgradeable, OwnableUpgradeable {
    /**
     * @notice Throw when an action is unauthorized
     */
    error Unauthorized();

    /**
     * @notice Throw when an ERC20 is invalid
     */
    error InvalidERC20();

    /**
     * @notice Throw when an ERC20 config is invalid
     */
    error InvalidERC20Config();

    /**
     * @notice Throw when caller is not the MintManager
     */
    error NotMintManager();

    /**
     * @notice Throw when an invalid ether value is sent in when processing an ether mint fee cap
     */
    error InvalidEtherMintFeeCap();

    /**
     * @notice Throw when sending ether fails
     */
    error EtherSendFailed();

    /**
     * @notice Throw when a mint vector's expected type is false
     */
    error InvalidVectorType();

    /**
     * @notice Throw when resolved referrer is invalid
     */
    error InvalidReferrer();

    /**
     * @notice Config for allowlisted ERC20s
     * @param baseMintFee Base fee fee amount per token (if price isn't real-time)
     * @param realTimeOracle Address of real time oracle to query if price is real-time
     */
    struct ERC20Config {
        uint96 baseMintFee;
        address realTimeOracle;
    }

    /**
     * @notice MintManager
     */
    address private _mintManager;

    /**
     * @notice Mint fee subsidized config (vector + user)
     */
    mapping(bytes32 => bool) private _subsidizedMintConfig;

    /**
     * @notice Gasless mechanic address
     */
    address private _gaslessMechanicAddress;

    /**
     * @notice Allowlisted ERC20s -> mint fee
     */
    mapping(address => ERC20Config) private _allowlistedERC20s;

    /**
     * @notice When true, creator rewards is enabled
     */
    bool private _creatorRewardsEnabled;

    /**
     * @notice Constants for uniswap price calculation
     */
    uint256 public constant ETH_WEI = 10 ** 18;
    uint256 public constant FULL_MATH_SHIFT = 1 << 192;

    /**
     * @notice Backup referral manager
     */
    address private _backupReferralManager;

    /**
     * @notice Backup referral manager
     */
    address private _backupDiscreteDutchAuctionMechanic;

    /**
     * @notice Backup referral manager
     */
    address private _backupRankedAuctionMechanic;

    /**
     * @notice Custom mint fee (vector + user)
     * @dev A custom mint fee implies a value greater than 0, to make a mint fee free, use subsidizedMintConfig
     */
    mapping(bytes32 => uint256) private _customMintFee;

    /**
     * @notice Emitted when a referrer is paid out a portion of the mint fee
     * @param vectorId Vector ID
     * @param referrer Referrer
     * @param currency Currency
     * @param referralPayout Amount paid out to referrer
     */
    event ReferralPayout(
        bytes32 indexed vectorId,
        address indexed referrer,
        address indexed currency,
        uint256 referralPayout
    );

    /**
     * @notice Only let the mint manager call
     */
    modifier onlyMintManager() {
        if (msg.sender != _mintManager) {
            _revert(NotMintManager.selector);
        }
        _;
    }

    /* solhint-disable no-empty-blocks */
    /**
     * @notice Initialize contract
     */
    function initialize(
        address mintManager,
        address platform,
        address gaslessMechanic,
        address backupReferralManager,
        address backupDiscreteDutchAuctionMechanic,
        address backupRankedAuctionMechanic
    ) external initializer {
        __Ownable_init();
        _transferOwnership(platform);
        _mintManager = mintManager;
        _gaslessMechanicAddress = gaslessMechanic;
        _backupReferralManager = backupReferralManager;
        _backupDiscreteDutchAuctionMechanic = backupDiscreteDutchAuctionMechanic;
        _backupRankedAuctionMechanic = backupRankedAuctionMechanic;
    }

    /**
     * @notice Set an allowlisted erc20 config
     * @param erc20 ERC20 address
     * @param config ERC20 config
     */
    function setAllowlistedERC20Config(address erc20, ERC20Config calldata config) external onlyOwner {
        if (
            !(config.baseMintFee != 0 && config.realTimeOracle == address(0)) &&
            !(config.baseMintFee == 0 && config.realTimeOracle != address(0))
        ) {
            _revert(InvalidERC20Config.selector);
        }
        _allowlistedERC20s[erc20] = config;
    }

    /**
     * @notice Delist an allowlisted erc20 config
     * @param erc20 ERC20 address
     */
    function delistERC20(address erc20) external onlyOwner {
        delete _allowlistedERC20s[erc20];
    }

    /**
     * @notice Set mint manager
     */
    function setMintManager(address newMintManager) external onlyOwner {
        _mintManager = newMintManager;
    }

    /**
     * @notice Set backup referral manager
     */
    function setBackupReferralManager(address newBackupReferralManager) external onlyOwner {
        _backupReferralManager = newBackupReferralManager;
    }

    /**
     * @notice Set backup discrete dutch auction mechanic
     */
    function setBackupDiscreteDutchAuctionMechanic(address newBackupDiscreteDutchAuctionMechanic) external onlyOwner {
        _backupDiscreteDutchAuctionMechanic = newBackupDiscreteDutchAuctionMechanic;
    }

    /**
     * @notice Set backup ranked auction mechanic
     */
    function setBackupRankedAuctionMechanic(address newBackupRankedAuctionMechanic) external onlyOwner {
        _backupRankedAuctionMechanic = newBackupRankedAuctionMechanic;
    }

    /**
     * @notice Set gasless mechanic
     */
    function setGaslessMechanic(address newGaslessMechanic) external onlyOwner {
        _gaslessMechanicAddress = newGaslessMechanic;
    }

    /**
     * @notice Set creator rewards enabled
     */
    function setCreatorRewardsEnabled(bool creatorRewardsEnabled) external onlyOwner {
        _creatorRewardsEnabled = creatorRewardsEnabled;
    }

    /**
     * @notice Subsidize mint fee for a mint config (vector + sender)
     */
    function subsidizeMintConfig(bytes32 vectorId, address minter) external onlyOwner {
        bytes32 mintConfig = _encodeMintConfig(vectorId, minter);
        require(!_subsidizedMintConfig[mintConfig], "Already subsidized");
        _subsidizedMintConfig[mintConfig] = true;
    }

    /**
     * @notice Subsidize mint fee for a mint config (vector + sender)
     */
    function unsubsidizeMintVector(bytes32 vectorId, address minter) external onlyOwner {
        bytes32 mintConfig = _encodeMintConfig(vectorId, minter);
        require(_subsidizedMintConfig[mintConfig], "Not already subsidized");
        _subsidizedMintConfig[mintConfig] = false;
    }

    /**
     * @notice Set custom mint fee for a mint config (vector + sender)
     */
    function setCustomMintFee(bytes32 vectorId, address minter, uint256 customMintFee) external onlyOwner {
        bytes32 mintConfig = _encodeMintConfig(vectorId, minter);
        _customMintFee[mintConfig] = customMintFee;
    }

    /**
     * @notice Withdraw native gas token owed to platform
     */
    function withdrawNativeGasToken(uint256 amountToWithdraw, address payable recipient) external onlyOwner {
        (bool sentToPlatform, ) = recipient.call{ value: amountToWithdraw }("");
        if (!sentToPlatform) {
            _revert(EtherSendFailed.selector);
        }
    }

    /**
     * @notice Withdraw ERC20 owed to platform
     */
    function withdrawERC20(address currency, uint256 amountToWithdraw, address recipient) external onlyOwner {
        IERC20(currency).transfer(recipient, amountToWithdraw);
    }

    /* solhint-disable code-complexity */
    /**
     * @notice See {IMintFeeOracle-processClassicVectorMintFeeCap}
     */
    function processClassicVectorMintFeeCap(
        bytes32 vectorId,
        bool payoutCreatorReward,
        address vectorPaymentRecipient,
        address currency,
        uint256 amount,
        address minter,
        bool is1155
    ) external payable onlyMintManager returns (uint256) {
        if (currency == address(0)) {
            if (msg.value != amount) {
                _revert(InvalidEtherMintFeeCap.selector);
            }
        }

        address referralManager = _referralManager();
        if (referralManager == minter) {
            uint256 referralPayout = (amount * 10) / 100;
            // get referrer via referral manager
            address referrer = IReferralManagerView(referralManager).getCurrentReferrer(vectorId);

            // only send referral if minter wasn't referrer and if referrer wasn't zero address
            if (referrer != address(0) && referrer != tx.origin) {
                if (currency == address(0)) {
                    (bool sentToRecipient, ) = payable(referrer).call{ value: referralPayout }("");
                    if (!sentToRecipient) {
                        _revert(EtherSendFailed.selector);
                    }
                } else {
                    IERC20(currency).transfer(referrer, referralPayout);
                }

                emit ReferralPayout(vectorId, referrer, currency, referralPayout);
            }
        }

        if (payoutCreatorReward) {
            uint256 creatorPayout = is1155 ? ((amount * 8) / 10) : amount / 2;
            if (currency == address(0)) {
                (bool sentToRecipient, ) = vectorPaymentRecipient.call{ value: creatorPayout }("");
                if (!sentToRecipient) {
                    _revert(EtherSendFailed.selector);
                }
            } else {
                IERC20(currency).transfer(vectorPaymentRecipient, creatorPayout);
            }

            return creatorPayout;
        }

        return 0;
    }

    /* solhint-enable code-complexity */

    /**
     * @notice See {IMintFeeOracle-getClassicVectorMintFeeCap}
     */
    function getClassicVectorMintFeeCap(
        bytes32 vectorId,
        uint256 numToMint,
        address minter,
        address currency,
        address collectionContract
    ) external view returns (uint256, bool) {
        bool is1155 = _is1155(collectionContract);
        if (_isFeeSubsidized(vectorId, minter)) {
            return (0, is1155);
        }
        if (currency == address(0)) {
            return (_resolveNonSubsidizedMintFee(vectorId, minter, _nativeGasTokenMintFee(is1155)) * numToMint, is1155);
        } else {
            return (_getClassicVectorERC20MintFeeCap(currency, numToMint, is1155), is1155);
        }
    }

    /**
     * @notice See {IMintFeeOracle-getMechanicMintFee}
     */
    function getMechanicMintFee(
        bytes32 mechanicVectorId,
        uint32 numToMint,
        address mechanic,
        address minter,
        address collectionContract
    ) external view returns (uint256) {
        if (_isMintFeeWaivedMechanic(mechanic) || _isFeeSubsidized(mechanicVectorId, minter)) {
            return 0;
        } else {
            return
                _resolveNonSubsidizedMintFee(mechanicVectorId, minter, _nativeGasTokenMintFee(collectionContract)) *
                uint256(numToMint);
        }
    }

    /**
     * @notice Get public vector mint fee (optimized for offchain querying)
     */
    function getPublicVectorMintFee(
        uint256 vectorId,
        uint256 numToMint,
        address minter
    ) external view returns (uint256, address) {
        if (_isFeeSubsidized(bytes32(vectorId), minter)) {
            return (0, address(0));
        }
        IAbridgedMintVector.AbridgedVector memory _vector = IAbridgedMintVector(_mintManager).getAbridgedVector(
            vectorId
        );
        if (_vector.contractAddress == address(0)) {
            _revert(InvalidVectorType.selector);
        }
        if (_vector.currency != address(0)) {
            return (
                _getClassicVectorERC20MintFeeCap(_vector.currency, numToMint, _vector.contractAddress),
                _vector.currency
            );
        } else {
            return (
                _resolveNonSubsidizedMintFee(
                    bytes32(vectorId),
                    minter,
                    _nativeGasTokenMintFee(_vector.contractAddress)
                ) * uint256(numToMint),
                address(0)
            );
        }
    }

    /**
     * @notice Get gated vector mint fee (optimized for offchain querying)
     */
    function getGatedVectorMintFee(
        bytes32 vectorId,
        uint256 numToMint,
        address minter,
        address currency,
        address collectionContract
    ) external view returns (uint256, address) {
        if (_isFeeSubsidized(vectorId, minter)) {
            return (0, currency);
        }
        if (currency != address(0)) {
            return (_getClassicVectorERC20MintFeeCap(currency, numToMint, collectionContract), currency);
        }

        return (
            _resolveNonSubsidizedMintFee(vectorId, minter, _nativeGasTokenMintFee(collectionContract)) *
                uint256(numToMint),
            address(0)
        );
    }

    /**
     * @notice Get mechanic vector mint fee (optimized for offchain querying)
     */
    function getMechanicVectorMintFee(
        bytes32 vectorId,
        uint256 numToMint,
        address minter
    ) external view returns (uint256, address) {
        IMechanicData.MechanicVectorMetadata memory _mechanicMetadata = IMechanicMintManagerView(_mintManager)
            .mechanicVectorMetadata(vectorId);
        if (_mechanicMetadata.contractAddress == address(0)) {
            _revert(InvalidVectorType.selector);
        }
        if (_isMintFeeWaivedMechanic(_mechanicMetadata.mechanic) || _isFeeSubsidized(vectorId, minter)) {
            return (0, address(0));
        }

        return (
            _resolveNonSubsidizedMintFee(vectorId, minter, _nativeGasTokenMintFee(_mechanicMetadata.contractAddress)) *
                uint256(numToMint),
            address(0)
        );
    }

    /**
     * @notice Limit upgrades of contract to MintFeeOracle owner
     * @param // New implementation address
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}

    /**
     * @dev For more efficient reverts.
     */
    function _revert(bytes4 errorSelector) internal pure {
        assembly {
            mstore(0x00, errorSelector)
            revert(0x00, 0x04)
        }
    }

    /**
     * @notice Return if mint fee is subsidized for a mint config
     * @param vectorId ID of vector
     * @param minter Original minter address
     */
    function _isFeeSubsidized(bytes32 vectorId, address minter) private view returns (bool) {
        return
            _subsidizedMintConfig[_encodeMintConfig(vectorId, minter)] ||
            _subsidizedMintConfig[_encodeMintConfig(vectorId, 0x000000000000000000000000000000000000dEaD)]; // meaning subsidized for all minters
    }

    /**
     * @notice Return mint fee for a vector that hasn't been subsidized
     * @param vectorId ID of vector
     * @param minter Original minter address
     * @param defaultMintFee Default mint fee for the chain
     */
    function _resolveNonSubsidizedMintFee(
        bytes32 vectorId,
        address minter,
        uint256 defaultMintFee
    ) private view returns (uint256) {
        uint256 minterSpecificFee = _customMintFee[_encodeMintConfig(vectorId, minter)];
        if (minterSpecificFee > 0) {
            return minterSpecificFee;
        } else {
            uint256 globalFee = _customMintFee[_encodeMintConfig(vectorId, 0x000000000000000000000000000000000000dEaD)];
            return globalFee > 0 ? globalFee : defaultMintFee;
        }
    }

    /**
     * @notice Encode a mint config
     * @param vectorId ID of vector
     * @param minter Original minter address
     */
    function _encodeMintConfig(bytes32 vectorId, address minter) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(vectorId, minter));
    }

    function _getClassicVectorERC20MintFeeCap(
        address currency,
        uint256 numToMint,
        address collectionContract
    ) private view returns (uint256) {
        ERC20Config memory config = _allowlistedERC20s[currency];
        uint256 divisor = _is1155(collectionContract) ? 2 : 1;
        if (config.baseMintFee != 0) {
            return (config.baseMintFee / divisor) * numToMint;
        } else if (config.realTimeOracle != address(0)) {
            (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3PoolState(config.realTimeOracle).slot0();
            return _nativeGasTokenMintFee(collectionContract) * sqrtPriceX96ToUint(sqrtPriceX96) * numToMint;
        } else {
            _revert(InvalidERC20.selector);
        }
    }

    function _getClassicVectorERC20MintFeeCap(
        address currency,
        uint256 numToMint,
        bool is1155
    ) private view returns (uint256) {
        ERC20Config memory config = _allowlistedERC20s[currency];
        uint256 divisor = is1155 ? 2 : 1;
        if (config.baseMintFee != 0) {
            return (config.baseMintFee / divisor) * numToMint;
        } else if (config.realTimeOracle != address(0)) {
            (uint160 sqrtPriceX96, , , , , , ) = IUniswapV3PoolState(config.realTimeOracle).slot0();
            return _nativeGasTokenMintFee(is1155) * sqrtPriceX96ToUint(sqrtPriceX96) * numToMint;
        } else {
            _revert(InvalidERC20.selector);
        }
    }

    /* solhint-disable code-complexity */

    function _isMintFeeWaivedMechanic(address mechanic) private view returns (bool) {
        // RAM, DDAM
        // we don't hit mint fee oracle in case of gasless mechanic
        if (block.chainid == 1) {
            return
                mechanic == 0xDFEe0Ed4A217F37b3FA87624eE00fe5685bDc509 ||
                mechanic == 0x94Fa6e7Fc2555aDA63eA56cfFF425558360F0074;
        } else if (block.chainid == 8453) {
            return
                mechanic == 0x922E9f8cc491fACBd403afa143AA53ee9146474C ||
                mechanic == 0xA748BE280C9a00edaF7d04076FE8A93c59e95B03;
        } else if (block.chainid == 10) {
            return
                mechanic == 0xb207774Ac4E32eCE47771e64BDE5ec3894C1De6b ||
                mechanic == 0x15753e20667961fB30d5aa92e2255B876568BE7e;
        } else if (block.chainid == 42161) {
            return
                mechanic == 0x7f75358787f880506c5dc6100386F77be8DE0A30 ||
                mechanic == 0x3a2aFe86E594540cbf3eA345dd29e09228f186D2;
        } else if (block.chainid == 7777777) {
            return
                mechanic == 0x0AFB6566C836D1C4788cD2b54Bd9cA0158CC2D3D ||
                mechanic == 0xf12A4018647DD2275072967Fd5F3ac5Fef7a0471;
        } else if (block.chainid == 137) {
            return
                mechanic == 0x4CCB72E7E0Cd948aF50bC7Bf598Fc4E027b70f98 ||
                mechanic == 0xAE22Cd8052D64e7C2aF6B5E3045Fab0a86C8334C;
        } else if (block.chainid == 11155111) {
            return
                mechanic == 0xa2D14CA9985De170db128c8CB74Cecb35eEAF47E ||
                mechanic == 0xceBc3B3134FbEF95ED13AEcdF997D4371d022385;
        } else if (block.chainid == 84532) {
            return
                mechanic == 0x9958F83F383CA150BB2252B4275D3e3051be469F ||
                mechanic == 0x4821B6e9aC0CCC590acCe2442bb6BB32388C1CB7;
        } else if (block.chainid == 984122) {
            return
                mechanic == 0x5AA1C7F5f9d2e7F2664d3C1f454560C6DaBED6c8 ||
                mechanic == 0x9c602CE508E41ccAF2cF997D93A9FbE0166D8aE6;
        } else if (block.chainid == 5000) {
            return
                mechanic == 0xd8f0A3AA4067be3D70a5B46A795Ad9dF9E65Cd3C ||
                mechanic == 0xaF4d61951A425BA60ac1E7EA6d51e92d2F4748E4;
        } else if (block.chainid == 534352) {
            return
                mechanic == 0xF6C67C7bb7018E4609d571023196A4682FdA6F2f ||
                mechanic == 0xE019FF8033d9C761985A3EE1fa5d97Cc9Cf6d5c0;
        } else if (block.chainid == 324) {
            return
                mechanic == 0x89640D083837d9487e4E1c2122aCc1adaf0E5654 ||
                mechanic == 0xc1c701D7A488b46fF095Ec4094DDd5aB78C9421E;
        } else if (block.chainid == 360) {
            return
                mechanic == 0x8c23711a0536397C261Bf83Ec474B9aAf05C549B ||
                mechanic == 0xd8f0A3AA4067be3D70a5B46A795Ad9dF9E65Cd3C;
        } else if (block.chainid == 7560) {
            return
                mechanic == 0x8c23711a0536397C261Bf83Ec474B9aAf05C549B ||
                mechanic == 0x526fe4Ed6f23f34a97015E41f469fD54f37036f5;
        } else if (block.chainid == 543210) {
            return
                mechanic == 0x99F80FF8C7607E8E6b6A998E9389DcaEc97BA9c9 ||
                mechanic == 0xD5B168f790582255c9c82cB65193A009cD6C2c67;
        } else if (block.chainid == 33139) {
            return
                mechanic == 0xF76d8B2aFB77f663d420F827fCa7bCc1b419515F ||
                mechanic == 0xF6C67C7bb7018E4609d571023196A4682FdA6F2f;
        }

        return
            mechanic == _backupDiscreteDutchAuctionMechanic ||
            mechanic == _backupRankedAuctionMechanic ||
            mechanic == _gaslessMechanicAddress;
    }

    /**
     * @notice Get the referral manager
     */
    function _referralManager() private view returns (address) {
        if (block.chainid == 1) {
            return 0xD3C63951b2Ed18e8d92B5b251C3B636A45A547d0;
        } else if (block.chainid == 8453) {
            return 0xd9E58978808d17F99ccCEAb5195B052E972c0188;
        } else if (block.chainid == 10) {
            return 0x9CF5B12D2e2a88083647Ff2Fe0610F818b28eC77;
        } else if (block.chainid == 7777777) {
            return 0x7Cb2cecFCFFdccE0bf69366e52caec6BD719CD44;
        } else if (block.chainid == 42161) {
            return 0x617b2383D93909590fAC0b2aaa547EC5615d82eF;
        } else if (block.chainid == 137) {
            return 0x6fd07d4B5fd7093762Fb2f278769aa7e2511d45c;
        } else if (block.chainid == 84532) {
            return 0x4619b9673241eB41B642Dc04371100d238b73fFE;
        } else if (block.chainid == 11155111) {
            return 0xd33c1bE264bb98F86e18CD816D5fd44e97cb7163;
        } else if (block.chainid == 984122) {
            return 0x9491aA1c2f46319A645637c4105f4199B251e4dD;
        } else if (block.chainid == 5000) {
            return 0xAFfC7C9BfB48FFD2a580e1a0d36f8cc7D45Dcb58;
        } else if (block.chainid == 534352) {
            return 0x4821B6e9aC0CCC590acCe2442bb6BB32388C1CB7;
        } else if (block.chainid == 324) {
            return 0x4b189127A784de57bDcDb59E0Ab18086e0b7a1BC;
        } else if (block.chainid == 360) {
            return 0xe2CE42156E8456704fbEA047419404858E9324Af;
        } else if (block.chainid == 7560) {
            return 0xF76d8B2aFB77f663d420F827fCa7bCc1b419515F;
        } else if (block.chainid == 543210) {
            return 0x24d7F95783F5F5Ed37BCbbE303A14bE0627DFC2e;
        } else if (block.chainid == 33139) {
            return 0xaF4d61951A425BA60ac1E7EA6d51e92d2F4748E4;
        } else {
            return _backupReferralManager;
        }
    }

    /**
     * @notice Get the native gas token mint fee for the chain
     */
    function _nativeGasTokenMintFee(address collectionContract) private view returns (uint256) {
        uint256 divisor = _is1155(collectionContract) ? 2 : 1;
        if (block.chainid == 137) {
            return 2265000000000000000 / divisor;
        } else if (block.chainid == 984122) {
            return 500000000000000000 / divisor;
        } else if (block.chainid == 5000) {
            return 3500000000000000000 / divisor;
        } else if (block.chainid == 33139) {
            return 2500000000000000000 / divisor;
        } else {
            return 800000000000000 / divisor;
        }
    }

    /**
     * @notice Get the native gas token mint fee for the chain
     */
    function _nativeGasTokenMintFee(bool is1155) private view returns (uint256) {
        uint256 divisor = is1155 ? 2 : 1;
        if (block.chainid == 137) {
            return 2265000000000000000 / divisor;
        } else if (block.chainid == 984122) {
            return 500000000000000000 / divisor;
        } else if (block.chainid == 5000) {
            return 3500000000000000000 / divisor;
        } else if (block.chainid == 33139) {
            return 2500000000000000000 / divisor;
        } else {
            return 800000000000000 / divisor;
        }
    }

    /**
     * @notice Convert uniswap sqrtX96 price
     * @dev token0 always assumed to be ETH
     */
    function sqrtPriceX96ToUint(uint160 sqrtPriceX96) private pure returns (uint256) {
        return FullMath.mulDiv(uint256(sqrtPriceX96) * uint256(sqrtPriceX96), ETH_WEI, FULL_MATH_SHIFT);
    }

    /**
     * @notice Return if collection is an ERC1155 contract
     */
    function _is1155(address collectionContract) private view returns (bool) {
        try IERC1155Standard(collectionContract).highlightContractStandardHash() returns (bytes32 standardHash) {
            return standardHash == 0x3a9654d81ac4dafbb9a2fb1cd3efa3de2783ae40b06b17a456bf5922ed02a3a7;
        } catch Error(string memory reason) {
            return false;
        } catch {
            return false;
        }
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

interface IReferralManagerView {
    /**
     * @notice Get referrer for a tx
     */
    function getCurrentReferrer(bytes32 vectorId) external view returns (address);
}

// SPDX-License-Identifier: MIT

pragma solidity 0.8.10;

/**
 * @author highlight.xyz
 * @notice If token managers implement this, transfer actions will call
 *      postBurn on the token manager.
 */
interface IPostBurn {
    /**
     * @notice Hook called by contract after burn, if token manager of burned token implements this
     *      interface.
     * @param operator Operator burning tokens
     * @param sender Msg sender
     * @param id Burned token's id or id of edition of token that is burned
     */
    function postBurn(address operator, address sender, uint256 id) external;

    /**
     * @notice Hook called by contract after burn, if token manager of burned token implements this
     *      interface.
     * @param operator Operator burning tokens
     * @param sender Msg sender
     * @param id Burned token's id or id of edition of token that is burned
     * @param amount Amount of tokens burned (in 1155 case)
     */
    function postBurnAmount(address operator, address sender, uint256 id, uint256 amount) external;
}

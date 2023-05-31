// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IVictim {
    function buy() external payable returns (bool);

    function sell(uint256 tokensToSell) external returns (bool);

    function vote(uint256 price) external returns(bool);

    function balanceOf(address _account) external view returns(uint256);
}
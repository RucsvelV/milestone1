// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IVotable.sol";

// contact sizer and gas repourter plaguins
contract VotableERC20 is IERC20, IVotable {
    string public name;
    uint256 public maxTokenSupply;
    // change simple getters of public variables 
    uint256 public totalTokenSupply;
    uint256 public tokenPrice;
    uint256 public feePercent;
    uint8 public constant decimals = 18;
    address payable public owner;
    uint256 public minTokenAmountForVoting;
    uint256 public timeToVote;
    uint256 public voteCountdown;

    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) private allowances;
    mapping(address => uint256) public votes;
    mapping(uint256 => uint256) public proposedPrices;
    uint256 public winningPrice;

    modifier onlyOwner {
        require(msg.sender == owner, "Caller is not owner");
        _;
    }

    constructor(string memory _name, uint256 _tokenPrice, uint256 _maxTokenSupply, uint256 _timeToVote, uint256 _feePercent) {
        name = _name;
        tokenPrice = _tokenPrice;
        maxTokenSupply = _maxTokenSupply;
        owner = payable(msg.sender);
        timeToVote = _timeToVote;
        minTokenAmountForVoting = (maxTokenSupply * 5) / 10000;
        feePercent = _feePercent;
    }

    // check lost eth in the contract
    function buy() public payable returns (bool) {
        require(msg.value > 0, "Send some ether to buy tokens.");

        uint256 fee = (msg.value * feePercent) / 100;
        uint256 netValue = msg.value - fee;
        uint256 tokensToBuy = (netValue * 10**decimals) / tokenPrice;

        require(tokensToBuy <= (maxTokenSupply - totalTokenSupply) * 10**decimals, "Max supply of tokens is touched.");
        
        balances[msg.sender] += tokensToBuy;
        totalTokenSupply += tokensToBuy;

        return true;
    }

    // call vs transfer, attacker with recieve and transfer, see a possibility to reenterency
    function sell(uint256 tokensToSell) public returns (bool) {
        // balanceOf()
        require(balances[msg.sender] >= tokensToSell, "Not enough tokens"); // already spent gas

        uint256 etherToReturn = (tokensToSell * tokenPrice) / (10**decimals);
        uint256 fee = (etherToReturn * feePercent) / 100;
        uint256 netReturn = etherToReturn - fee;
        // fix condition with tokensToSell
        require(address(this).balance >= netReturn, "Contract doesn't have enough ether to pay");
        
        // way to cheap up with unchecked 
        balances[msg.sender] -= tokensToSell * 10**decimals;   

        totalTokenSupply -= tokensToSell;
        payable(msg.sender).transfer(netReturn);
        
        return true;
    }
    // change to be able to start voting not only for owner 
    function startVote() external override onlyOwner {
        require(balances[msg.sender] >= minTokenAmountForVoting, "Not enough tokens for starting a vote");
        voteCountdown = block.timestamp + timeToVote;
        emit VoteStarted(voteCountdown);
    }

    // make an attack based on double voiting in vote/sell/send functions 
    function vote(uint256 _proposedPrice) external override returns(bool) {
        require(block.timestamp <= voteCountdown, "Voting time is over");
        require(balances[msg.sender] >= minTokenAmountForVoting, "Not enough tokens for voting");

        votes[msg.sender] = _proposedPrice;
        // think about array solution what is more perfomant and what is more vulnarable 
        proposedPrices[_proposedPrice] += balances[msg.sender];
        emit Voted(msg.sender, _proposedPrice);

        return true;
    }

// think abot arrays // think about array solution what is more perfomant and what is more vulnarable 
    function endVote() external override onlyOwner {
        require(block.timestamp > voteCountdown, "Voting is not over yet");

        uint256 maxVotes = 0;
        uint256 winningPriceTemp = 0;

        for(uint256 i = 1; i <= totalTokenSupply; i++){
            if(proposedPrices[i] > maxVotes){
                maxVotes = proposedPrices[i];
                winningPriceTemp = i;
            }
        }

        winningPrice = winningPriceTemp;
        tokenPrice = winningPrice;
        emit PriceChanged(winningPrice);
    }

    function totalSupply() external view override returns (uint256) {
        return totalTokenSupply;
    }

    function minTokenAmount() public view override returns(uint256) {
        return minTokenAmountForVoting;
    }

    function balanceOf(address _account) external view override returns(uint256) {
        return balances[_account];
    }

    function transfer(address _to, uint256 _amount) external override returns(bool) {
        _transfer(msg.sender, _to, _amount);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _amount) external override returns(bool) {
        uint256 currentAllowance = allowances[_from][msg.sender];
        require(currentAllowance >= _amount, "Transfer amount exceeds allowance");
        _transfer(_from, _to, _amount);
        allowances[_from][msg.sender] = currentAllowance - _amount;
        return true;
    }

    function allowance(address _owner, address _spender) external view override returns(uint256) {
        return allowances[_owner][_spender];
    }

    function approve(address _spender, uint256 _amount) external override returns(bool) {
        allowances[msg.sender][_spender] = _amount;

        emit Approval(msg.sender, _spender, _amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(from != address(0), "Cannot transfer from zero address");
        require(to != address(0), "Cannot transfer to zero address");
        require(balances[from] >= amount, "Not enough tokens");

        balances[from] -= amount;
        balances[to] += amount;

        emit Transfer(from, to, amount);
    }
}

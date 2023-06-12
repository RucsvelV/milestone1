// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IVotable.sol";
import "hardhat/console.sol";

// contact sizer and gas repourter plaguinsz
contract VotableERC20 is IERC20, IVotable {
    struct VoteProposedPrice {
        uint256 proposedPrice;
        uint256 voteId;
    }

    string public name;
    string public symbol;

    bool public isVoting = false;
    uint256 public maxTokenSupply;
    uint256 public totalTokenSupply;
    uint256 public tokenPrice;
    uint256 public feePercent;
    uint8 public constant decimals = 18;
    uint16 public constant feeDecimals = 10000;
    address payable public owner;
    uint256 public minTokenAmountForVoting = 1 ** decimals;
    uint256 public minTokenAmountForAddVotePrice;
    uint256 public timeToVote;
    uint256 public voteCountdown;
    uint256 public currentVoteId = 0;

    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) private allowances;

    mapping(uint256 => uint256) private proposedPriceToTotal;
    mapping(address => VoteProposedPrice) private voterToProposedPrice;
    uint256[] public proposedPrices;
    
    uint256 public winningPrice;

    modifier onlyOwner {
        require(msg.sender == owner, "Caller is not owner");
        _;
    }

    modifier isAllowToVote {
        require(block.timestamp <= voteCountdown, "Voting time is over");
        require(voterToProposedPrice[msg.sender].proposedPrice == 0 && voterToProposedPrice[msg.sender].voteId != currentVoteId, "You already voted!");
        _;
    }

    constructor(string memory _name, string memory _symbol, uint256 _tokenPrice, uint256 _maxTokenSupply, uint256 _timeToVote, uint256 _feePercent) {
        name = _name;
        symbol = _symbol;
        tokenPrice = _tokenPrice;
        maxTokenSupply = _maxTokenSupply;
        owner = payable(msg.sender);
        timeToVote = _timeToVote;
        minTokenAmountForAddVotePrice = (maxTokenSupply * 5) / 10000;
        feePercent = _feePercent;
    }

    function setFeePercent(uint256 _newFeePercent) public onlyOwner {
        require(_newFeePercent < feeDecimals, "You can't set fee of whole sum");
        feePercent = _newFeePercent;
    }

    function buy() public payable returns (bool) {
        require(msg.value > 0, "Send some ether to buy tokens.");

        uint256 fee = (msg.value * feePercent) / feeDecimals;
        uint256 netValue = msg.value - fee;
        uint256 tokensToBuy = netValue / tokenPrice;

        require(tokensToBuy <= maxTokenSupply - totalTokenSupply, "Max supply of tokens is touched.");

        _mint(msg.sender, tokensToBuy);

        if(voterToProposedPrice[msg.sender].proposedPrice != 0 && voterToProposedPrice[msg.sender].voteId == currentVoteId) {
            proposedPriceToTotal[voterToProposedPrice[msg.sender].proposedPrice] += tokensToBuy;
        }

        return true;
    }

    function sell(uint256 tokensToSell) public returns (bool) {
        require(this.balanceOf(msg.sender) >= tokensToSell, "Not enough tokens");

        uint256 etherToReturn = (tokensToSell * tokenPrice);
        uint256 fee = (etherToReturn * feePercent) / feeDecimals;
        uint256 netReturn = etherToReturn - fee;

        require(address(this).balance >= netReturn, "Contract doesn't have enough ether to pay");

        _burn(msg.sender, tokensToSell);

        _updateVoterAfterTransfer(msg.sender, tokensToSell);

        payable(msg.sender).transfer(netReturn);

        return true;
    }

    function startVote() external override {
        require(!isVoting, "Previus voting is not over yet!");
        require(balances[msg.sender] >= minTokenAmountForAddVotePrice, "Not enough tokens for starting a vote!");
        isVoting = true;
        voteCountdown = block.timestamp + timeToVote;
        currentVoteId++;
        emit VoteStarted(voteCountdown);
    }


    function addVotePrice(uint256 _proposedPrice) external isAllowToVote {
        require(proposedPriceToTotal[_proposedPrice] == 0, "Someone already added that price, you can vote for that instead");
        require(balances[msg.sender] >= minTokenAmountForAddVotePrice, "Not enough tokens for add vote price");

        proposedPriceToTotal[_proposedPrice] += this.balanceOf(msg.sender);
        voterToProposedPrice[msg.sender] = VoteProposedPrice(_proposedPrice, currentVoteId);
        proposedPrices.push(_proposedPrice);

        emit Voted(msg.sender, _proposedPrice);
    }
    // unite both functions 
    function vote(uint256 _proposedPrice) external override isAllowToVote {
        require(proposedPriceToTotal[_proposedPrice] != 0, "There is no such price lot yet");
        require(balances[msg.sender] >= minTokenAmountForVoting, "Not enough tokens for voting");

        voterToProposedPrice[msg.sender] = VoteProposedPrice(_proposedPrice, currentVoteId);
        proposedPriceToTotal[_proposedPrice] += this.balanceOf(msg.sender);

        emit Voted(msg.sender, _proposedPrice);
    }

    function endVote() external override {
        require(block.timestamp > voteCountdown, "Voting is not over yet");

        uint256 maxVotes = 0;
        uint256 _totalOfPrice = 0;
        uint256 winingPrice;

        for(uint256 i = 0; i < proposedPrices.length; i++) {
            _totalOfPrice = proposedPriceToTotal[proposedPrices[i]];

            if(_totalOfPrice > maxVotes){
                maxVotes = _totalOfPrice;
                winingPrice = proposedPrices[i];
            }

            // proposedPriceToTotal[proposedPrices[i]] = 0; we can replace it with delete proposedPriceToTotal[proposedPrices[i]] and we dont lose anything but cheep up
            // test it
            delete proposedPriceToTotal[proposedPrices[i]];
        }
        
        if(maxVotes != 0) {
            tokenPrice = winingPrice;
            isVoting = false;
            emit PriceChanged(tokenPrice);
        }
    }

    function totalSupply() external view override returns (uint256) {
        return totalTokenSupply;
    }

    function totalOfPrice(uint256 _price) external view returns(uint256) {
        return proposedPriceToTotal[_price];
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

        _updateVoterAfterTransfer(from, amount);

        emit Transfer(from, to, amount);
    }

    function _updateVoterAfterTransfer(address voter, uint256 transferAmount) private {
        if(voterToProposedPrice[voter].proposedPrice != 0 && voterToProposedPrice[voter].voteId == currentVoteId) {
            if(this.balanceOf(voter) < minTokenAmountForVoting) {
                proposedPriceToTotal[voterToProposedPrice[voter].proposedPrice] -= (transferAmount + this.balanceOf(voter));
            } else {
                proposedPriceToTotal[voterToProposedPrice[voter].proposedPrice] -= transferAmount;
            }
        }
    }

    function _mint(address to, uint256 amount) private {
        balances[to] += amount;
        totalTokenSupply += amount;
    }

    function _burn(address from, uint256 amount) private {
        balances[from] -= amount;
        totalTokenSupply -= amount;
    }
}
// modifier A() {
//   require(true);
//   _;
//   require(false);
// }
// Ilya Kubariev4:25 PM
// BloomFilter
// Ilya Kubariev4:30 PM
// struct A {
//    uint256  a;
//    uint256 b;
// }
// struct B {
//    uint256  a;
//    uint128 b;
//    uint128 c;
// }
// Ilya Kubariev4:35 PM
// _selfdestruct()
// Ilya Kubariev4:37 PM
// ERC20
// ERC20Tradable
// ERC20Votable
// Ilya Kubariev4:38 PM
// ERC20TradableVotable -> ERC20Tradable, ERC20Votable -> ERC20
// Ilya Kubariev4:42 PM
// override(ERC20Tradable, ERC20Votable)
// You4:48 PM
// 1: how much indexed properites can be 'indexed' in event?
// 2:which types of data can be indexed?
// 3:How to define another function as param to function? and why we cant use it with public functions?
// 4: clastering of uint variables
// 5: how to send eth to cotract whre resieve function (_selfdestruct)
// 6: abstract contracts and why they need for us?
// Ilya Kubariev4:51 PM
// uint[] public arr;

// f () {
//   uint[] storage ar = arr;
//   ar.push(2)
// }

// f1 () {
//   uint[] memory ar = arr;
//    ar.push(2)
// }
// Ilya Kubariev4:56 PM
// f (string calldata name) {
//   console.log("%s", name);
// }
// f1 (string memory name) {
//   console.log("%s", name);
// }
// Ilya Kubariev4:58 PM
// f2 (string storage name) {
//   console.log("%s", name);
// }
// string _name;

// f() {
//   f1(_name);
// }

// f1 (string storage name) {
//   name = "123";
// }
// Ilya Kubariev5:03 PM
// library SafeMath {
//   add(uint256 a, uint256 b) {
//     return a + b;
//   }
// }
// using SafeMath for uint256;
// f() {
//   uint256 a = 1;
//   uint256 b = 2;
//   return a.add(b);
// }
// Ilya Kubariev5:05 PM
// f() {
//   uint256 a = 1;
//   uint256 b = 2;
//   return SafeMath.add(a, b);
// }
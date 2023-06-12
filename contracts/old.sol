// // SPDX-License-Identifier: Unlicense
// pragma solidity ^0.8.0;

// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import "./IVotable.sol";
// import "hardhat/console.sol";
// import "./ArrayLib.sol";

// // contact sizer and gas repourter plaguinsz
// // implrmrnt Ierc20 metadata
// contract VotableERC20 is IERC20, IVotable {
//     using ArrayLib for address[];
//     using ArrayLib for uint256[];

//     string public name;
//     bool public isVoting = false;
//     uint256 public maxTokenSupply;
//     // change simple getters of public variables
//     uint256 public totalTokenSupply;
//     uint256 public tokenPrice;
//     uint256 public feePercent;
//     uint8 public constant decimals = 18;
//     uint16 public constant feeDecimals = 10000;
//     address payable public owner;
//     uint256 public minTokenAmountForVoting;
//     uint256 public timeToVote;
//     uint256 public voteCountdown;

//     mapping(address => uint256) private balances;
//     mapping(address => mapping(address => uint256)) private allowances;
//     // mapping(address => uint256) public votes;
//     // mapping(uint256 => uint256) public proposedPrices;
//     mapping(uint256 => address[]) public votes;
//     uint256[] public proposedPrices;
//     uint256 public winningPrice;

//     modifier onlyOwner {
//         require(msg.sender == owner, "Caller is not owner");
//         _;
//     }

//     constructor(string memory _name, uint256 _tokenPrice, uint256 _maxTokenSupply, uint256 _timeToVote, uint256 _feePercent) {
//         name = _name;
//         tokenPrice = _tokenPrice;
//         maxTokenSupply = _maxTokenSupply;
//         owner = payable(msg.sender);
//         timeToVote = _timeToVote;
//         minTokenAmountForVoting = (maxTokenSupply * 5) / 10000;
//         feePercent = _feePercent;
//     }

//     function setFeePercent(uint256 _newFeePercent) public onlyOwner returns(bool) {
//         require(_newFeePercent < feeDecimals, "You can't set fee of whole sum");
//         feePercent = _newFeePercent;
//     }

//     function buy() public payable returns (bool) {
//         require(msg.value > 0, "Send some ether to buy tokens.");

//         uint256 fee = (msg.value * feePercent) / feeDecimals;
//         uint256 netValue = msg.value - fee;
//         uint256 tokensToBuy = netValue / tokenPrice;

//         require(tokensToBuy <= maxTokenSupply - totalTokenSupply, "Max supply of tokens is touched.");

//         balances[msg.sender] += tokensToBuy;
//         totalTokenSupply += tokensToBuy;

//         return true;
//     }

//     // call vs transfer, attacker with recieve and transfer, see a possibility to reenterency
//     function sell(uint256 tokensToSell) public returns (bool) {
//         require(this.balanceOf(msg.sender) >= tokensToSell, "Not enough tokens");

//         uint256 etherToReturn = (tokensToSell * tokenPrice);
//         uint256 fee = (etherToReturn * feePercent) / feeDecimals;
//         uint256 netReturn = etherToReturn - fee;

//         require(address(this).balance >= netReturn, "Contract doesn't have enough ether to pay");

//         // move it to mint function
//         balances[msg.sender] -= tokensToSell;
//         totalTokenSupply -= tokensToSell;
//         payable(msg.sender).transfer(netReturn);

//         return true;
//     }

//     function startVote() external override {
//         require(!isVoting, "Previus voting is not over yet!");
//         require(balances[msg.sender] >= minTokenAmountForVoting, "Not enough tokens for starting a vote!");
//         isVoting = true;
//         voteCountdown = block.timestamp + timeToVote;
//         emit VoteStarted(voteCountdown);
//     }


//     // any holders that owns at least one token should be able to vote for price, but only holders that owns 0.5 and mor persents should be able to add new prices to vote
//     function vote(uint256 _proposedPrice) external override returns(bool) {
//         require(block.timestamp <= voteCountdown, "Voting time is over");
//         require(balances[msg.sender] >= minTokenAmountForVoting, "Not enough tokens for voting");

//         if(!proposedPrices.isUintInArray(_proposedPrice)){
//             proposedPrices.push(_proposedPrice);
//         }

//         require(!votes[_proposedPrice].isAddressInArray(msg.sender), "You already voted!");

//         votes[_proposedPrice].push(msg.sender); 

//         emit Voted(msg.sender, _proposedPrice);

//         return true;
//     }

//     // goats in openeplin (just check it out, not refference)
//     // consider possibility that could be gas limit (by malissious actions)
//     function endVote() external override {
//         require(block.timestamp > voteCountdown, "Voting is not over yet");

//         uint256 maxVotes = 0;
//         uint256 allVotesOfPrice = 0;
//         uint256 winingPrice;

//         for(uint256 i = 0; i < proposedPrices.length; i++) {
//             allVotesOfPrice = this._balanceOfAddresses(votes[proposedPrices[i]]);

//             if(allVotesOfPrice > maxVotes){
//                 maxVotes = allVotesOfPrice;
//                 winingPrice = proposedPrices[i];
//             }
//         }
//         if(maxVotes != 0) {
//             tokenPrice = winingPrice;
//             isVoting = false;
//             emit PriceChanged(maxVotes);
//         }
//     }

//     function totalSupply() external view override returns (uint256) {
//         return totalTokenSupply;
//     }

//     function minTokenAmount() public view override returns(uint256) {
//         return minTokenAmountForVoting;
//     }

//     function balanceOf(address _account) external view override returns(uint256) {
//         return balances[_account];
//     }

//     function transfer(address _to, uint256 _amount) external override returns(bool) {
//         _transfer(msg.sender, _to, _amount);
//         return true;
//     }

//     function transferFrom(address _from, address _to, uint256 _amount) external override returns(bool) {
//         uint256 currentAllowance = allowances[_from][msg.sender];
//         require(currentAllowance >= _amount, "Transfer amount exceeds allowance");
//         _transfer(_from, _to, _amount);
//         allowances[_from][msg.sender] = currentAllowance - _amount;
//         return true;
//     }

//     function allowance(address _owner, address _spender) external view override returns(uint256) {
//         return allowances[_owner][_spender];
//     }

//     function approve(address _spender, uint256 _amount) external override returns(bool) {
//         allowances[msg.sender][_spender] = _amount;

//         emit Approval(msg.sender, _spender, _amount);
//         return true;
//     }

//     function _transfer(address from, address to, uint256 amount) private {
//         require(from != address(0), "Cannot transfer from zero address");
//         require(to != address(0), "Cannot transfer to zero address");
//         require(balances[from] >= amount, "Not enough tokens");

//         balances[from] -= amount;
//         balances[to] += amount;

//         emit Transfer(from, to, amount);
//     }

//     function _balanceOfAddresses(address[] memory addresses) public view returns(uint256) {
//         uint256 addressesSum = 0;
//         for(uint256 i = 0; i < addresses.length; i++) {
//             addressesSum += this.balanceOf(addresses[i]);
//         }
//         return addressesSum;
//     }
// }
// // modifier A() {
// //   require(true);
// //   _;
// //   require(false);
// // }
// // Ilya Kubariev4:25 PM
// // BloomFilter
// // Ilya Kubariev4:30 PM
// // struct A {
// //    uint256  a;
// //    uint256 b;
// // }
// // struct B {
// //    uint256  a;
// //    uint128 b;
// //    uint128 c;
// // }
// // Ilya Kubariev4:35 PM
// // _selfdestruct()
// // Ilya Kubariev4:37 PM
// // ERC20
// // ERC20Tradable
// // ERC20Votable
// // Ilya Kubariev4:38 PM
// // ERC20TradableVotable -> ERC20Tradable, ERC20Votable -> ERC20
// // Ilya Kubariev4:42 PM
// // override(ERC20Tradable, ERC20Votable)
// // You4:48 PM
// // 1: how much indexed properites can be 'indexed' in event?
// // 2:which types of data can be indexed?
// // 3:How to define another function as param to function? and why we cant use it with public functions?
// // 4: clastering of uint variables
// // 5: how to send eth to cotract whre resieve function (_selfdestruct)
// // 6: abstract contracts and why they need for us?
// // Ilya Kubariev4:51 PM
// // uint[] public arr;

// // f () {
// //   uint[] storage ar = arr;
// //   ar.push(2)
// // }

// // f1 () {
// //   uint[] memory ar = arr;
// //    ar.push(2)
// // }
// // Ilya Kubariev4:56 PM
// // f (string calldata name) {
// //   console.log("%s", name);
// // }
// // f1 (string memory name) {
// //   console.log("%s", name);
// // }
// // Ilya Kubariev4:58 PM
// // f2 (string storage name) {
// //   console.log("%s", name);
// // }
// // string _name;

// // f() {
// //   f1(_name);
// // }

// // f1 (string storage name) {
// //   name = "123";
// // }
// // Ilya Kubariev5:03 PM
// // library SafeMath {
// //   add(uint256 a, uint256 b) {
// //     return a + b;
// //   }
// // }
// // using SafeMath for uint256;
// // f() {
// //   uint256 a = 1;
// //   uint256 b = 2;
// //   return a.add(b);
// // }
// // Ilya Kubariev5:05 PM
// // f() {
// //   uint256 a = 1;
// //   uint256 b = 2;
// //   return SafeMath.add(a, b);
// // }
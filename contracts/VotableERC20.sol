// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./IVotable.sol";
import "hardhat/console.sol";

// contact sizer and gas repourter plaguinsz
contract VotableERC20 is IERC20, IVotable {
    struct VoterData {
        uint256 proposedPriceIndex;
        uint256 voteId;
    }

    struct VoteProposedPrice {
        uint256 proposedPrice;
        uint256 voteId;
        uint256 votesTotal;
    }

    struct Node {
        VoteProposedPrice voteProposedPrice;
        uint256 prev;
        uint256 next;
    }

    // linked list data 
    struct Data {
        uint256 head;
        uint256 tail;     
        uint256 size;
        uint256 indexToUse;
        uint256 currentVoteId;
        mapping (uint256 => Node) voteNodes; // are you sure you can't use array here? // Is mapping can be limited by size
    }

    Data public data;

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

    mapping(address => uint256) private balances;
    mapping(address => mapping(address => uint256)) private allowances;

    mapping(address => VoterData) private voterToVoterData;

    modifier onlyOwner {
        require(msg.sender == owner, "Caller is not owner");
        _;
    }

    modifier isAllowToVote(uint256 minTokenAmount) {
        require(block.timestamp <= voteCountdown, "Voting time is over");
        require(!isVoterOfCurrentVotes(msg.sender), "You already voted!");
        require(balances[msg.sender] >= minTokenAmount, "Not enough tokens to vote");
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
        data.head = 0;
        data.tail = 0;
        data.size = 0;
        data.indexToUse = 1;
        data.currentVoteId = 1;
    }

    function setFeePercent(uint256 _newFeePercent) public onlyOwner {
        require(_newFeePercent < feeDecimals, "You can't set fee of whole sum");
        feePercent = _newFeePercent;
    }

    function voterBuy(uint256 _nodeIndex, uint256 _prevIndex, uint256 _nextIndex) public payable {
        require(isVoterOfCurrentVotes(msg.sender), "Use buy if you not voted!");
        require(voterToVoterData[msg.sender].voteId == data.currentVoteId, "You are not voter of currnet vote");
        require(voterToVoterData[msg.sender].proposedPriceIndex == _nodeIndex, "You are not in this node");

        
        uint256 boughtTokens = _buy();

        uint256 updatedVotesTotal = data.voteNodes[_nodeIndex].voteProposedPrice.votesTotal + boughtTokens;

        _moveNode(updatedVotesTotal, _nodeIndex, _prevIndex, _nextIndex);
    }

    function buy() public payable {
        require(!isVoterOfCurrentVotes(msg.sender), "Use voterBuy if you already voted!");

        _buy();
    }

    function _buy() private returns(uint256) {
        require(msg.value > 0, "Send some ether to buy tokens.");

        uint256 fee = (msg.value * feePercent) / feeDecimals;
        uint256 netValue = msg.value - fee;
        uint256 tokensToBuy = netValue / tokenPrice;

        require(tokensToBuy <= maxTokenSupply - totalTokenSupply, "Max supply of tokens is touched.");

        _mint(msg.sender, tokensToBuy);

        return tokensToBuy;
    }

    function voterSell(uint256 _tokensToSell, uint256 _nodeIndex, uint256 _prevIndex, uint256 _nextIndex) public payable {
        require(isVoterOfCurrentVotes(msg.sender), "Use sell if you not voted!");
        require(voterToVoterData[msg.sender].voteId == data.currentVoteId, "You are not voter of currnet vote");
        require(voterToVoterData[msg.sender].proposedPriceIndex == _nodeIndex, "You are not in this node");

        _sell(_tokensToSell);

        uint256 updatedVotesTotal = data.voteNodes[_nodeIndex].voteProposedPrice.votesTotal - _tokensToSell;

        _moveNode(updatedVotesTotal, _nodeIndex, _prevIndex, _nextIndex);
    }

    function sell(uint256 _tokensToSell) public payable {
        require(!isVoterOfCurrentVotes(msg.sender), "Use voterSell if you already voted!");

        _sell(_tokensToSell);
    }

    function _sell(uint256 tokensToSell) private {
        require(this.balanceOf(msg.sender) >= tokensToSell, "Not enough tokens");

        uint256 etherToReturn = (tokensToSell * tokenPrice);
        uint256 fee = (etherToReturn * feePercent) / feeDecimals;
        uint256 netReturn = etherToReturn - fee;

        require(address(this).balance >= netReturn, "Contract doesn't have enough ether to pay");

        _burn(msg.sender, tokensToSell);

        payable(msg.sender).transfer(netReturn);
    }

    function startVote() external override {
        require(!isVoting, "Previus voting is not over yet!");
        require(balances[msg.sender] >= minTokenAmountForAddVotePrice, "Not enough tokens for starting a vote!");
        isVoting = true;
        voteCountdown = block.timestamp + timeToVote;
        data.currentVoteId++;
        emit VoteStarted(voteCountdown);
    }


    function addVotePrice(uint256 _proposedPrice, uint256 _prevIndex, uint256 _nextIndex) external isAllowToVote(minTokenAmountForAddVotePrice) {
        // require(data.voteNodes[proposedPriceToIndex[_proposedPrice]].voteProposedPrice.votesTotal == 0, "Someone already added that price, you can vote for that instead");
        VoteProposedPrice memory voteProposedPrice = VoteProposedPrice(_proposedPrice, data.currentVoteId, this.balanceOf(msg.sender));

        uint256 addedNodeIndex = _insert(voteProposedPrice, _prevIndex, _nextIndex);

        voterToVoterData[msg.sender] = VoterData(addedNodeIndex, data.currentVoteId);

        emit Voted(msg.sender, _proposedPrice);
    }
    // unite both functions 
    function vote(uint256 _proposedPrice, uint256 _nodeIndex, uint256 _prevIndex, uint256 _nextIndex) external isAllowToVote(minTokenAmountForVoting) {
        require(data.voteNodes[_nodeIndex].voteProposedPrice.proposedPrice == _proposedPrice && data.voteNodes[_nodeIndex].voteProposedPrice.voteId == data.currentVoteId, "Wrong node index");

        uint256 updatedVotesTotal = data.voteNodes[_nodeIndex].voteProposedPrice.votesTotal + this.balanceOf(msg.sender);

        _moveNode(updatedVotesTotal, _nodeIndex, _prevIndex, _nextIndex);

        voterToVoterData[msg.sender] = VoterData(_nodeIndex, data.currentVoteId);

        emit Voted(msg.sender, _proposedPrice);
    }

    function endVote() external override {
        require(block.timestamp > voteCountdown, "Voting is not over yet");

        tokenPrice = data.voteNodes[data.head].voteProposedPrice.proposedPrice;
        data.size = 0;
        data.tail = 0;
        data.head = 0;
        data.indexToUse = 1;
        isVoting = false;
        emit PriceChanged(tokenPrice);
    }

    function totalSupply() external view override returns (uint256) {
        return totalTokenSupply;
    }

    function totalOfPrice(uint256 _price) external view returns(uint256) {
        uint256 priceIndex = _findNodeIndex(_price);

        return data.voteNodes[priceIndex].voteProposedPrice.votesTotal;
    }

    function balanceOf(address _account) external view override returns(uint256) {
        return balances[_account];
    }

    function transfer(address _to, uint256 _amount) external override returns(bool) {
        require(!isVoterOfCurrentVotes(msg.sender), "Use voterTransfer if you already voted!");
        _transfer(msg.sender, _to, _amount);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _amount) external override returns(bool) {
        require(!isVoterOfCurrentVotes(msg.sender), "Use voterTransfer if you already voted!");
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

    function isVoterOfCurrentVotes(address _voter) public view returns(bool) {
        return voterToVoterData[_voter].voteId == data.currentVoteId;
    }

    function voteNodes() public view returns(Node[] memory) {
        Node[] memory _voteNodes = new Node[](data.size);

        for(uint256 i = 1; i <= data.size; i++) {
            _voteNodes[i - 1] = data.voteNodes[i];
        }

        return _voteNodes;
    }

    function _findNodeIndex(uint256 _proposedPrice) private view returns(uint256) {
        uint256 currentNodeIndex = 1;
        
        while(data.voteNodes[currentNodeIndex].next != 0 && data.voteNodes[currentNodeIndex].voteProposedPrice.proposedPrice != _proposedPrice) {
            currentNodeIndex = data.voteNodes[currentNodeIndex].next;
        }

        require(data.voteNodes[currentNodeIndex].voteProposedPrice.proposedPrice == _proposedPrice, "Proposed price is not exist in list!");

        return currentNodeIndex;
    }

    function _transfer(address from, address to, uint256 amount) private {
        require(from != address(0), "Cannot transfer from zero address");
        require(to != address(0), "Cannot transfer to zero address");
        require(balances[from] >= amount, "Not enough tokens");
        
        balances[from] -= amount;
        balances[to] += amount;

        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) private {
        balances[to] += amount;
        totalTokenSupply += amount;
    }

    function _burn(address from, uint256 amount) private {
        balances[from] -= amount;
        totalTokenSupply -= amount;
    }

    function _moveNode(uint256 _updatedVotesTotal, uint256 _nodeIndex, uint256 _prevNodeIndex, uint256 _nextNodeIndex) private {
        Node storage currentNode = data.voteNodes[_nodeIndex];

        require(currentNode.voteProposedPrice.voteId == data.currentVoteId, "Node is not valid");
        _checkPrevNextNodeIndex(_prevNodeIndex, _nextNodeIndex);

        _updatePrevAndNext(currentNode, _updatedVotesTotal);

        if(data.size == 1 && _nodeIndex == 1) {

        } else if(_prevNodeIndex == 0) {
            require(data.voteNodes[_nextNodeIndex].voteProposedPrice.votesTotal > _updatedVotesTotal && data.head == _nextNodeIndex, "Next node less than node you trying to add!");
            data.tail = _nodeIndex;
            currentNode.next = _nextNodeIndex;
        } else if (_nextNodeIndex == 0) {
            require(data.voteNodes[_prevNodeIndex].voteProposedPrice.votesTotal < _updatedVotesTotal && data.tail == _prevNodeIndex, "Next node less than node you trying to add!");
            data.head = _nodeIndex;
            currentNode.prev = _prevNodeIndex;
        } else {
            require(data.voteNodes[_prevNodeIndex].voteProposedPrice.votesTotal < _updatedVotesTotal, "Next node less than node you trying to add!");
            require(data.voteNodes[_nextNodeIndex].voteProposedPrice.votesTotal > _updatedVotesTotal, "Next node less than node you trying to add!");
            currentNode.prev = _prevNodeIndex;
            currentNode.next = _nextNodeIndex;
        }

        currentNode.voteProposedPrice.votesTotal = _updatedVotesTotal;
    }

    function _updatePrevAndNext(Node storage _currentNode, uint256 _updatedVotesTotal) private {
        if(data.size == 1) {

        } else if(_currentNode.prev == 0 && _updatedVotesTotal > data.voteNodes[_currentNode.next].voteProposedPrice.votesTotal) {
            data.voteNodes[_currentNode.next].prev = 0; 
            data.tail = _currentNode.next;
        } else if(_currentNode.next == 0 && _updatedVotesTotal < data.voteNodes[_currentNode.prev].voteProposedPrice.votesTotal) {
            data.voteNodes[_currentNode.prev].next = 0; 
            data.head = _currentNode.prev;
        } else {
            data.voteNodes[_currentNode.prev].next = _currentNode.next;
            data.voteNodes[_currentNode.next].prev = _currentNode.prev;
        }
    }

    function _insert(VoteProposedPrice memory _voteProposedPrice, uint256 _prevNodeIndex, uint256 _nextNodeIndex) private returns(uint256) {
        _checkPrevNextNodeIndex(_prevNodeIndex, _nextNodeIndex);

        Node memory newNode;

        if(data.size == 0 && _prevNodeIndex == 0 && _nextNodeIndex == 0) {
            data.tail = 1;
            data.head = 1;
            newNode = Node(_voteProposedPrice, 0, 0);
        } else if(_prevNodeIndex == 0) {
            require(data.voteNodes[_nextNodeIndex].voteProposedPrice.votesTotal > _voteProposedPrice.votesTotal && data.tail == _nextNodeIndex, "Next node less than node you trying to add!");
            data.voteNodes[_nextNodeIndex].prev = data.indexToUse;
            data.tail = data.indexToUse;
            newNode = Node(_voteProposedPrice, _prevNodeIndex, _nextNodeIndex);
        } else if (_nextNodeIndex == 0) {
            require(data.voteNodes[_prevNodeIndex].voteProposedPrice.votesTotal < _voteProposedPrice.votesTotal && data.head == _prevNodeIndex, "Next node less than node you trying to add!");
            data.voteNodes[_prevNodeIndex].next = data.indexToUse;
            data.head = data.indexToUse;
            newNode = Node(_voteProposedPrice, _prevNodeIndex, _nextNodeIndex);
        } else {
            require(data.voteNodes[_prevNodeIndex].voteProposedPrice.votesTotal < _voteProposedPrice.votesTotal, "Next node less than node you trying to add!");
            require(data.voteNodes[_nextNodeIndex].voteProposedPrice.votesTotal > _voteProposedPrice.votesTotal, "Next node less than node you trying to add!");
            newNode = Node(_voteProposedPrice, _prevNodeIndex, _nextNodeIndex);
            data.voteNodes[_prevNodeIndex].next = data.indexToUse;
            data.voteNodes[_nextNodeIndex].prev = data.indexToUse;
        }

        data.size++;
        data.voteNodes[data.indexToUse] = newNode;
        data.indexToUse++;

        return data.indexToUse - 1;
    }

    function _checkPrevNextNodeIndex(uint256 _prevNodeIndex, uint256 _nextNodeIndex) view private {
        require(
            (_prevNodeIndex != _nextNodeIndex && data.size >= 1) ||
            (_prevNodeIndex == 0 && _nextNodeIndex == 0 && data.size <= 1),
            "Prev and next are equal"
        );

        if(data.size == 0 &&  _prevNodeIndex == 0 && _nextNodeIndex == 0) {
            return;
        } else if(_prevNodeIndex != 0 && _nextNodeIndex != 0 && _prevNodeIndex != _nextNodeIndex) {
            require(data.voteNodes[_prevNodeIndex].next == data.voteNodes[_nextNodeIndex].prev, "Next and prev index not related!");
        }  else if(_prevNodeIndex != 0 && _nextNodeIndex == 0) {
            require(data.voteNodes[_prevNodeIndex].prev == 0 && data.tail == _prevNodeIndex, "Cant be head becouse current head higher");
        } else if(_prevNodeIndex == 0 && _nextNodeIndex != 0) {
            require(data.voteNodes[_nextNodeIndex].next == 0 && data.head == _nextNodeIndex, "Cant be tail becouse current tail lower");
        }
    }
}

// uint256 newIndex, uint256 prevIndex, uint256 nextIndex

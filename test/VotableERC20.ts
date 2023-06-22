import { expect, use } from 'chai'
import { ethers } from 'hardhat'
import { mine } from '@nomicfoundation/hardhat-network-helpers'
import { BigNumber } from 'ethers'

type TNodes = ([
  [BigNumber, BigNumber, BigNumber] & {
    proposedPrice: BigNumber
    voteId: BigNumber
    votesTotal: BigNumber
  },
  BigNumber,
  BigNumber,
] & {
  voteProposedPrice: [BigNumber, BigNumber, BigNumber] & {
    proposedPrice: BigNumber
    voteId: BigNumber
    votesTotal: BigNumber
  }
  prev: BigNumber
  next: BigNumber
})[]

const parseArrayResultOfNodes = (nodesArray: TNodes) => {
  const nodeObjects = []

  for (let i = 0; i < nodesArray.length; i++) {
    const node = nodesArray[i]
    const voteProposedPrice = {
      proposedPrice: parseInt(node[0][0]._hex),
      voteId: parseInt(node[0][1]._hex),
      votesTotal: parseInt(node[0][2]._hex),
    }
    const nodeObject = {
      voteProposedPrice,
      prev: parseInt(node[1]._hex),
      next: parseInt(node[2]._hex),
    }
    nodeObjects.push(nodeObject)
  }

  return nodeObjects
}

describe('VotableERC20', () => {
  const events = {
    VoteStarted: 'VoteStarted',
    Voted: 'Voted',
    PriceChanged: 'PriceChanged',
    Transfer: 'Transfer',
    Approval: 'Approval',
  }

  const defaultDeployMock = {
    tokenName: 'Voter',
    symbol: 'vot',
    initialTokenPrice: 10000,
    maxTokenSupply: ethers.BigNumber.from('100000000000000000'),
    timeToVote: 3600,
    feePercent: 500,
  }

  // replace with modern tools of hardhat
  const deployContract = async ({
    tokenName,
    symbol,
    initialTokenPrice,
    maxTokenSupply,
    timeToVote,
    feePercent,
  } = defaultDeployMock) => {
    const [
      owner,
      address1,
      address2,
      address3,
      address4,
    ] = await ethers.getSigners()

    const VotableERC20 = await ethers.getContractFactory('VotableERC20')

    const votableERC20 = await VotableERC20.deploy(
      tokenName,
      symbol,
      initialTokenPrice,
      maxTokenSupply,
      timeToVote,
      feePercent,
    )
    await votableERC20.deployed()

    return { votableERC20, owner, address1, address2, address3, address4 }
  }

  describe('Deployment', () => {
    it('Should set the right properties and owner', async () => {
      const { votableERC20, owner } = await deployContract()

      expect(await votableERC20.name()).to.equal(defaultDeployMock.tokenName)
      expect(await votableERC20.symbol()).to.equal(defaultDeployMock.symbol)
      expect(await votableERC20.tokenPrice()).to.equal(
        defaultDeployMock.initialTokenPrice,
      )
      expect(await votableERC20.maxTokenSupply()).to.equal(
        defaultDeployMock.maxTokenSupply,
      )
      expect(await votableERC20.timeToVote()).to.equal(
        defaultDeployMock.timeToVote,
      )
      expect(await votableERC20.feePercent()).to.equal(
        defaultDeployMock.feePercent,
      )
      expect(await votableERC20.owner()).to.equal(owner.address)
    })
  })

  describe('Transactions ERC20', () => {
    it('Should allow to buy tokens with fee', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      const expectedTokens = purchaseValue
        .sub(purchaseValue.mul(5).div(100))
        .div(await votableERC20.tokenPrice())

      expect(await votableERC20.balanceOf(address1.address)).to.equal(
        expectedTokens,
      )
      expect(await votableERC20.totalTokenSupply()).to.equal(expectedTokens)
    })

    it('Should sell tokens correctly', async function () {
      const { votableERC20, address1 } = await deployContract()
      const purchaseValue = ethers.utils.parseEther('1')

      await votableERC20.connect(address1).buy({ value: purchaseValue })
      const tokensToSell = await votableERC20
        .connect(address1)
        .balanceOf(address1.address)

      const balanceBeforeSell = await ethers.provider.getBalance(
        address1.address,
      )

      const tx = await votableERC20.connect(address1).sell(tokensToSell)
      const gasOnSellSpent = (await tx.wait()).gasUsed.toString()

      const finalBalance = await ethers.provider.getBalance(address1.address)

      const tokenPrice = await votableERC20.tokenPrice()
      const feePercent = await votableERC20.feePercent()

      const etherToReturn = tokenPrice.mul(tokensToSell)
      const fee = etherToReturn.mul(feePercent).div(10000)
      const netReturn = etherToReturn.sub(fee)

      expect(
        finalBalance.sub(balanceBeforeSell).add(gasOnSellSpent),
      ).to.be.closeTo(netReturn, 100000000000000)
      expect(
        await votableERC20.connect(address1).balanceOf(address1.address),
      ).to.equal(0)
    })

    it('Should not allow to sell more tokens than you have', async function () {
      const { votableERC20, address1 } = await deployContract()

      const tokensToSell = 1000000

      await expect(
        votableERC20.connect(address1).sell(tokensToSell),
      ).to.be.revertedWith('Not enough tokens')
    })

    it('Should not allow to buy if value of ether send is zero', async () => {
      const purchaseValue = ethers.utils.parseEther('0')
      const { votableERC20, address1 } = await deployContract()

      await expect(
        votableERC20.connect(address1).buy({ value: purchaseValue }),
      ).to.be.revertedWith('Send some ether to buy tokens.')
      expect(await votableERC20.balanceOf(address1.address)).to.equal(
        purchaseValue,
      )
    })

    it('Should allow to transfer tokens when you already have them', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1, address2 } = await deployContract()

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      const expectedTokens = purchaseValue
        .sub(purchaseValue.mul(5).div(100))
        .div(await votableERC20.tokenPrice())
      const expectedTokensSend = +expectedTokens / 2
      const expectedTokensLeft = +expectedTokens / 2

      await expect(
        votableERC20
          .connect(address1)
          .transfer(address2.address, expectedTokensSend),
      )
        .to.emit(votableERC20, events.Transfer)
        .withArgs(address1.address, address2.address, expectedTokensSend)

      expect(await votableERC20.balanceOf(address2.address)).to.equal(
        expectedTokensSend,
      )
      expect(await votableERC20.balanceOf(address1.address)).to.equal(
        expectedTokensLeft,
      )
    })

    it('Should not allow to transfer tokens to zero balance', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1, address2 } = await deployContract()

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      const expectedTokens = purchaseValue
        .sub(purchaseValue.mul(5).div(100))
        .div(await votableERC20.tokenPrice())

      await expect(
        votableERC20
          .connect(address1)
          .transfer(ethers.constants.AddressZero, expectedTokens),
      ).to.be.revertedWith('Cannot transfer to zero address')
    })

    it('Should allow to transferFrom your tokens when you have approved from owner', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const {
        votableERC20,
        address1,
        address2,
        address3,
      } = await deployContract()

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      const expectedTokens = purchaseValue
        .sub(purchaseValue.mul(5).div(100))
        .div(await votableERC20.tokenPrice())
      const expectedTokensApproved = +expectedTokens / 2
      const expectedTokensLeft = +expectedTokens / 2

      await votableERC20
        .connect(address1)
        .approve(address2.address, expectedTokensApproved)

      await expect(
        votableERC20
          .connect(address2)
          .transferFrom(
            address1.address,
            address3.address,
            expectedTokensApproved,
          ),
      )
        .to.emit(votableERC20, events.Transfer)
        .withArgs(address1.address, address3.address, expectedTokensApproved)

      expect(await votableERC20.balanceOf(address3.address)).to.equal(
        expectedTokensApproved,
      )
      expect(await votableERC20.balanceOf(address1.address)).to.equal(
        expectedTokensLeft,
      )
    })

    it('Should not allow to transferFrom your tokens to zero address', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const {
        votableERC20,
        address1,
        address2,
        address3,
      } = await deployContract()

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      const expectedTokens = purchaseValue
        .sub(purchaseValue.mul(5).div(100))
        .div(await votableERC20.tokenPrice())
      const expectedTokensApproved = +expectedTokens / 2

      await votableERC20
        .connect(address1)
        .approve(address2.address, expectedTokensApproved)

      await expect(
        votableERC20
          .connect(address2)
          .transferFrom(
            address1.address,
            ethers.constants.AddressZero,
            expectedTokensApproved,
          ),
      ).to.be.revertedWith('Cannot transfer to zero address')
    })

    it('Should allow to set new fee for owner', async () => {
      const newFeePercent = 200
      const { votableERC20, owner } = await deployContract()

      await votableERC20.connect(owner).setFeePercent(newFeePercent)

      expect(await votableERC20.feePercent()).to.equal(newFeePercent)
    })

    it('Should not allow to set new fee if you are not the owner', async () => {
      const newFeePercent = 200
      const { votableERC20, address1 } = await deployContract()

      await expect(
        votableERC20.connect(address1).setFeePercent(newFeePercent),
      ).to.be.revertedWith('Caller is not owner')
    })

    it('Should not allow to set fee of whole sum', async () => {
      const newFeePercent = 10000
      const { votableERC20, owner } = await deployContract()

      await expect(
        votableERC20.connect(owner).setFeePercent(newFeePercent),
      ).to.be.revertedWith("You can't set fee of whole sum")
    })
  })

  describe('Votable', () => {
    it('Should allow start Vote to anyone who has minimum tokens required', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      expect(await votableERC20.isVoting()).to.equal(false)

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      await expect(votableERC20.connect(address1).startVote()).to.emit(
        votableERC20,
        events.VoteStarted,
      )
      expect(await votableERC20.isVoting()).to.equal(true)
    })

    it('Should not allow to start new Vote when current vote is not ended', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      expect(await votableERC20.isVoting()).to.equal(false)

      await votableERC20.connect(address1).buy({ value: purchaseValue })
      await votableERC20.connect(address1).startVote()

      await expect(
        votableERC20.connect(address1).startVote(),
      ).to.be.revertedWith('Previus voting is not over yet!')
      expect(await votableERC20.isVoting()).to.equal(true)
    })

    it('Should not allow to start vote if address do not have enough tokens', async () => {
      const purchaseValue = ethers.utils.parseEther('0.1')
      const { votableERC20, address1 } = await deployContract()

      await votableERC20.connect(address1).buy({ value: purchaseValue })
      await expect(
        votableERC20.connect(address1).startVote(),
      ).to.be.revertedWith('Not enough tokens for starting a vote!')

      expect(await votableERC20.isVoting()).to.equal(false)
    })

    it('Should not allow to add vote price if address do not have enough tokens for minimal add vote requirence', async () => {
      const randomProposedPrice = 321312321
      const purchaseValueOfAddress1 = ethers.utils.parseEther('1')
      const purchaseValueOfAddress2 = ethers.utils.parseEther(
        '0.00000000000001',
      )
      const { votableERC20, address1, address2 } = await deployContract()

      await votableERC20
        .connect(address1)
        .buy({ value: purchaseValueOfAddress1 })
      await votableERC20.connect(address1).startVote()

      await votableERC20
        .connect(address2)
        .buy({ value: purchaseValueOfAddress2 })

      await expect(
        votableERC20.connect(address2).addVotePrice(randomProposedPrice, 0, 0),
      ).to.be.revertedWith('Not enough tokens to vote')
    })

    it('Should allow to vote for some price if address have enough tokens', async () => {
      const randomProposedPrice = 321312321
      const purchaseValueOfAddress1 = ethers.utils.parseEther('1')
      const purchaseValueOfAddress2 = ethers.utils.parseEther('0.001')
      const { votableERC20, address1, address2 } = await deployContract()

      await votableERC20
        .connect(address1)
        .buy({ value: purchaseValueOfAddress1 })

      await votableERC20.connect(address1).startVote()
      await expect(
        votableERC20.connect(address1).addVotePrice(randomProposedPrice, 0, 0),
      )
        .to.emit(votableERC20, events.Voted)
        .withArgs(address1.address, randomProposedPrice)

      await votableERC20
        .connect(address2)
        .buy({ value: purchaseValueOfAddress2 })
      await votableERC20.connect(address2).vote(randomProposedPrice, 1, 0, 0)

      const address1Tokens = await votableERC20.balanceOf(address1.address)
      const address2Tokens = await votableERC20.balanceOf(address2.address)
      const totalOfTwo = +address1Tokens + +address2Tokens

      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        totalOfTwo,
      )
      expect(
        parseArrayResultOfNodes(await votableERC20.voteNodes())[0]
          .voteProposedPrice.proposedPrice,
      ).to.equal(randomProposedPrice)
    })

    it('Should not allow to vote for some price if vote is not started', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      const proposedPrice = ethers.utils.parseEther('0.5')

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      await expect(
        votableERC20.connect(address1).addVotePrice(proposedPrice, 0, 0),
      ).to.be.revertedWith('Voting time is over')
    })

    it('Should not allow to vote twice', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      const proposedPrice = ethers.utils.parseEther('0.5')

      await votableERC20.connect(address1).buy({ value: purchaseValue })
      await votableERC20.connect(address1).startVote()
      await votableERC20.connect(address1).addVotePrice(proposedPrice, 0, 0)

      await expect(
        votableERC20.connect(address1).vote(proposedPrice, 1, 0, 0),
      ).to.be.revertedWith('You already voted!')
    })

    it('Should allow to end vote if time have been ended', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      const proposedPrice = ethers.utils.parseEther('0.5')

      await votableERC20.connect(address1).buy({ value: purchaseValue })
      await votableERC20.connect(address1).startVote()
      await votableERC20.connect(address1).addVotePrice(proposedPrice, 0, 0)

      await mine(500, { interval: 20 })

      await expect(votableERC20.connect(address1).endVote())
        .to.emit(votableERC20, events.PriceChanged)
        .withArgs(proposedPrice)

      expect(await votableERC20.isVoting()).to.equal(false)
      expect(await votableERC20.tokenPrice()).to.equal(proposedPrice)
    })

    it('Should not allow to end vote if time have not been ended', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      const proposedPrice = ethers.utils.parseEther('0.5')

      await votableERC20.connect(address1).buy({ value: purchaseValue })
      await votableERC20.connect(address1).startVote()
      await votableERC20.connect(address1).addVotePrice(proposedPrice, 0, 0)

      // replace with modern tools of hardhat
      await ethers.provider.send('evm_increaseTime', [2600])
      await ethers.provider.send('evm_mine')

      await expect(votableERC20.connect(address1).endVote()).to.be.revertedWith(
        'Voting is not over yet',
      )
      expect(await votableERC20.isVoting()).to.equal(true)
    })
  })

  describe('Votable', () => {
    it('Should remove sell anount of tokens after sell of voter', async () => {
      const randomProposedPrice = 321312321
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      await votableERC20.connect(address1).startVote()
      await votableERC20
        .connect(address1)
        .addVotePrice(randomProposedPrice, 0, 0)

      const address1Tokens = await votableERC20.balanceOf(address1.address)
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1Tokens,
      )

      const sellValue = +address1Tokens / 2

      await votableERC20.connect(address1).voterSell(sellValue, 1, 0, 0)

      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        sellValue,
      )
    })

    it('Should add buy anount of tokens after buy of voter', async () => {
      const randomProposedPrice = 321312321
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      await votableERC20.connect(address1).startVote()
      await votableERC20
        .connect(address1)
        .addVotePrice(randomProposedPrice, 0, 0)

      const address1Tokens = await votableERC20.balanceOf(address1.address)
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1Tokens,
      )

      await votableERC20
        .connect(address1)
        .voterBuy(1, 0, 0, { value: purchaseValue })

      const address1TokensAfterBuy = await votableERC20.balanceOf(
        address1.address,
      )
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1TokensAfterBuy,
      )
    })

    it('Test insert node after add vote function', async () => {
      const randomProposedPrice = 321312321
      const randomProposedPrice1 = 22222
      const purchaseValueOfAddress1 = ethers.utils.parseEther('10')
      const purchaseValueOfAddress2 = ethers.utils.parseEther('1')
      const { votableERC20, address1, address2 } = await deployContract()

      await votableERC20
        .connect(address1)
        .buy({ value: purchaseValueOfAddress1 })

      await votableERC20.connect(address1).startVote()
      await expect(
        votableERC20.connect(address1).addVotePrice(randomProposedPrice, 0, 0),
      )
        .to.emit(votableERC20, events.Voted)
        .withArgs(address1.address, randomProposedPrice)

      await votableERC20
        .connect(address2)
        .buy({ value: purchaseValueOfAddress2 })
      await votableERC20
        .connect(address2)
        .addVotePrice(randomProposedPrice1, 0, 1)

      const address1Tokens = await votableERC20.balanceOf(address1.address)
      const address2Tokens = await votableERC20.balanceOf(address2.address)

      const nodesArray = await votableERC20.voteNodes()

      expect(parseArrayResultOfNodes(nodesArray)).to.deep.equal([
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice,
            voteId: 2,
            votesTotal: +address1Tokens,
          },
          prev: 2,
          next: 0,
        },
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice1,
            voteId: 2,
            votesTotal: +address2Tokens,
          },
          prev: 0,
          next: 1,
        },
      ])
    })

    it('Test insert node and after add vote', async () => {
      const randomProposedPrice = 321312321
      const randomProposedPrice1 = 22222
      const purchaseValueOfAddress1 = ethers.utils.parseEther('10')
      const purchaseValueOfAddress2 = ethers.utils.parseEther('7')
      const purchaseValueOfAddress3 = ethers.utils.parseEther('5')
      const {
        votableERC20,
        address1,
        address2,
        address3,
      } = await deployContract()

      await votableERC20
        .connect(address1)
        .buy({ value: purchaseValueOfAddress1 })

      await votableERC20.connect(address1).startVote()
      await expect(
        votableERC20.connect(address1).addVotePrice(randomProposedPrice, 0, 0),
      )
        .to.emit(votableERC20, events.Voted)
        .withArgs(address1.address, randomProposedPrice)

      await votableERC20
        .connect(address2)
        .buy({ value: purchaseValueOfAddress2 })
      await votableERC20
        .connect(address2)
        .addVotePrice(randomProposedPrice1, 0, 1)

      await votableERC20
        .connect(address3)
        .buy({ value: purchaseValueOfAddress3 })
      await votableERC20.connect(address3).vote(randomProposedPrice, 1, 2, 0)

      const address1Tokens = await votableERC20.balanceOf(address1.address)
      const address2Tokens = await votableERC20.balanceOf(address2.address)
      const address3Tokens = await votableERC20.balanceOf(address3.address)
      const totalOf1and3 = +address1Tokens + +address3Tokens

      const nodesArray = await votableERC20.voteNodes()

      expect(parseArrayResultOfNodes(nodesArray)).to.deep.equal([
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice,
            voteId: 2,
            votesTotal: totalOf1and3,
          },
          prev: 2,
          next: 0,
        },
        {
          voteProposedPrice: {
            proposedPrice: 22222,
            voteId: 2,
            votesTotal: +address2Tokens,
          },
          prev: 0,
          next: 1,
        },
      ])
    })

    it('Test insert node and after vote to that node', async () => {
      const randomProposedPrice = 321312321
      const randomProposedPrice1 = 22222
      const randomProposedPrice2 = 400000
      const purchaseValueOfAddress1 = ethers.utils.parseEther('3')
      const purchaseValueOfAddress2 = ethers.utils.parseEther('7')
      const purchaseValueOfAddress3 = ethers.utils.parseEther('5')
      const purchaseValueOfAddress4 = ethers.utils.parseEther('3')
      const {
        votableERC20,
        address1,
        address2,
        address3,
        address4,
      } = await deployContract()

      await votableERC20
        .connect(address1)
        .buy({ value: purchaseValueOfAddress1 })
      await votableERC20
        .connect(address2)
        .buy({ value: purchaseValueOfAddress2 })
      await votableERC20
        .connect(address3)
        .buy({ value: purchaseValueOfAddress3 })
      await votableERC20
        .connect(address4)
        .buy({ value: purchaseValueOfAddress4 })
      const address1Tokens = await votableERC20.balanceOf(address1.address)
      const address2Tokens = await votableERC20.balanceOf(address2.address)
      const address3Tokens = await votableERC20.balanceOf(address3.address)
      const address4Tokens = await votableERC20.balanceOf(address4.address)

      await votableERC20.connect(address1).startVote()
      await expect(
        votableERC20.connect(address1).addVotePrice(randomProposedPrice, 0, 0),
      )

      await votableERC20
        .connect(address2)
        .addVotePrice(randomProposedPrice1, 1, 0)

      await votableERC20
        .connect(address3)
        .addVotePrice(randomProposedPrice2, 1, 2)

      const nodesArrayBeforeVote = await votableERC20.voteNodes()

      expect(parseArrayResultOfNodes(nodesArrayBeforeVote)).to.deep.equal([
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice,
            voteId: 2,
            votesTotal: +address1Tokens,
          },
          prev: 0,
          next: 3,
        },
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice1,
            voteId: 2,
            votesTotal: +address2Tokens,
          },
          prev: 3,
          next: 0,
        },
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice2,
            voteId: 2,
            votesTotal: +address3Tokens,
          },
          prev: 1,
          next: 2,
        },
      ])

      await votableERC20.connect(address4).vote(randomProposedPrice, 1, 3, 2)

      const nodesArray = await votableERC20.voteNodes()

      expect(parseArrayResultOfNodes(nodesArray)).to.deep.equal([
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice,
            voteId: 2,
            votesTotal: +address4Tokens + +address1Tokens,
          },
          prev: 3,
          next: 2,
        },
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice1,
            voteId: 2,
            votesTotal: +address2Tokens,
          },
          prev: 1,
          next: 0,
        },
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice2,
            voteId: 2,
            votesTotal: +address3Tokens,
          },
          prev: 0,
          next: 1,
        },
      ])
    })

    it('Test insert node and after vote and then sell tokens', async () => {
      const randomProposedPrice = 321312321
      const randomProposedPrice1 = 22222
      const randomProposedPrice2 = 400000
      const purchaseValueOfAddress1 = ethers.utils.parseEther('3')
      const purchaseValueOfAddress2 = ethers.utils.parseEther('7')
      const purchaseValueOfAddress3 = ethers.utils.parseEther('5')
      const purchaseValueOfAddress4 = ethers.utils.parseEther('3')
      const {
        votableERC20,
        address1,
        address2,
        address3,
        address4,
      } = await deployContract()

      await votableERC20
        .connect(address1)
        .buy({ value: purchaseValueOfAddress1 })
      await votableERC20
        .connect(address2)
        .buy({ value: purchaseValueOfAddress2 })
      await votableERC20
        .connect(address3)
        .buy({ value: purchaseValueOfAddress3 })
      await votableERC20
        .connect(address4)
        .buy({ value: purchaseValueOfAddress4 })
      const address1Tokens = await votableERC20.balanceOf(address1.address)
      const address2Tokens = await votableERC20.balanceOf(address2.address)
      const address3Tokens = await votableERC20.balanceOf(address3.address)
      const address4Tokens = await votableERC20.balanceOf(address4.address)

      await votableERC20.connect(address1).startVote()
      await expect(
        votableERC20.connect(address1).addVotePrice(randomProposedPrice, 0, 0),
      )

      await votableERC20
        .connect(address2)
        .addVotePrice(randomProposedPrice1, 1, 0)

      await votableERC20
        .connect(address3)
        .addVotePrice(randomProposedPrice2, 1, 2)

      await votableERC20.connect(address4).vote(randomProposedPrice, 1, 3, 2)

      const nodesArrayBeforeVote = await votableERC20.voteNodes()

      expect(parseArrayResultOfNodes(nodesArrayBeforeVote)).to.deep.equal([
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice,
            voteId: 2,
            votesTotal: +address4Tokens + +address1Tokens,
          },
          prev: 3,
          next: 2,
        },
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice1,
            voteId: 2,
            votesTotal: +address2Tokens,
          },
          prev: 1,
          next: 0,
        },
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice2,
            voteId: 2,
            votesTotal: +address3Tokens,
          },
          prev: 0,
          next: 1,
        },
      ])

      await votableERC20.connect(address4).voterSell(address4Tokens, 1, 0, 3)

      const nodesArray = await votableERC20.voteNodes()

      expect(parseArrayResultOfNodes(nodesArray)).to.deep.equal([
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice,
            voteId: 2,
            votesTotal: +address4Tokens + +address1Tokens,
          },
          prev: 0,
          next: 3,
        },
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice1,
            voteId: 2,
            votesTotal: +address2Tokens,
          },
          prev: 3,
          next: 0,
        },
        {
          voteProposedPrice: {
            proposedPrice: randomProposedPrice2,
            voteId: 2,
            votesTotal: +address3Tokens,
          },
          prev: 1,
          next: 2,
        },
      ])
    })
  })
})

const { expect, use } = require('chai')
const { Contract } = require('ethers')
const { deployContract, MockProvider, solidity } = require('ethereum-waffle')
const { ethers } = require('hardhat')
const { mine } = require('@nomicfoundation/hardhat-network-helpers')

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
    const [owner, address1, address2, address3] = await ethers.getSigners()

    const VotableERC20 = await ethers.getContractFactory('VotableERC20')

    votableERC20 = await VotableERC20.deploy(
      tokenName,
      symbol,
      initialTokenPrice,
      maxTokenSupply,
      timeToVote,
      feePercent,
    )
    await votableERC20.deployed()

    return { votableERC20, owner, address1, address2, address3 }
  }

  describe('Deployment', () => {
    it('Should set the right properties and owner', async () => {
      const { votableERC20, owner } = await deployContract()

      expect('name').to.equal(defaultDeployMock.tokenName)
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
      const expectedTokensSend = expectedTokens / 2
      const expectedTokensLeft = expectedTokens / 2

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
      const expectedTokensApproved = expectedTokens / 2
      const expectedTokensLeft = expectedTokens / 2

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
      const expectedTokensApproved = expectedTokens / 2

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
        votableERC20.connect(address2).addVotePrice(randomProposedPrice),
      ).to.be.revertedWith('Not enough tokens for add vote price')
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
        votableERC20.connect(address1).addVotePrice(randomProposedPrice),
      )
        .to.emit(votableERC20, events.Voted)
        .withArgs(address1.address, randomProposedPrice)

      await votableERC20
        .connect(address2)
        .buy({ value: purchaseValueOfAddress2 })
      await votableERC20.connect(address2).vote(randomProposedPrice)

      const address1Tokens = await votableERC20.balanceOf(address1.address)
      const address2Tokens = await votableERC20.balanceOf(address2.address)
      const totalOfTwo = +address1Tokens + +address2Tokens

      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        totalOfTwo,
      )
      expect(await votableERC20.proposedPrices(0)).to.equal(randomProposedPrice)
    })

    it('Should not allow to vote for some price if vote is not started', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      const proposedPrice = ethers.utils.parseEther('0.5')

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      await expect(
        votableERC20.connect(address1).addVotePrice(proposedPrice),
      ).to.be.revertedWith('Voting time is over')
    })

    it('Should not allow to vote twice', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      const proposedPrice = ethers.utils.parseEther('0.5')

      await votableERC20.connect(address1).buy({ value: purchaseValue })
      await votableERC20.connect(address1).startVote()
      await votableERC20.connect(address1).addVotePrice(proposedPrice)

      await expect(
        votableERC20.connect(address1).vote(proposedPrice),
      ).to.be.revertedWith('You already voted!')
    })

    it('Should allow to end vote if time have been ended', async () => {
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      const proposedPrice = ethers.utils.parseEther('0.5')

      await votableERC20.connect(address1).buy({ value: purchaseValue })
      await votableERC20.connect(address1).startVote()
      await votableERC20.connect(address1).addVotePrice(proposedPrice)

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
      await votableERC20.connect(address1).addVotePrice(proposedPrice)

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
      await votableERC20.connect(address1).addVotePrice(randomProposedPrice)

      const address1Tokens = await votableERC20.balanceOf(address1.address)
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1Tokens,
      )

      const sellValue = address1Tokens / 2

      await votableERC20.connect(address1).sell(sellValue)

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
      await votableERC20.connect(address1).addVotePrice(randomProposedPrice)

      const address1Tokens = await votableERC20.balanceOf(address1.address)
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1Tokens,
      )

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      const address1TokensAfterBuy = await votableERC20.balanceOf(
        address1.address,
      )
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1TokensAfterBuy,
      )
    })

    it('Should add buy anount of tokens after buy of voter', async () => {
      const randomProposedPrice = 321312321
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1 } = await deployContract()

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      await votableERC20.connect(address1).startVote()
      await votableERC20.connect(address1).addVotePrice(randomProposedPrice)

      const address1Tokens = await votableERC20.balanceOf(address1.address)
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1Tokens,
      )

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      const address1TokensAfterBuy = await votableERC20.balanceOf(
        address1.address,
      )
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1TokensAfterBuy,
      )
    })

    it('Should decrease transfer amount of tokens after transfer of voter', async () => {
      const randomProposedPrice = 321312321
      const purchaseValue = ethers.utils.parseEther('1')
      const { votableERC20, address1, address2 } = await deployContract()

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      await votableERC20.connect(address1).startVote()
      await votableERC20.connect(address1).addVotePrice(randomProposedPrice)

      const address1Tokens = await votableERC20.balanceOf(address1.address)
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1Tokens,
      )

      const transferAmount = address1Tokens / 2
      await votableERC20
        .connect(address1)
        .transfer(address2.address, transferAmount)

      const address1TokensAfterTransfer = await votableERC20.balanceOf(
        address1.address,
      )
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1TokensAfterTransfer,
      )
    })

    it('Should decrease transfer anount of tokens after transferFrom of voter', async () => {
      const randomProposedPrice = 321312321
      const purchaseValue = ethers.utils.parseEther('1')
      const {
        votableERC20,
        address1,
        address2,
        address3,
      } = await deployContract()

      await votableERC20.connect(address1).buy({ value: purchaseValue })

      await votableERC20.connect(address1).startVote()
      await votableERC20.connect(address1).addVotePrice(randomProposedPrice)

      const address1Tokens = await votableERC20.balanceOf(address1.address)
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1Tokens,
      )

      const expectedTokens = purchaseValue
        .sub(purchaseValue.mul(5).div(100))
        .div(await votableERC20.tokenPrice())
      const expectedTokensApproved = expectedTokens / 2

      await votableERC20
        .connect(address1)
        .approve(address2.address, expectedTokensApproved)

      const transferAmount = address1Tokens / 2
      await votableERC20
        .connect(address2)
        .transferFrom(address1.address, address3.address, transferAmount)

      const address1TokensAfterTransfer = await votableERC20.balanceOf(
        address1.address,
      )
      expect(await votableERC20.totalOfPrice(randomProposedPrice)).to.equal(
        address1TokensAfterTransfer,
      )
    })
  })
})

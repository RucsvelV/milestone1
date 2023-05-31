const { expect } = require('chai')
const { ethers } = require('hardhat')

describe('Attacker contract', function () {
  const disiredPrice = 100

  const deployContracts = async () => {
    const [owner] = await ethers.getSigners()

    const Attacker = await ethers.getContractFactory('Attacker')
    const VotableERC20 = await ethers.getContractFactory('VotableERC20')

    votableERC20 = await VotableERC20.deploy(
      'vot',
      10000,
      ethers.BigNumber.from('100000000000000000'),
      10000,
      1,
    )
    await votableERC20.deployed()
    await votableERC20.buy({ value: ethers.utils.parseEther('1.0') })
    await votableERC20.startVote()

    attacker = await Attacker.deploy(votableERC20.address, disiredPrice)
    await attacker.deployed()

    return { attacker, votableERC20, owner }
  }

  describe('Attack from attacker contract', function () {
    it('Should initiate attack on the VotableERC20 contract', async function () {
      const { attacker, votableERC20, owner } = await deployContracts()

      await owner.sendTransaction({
        to: attacker.address,
        value: ethers.utils.parseEther('1.0'),
      })

      expect(attacker.proposedPrices).to.equal('')
    })
  })

  // write more tests, check more params in expect values, add negative tests
})

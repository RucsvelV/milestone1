import { ethers } from 'hardhat'

async function main() {
  const tokenName = 'Voter'
  const symbol = 'vot'
  const initialTokenPrice = 10000
  const maxTokenSupply = ethers.BigNumber.from('100000000000000000')
  const timeToVote = 3600
  const feePercent = 500

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

  console.log('VotableERC20 deployed to:', votableERC20.address)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

import { ethers } from 'hardhat'

async function main() {
  const VotableERC20 = await ethers.getContractFactory('VotableERC20')
  const votableERC20 = await VotableERC20.deploy()

  const tokenName = 'Vot'
  const initialTokenPrice = 1000000000
  const maxTokenSupply = 1000000
  const timeToVote = 100000
  const feePercent = 1

  await votableERC20.deployed(
    tokenName,
    initialTokenPrice,
    maxTokenSupply,
    timeToVote,
    feePercent,
  )

  console.log('VotableERC20 deployed to:', votableERC20.address)
}
// "vot", 10000, 100000000000000000, 10000, 1
99000000000000000000000000000000
100000000000000000000000000000000000
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

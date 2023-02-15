const hre = require('hardhat')
const { ethers } = hre

async function main() {
  // @TODO
  // 1. get merkle root
  // 2. get wearables airdrop (x3 addresses), vrf params, ERC20 currency - according process.env.NETWORK Mumbai / Mainnet
  // 3. deploy Bufalo Skull contract
  // 4. approve wearables to deployed contract
  // 5. deploy BUFA contract
  // 6. deploy Music NFT contract
  // 7. deploy staking contract

  const BOTVDeployer = await ethers.getContractFactory('BOTV')
  const BOTVContract = await BOTVDeployer.deploy()

  await BOTVContract.deployed()

  console.log('BOTV Skulls collection deployed to:', BOTVContract.address)
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

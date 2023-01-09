const NFTCollection = artifacts.require('./NFTCollection.sol')

contract('NFTCollection', (accounts) => {
  it('basic test', async () => {
    const nftCollection = await NFTCollection.deployed()

    console.log('test ', accounts, await nftCollection.name.call())
  })
})

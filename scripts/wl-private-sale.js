import * as dotenv from 'dotenv'
import fs from 'fs'
import { Alchemy, Network } from 'alchemy-sdk'
import wlData from '../data/inputs/wl-collections.js'
import wlManual from '../data/inputs/wl-manual-addresses.js'

dotenv.config()
const { ALCHEMY_API_KEY } = process.env

const whitelistAddresses = new Set(wlManual)
const wlInfos = []

for (let { network, name, address, tokenIDs, manaPrice } of wlData) {
  const config = {
    apiKey: ALCHEMY_API_KEY,
    network: network == 'matic' ? Network.MATIC_MAINNET : Network.ETH_MAINNET
  }
  const alchemy = new Alchemy(config)

  if (tokenIDs) {
    let collectionOwners = 0
    for (let tokenID of tokenIDs) {
      const { owners } = await alchemy.nft.getOwnersForNft(address, tokenID)
      owners.forEach(whitelistAddresses.add, whitelistAddresses)
      collectionOwners = collectionOwners + owners.length
      wlInfos.push({
        network,
        name,
        address,
        tokenID,
        nbOwners: owners.length
      })
    }
    wlInfos.push({
      network,
      name,
      address,
      nbOwners: collectionOwners
    })
  } else {
    const { owners } = await alchemy.nft.getOwnersForContract(address)
    owners.forEach(whitelistAddresses.add, whitelistAddresses)
    wlInfos.push({
      network,
      name,
      address,
      nbOwners: owners.length
    })
  }
}

/**
 * @todo : Merkle tree with whitelisted addresses
 */

fs.writeFileSync(
  './data/results/wl-private-sale-addresses.json',
  '[' + Array.from(whitelistAddresses).toString() + ']'
)

fs.writeFileSync(
  './data/results/wl-private-sale-data.json',
  JSON.stringify({
    whitelistAddresses,
    wlInfos,
    nbAdrUniq: whitelistAddresses.size
  })
)

console.log(
  'Data for the private sale (addresses whitelisted) updated, ',
  'check data/results/wl-private-sale-*.json files'
)

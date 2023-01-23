import * as dotenv from 'dotenv'
import fs from 'fs'
import { Alchemy, Network } from 'alchemy-sdk'
import superagant from 'superagent'

import previousCollections from '../data/inputs/previous-collections/index.js'
import sellersAddresses from '../data/inputs/sellers-addresses.js'
import toAddManuallyAddresses from '../data/inputs/toadd-manually-addresses.js'

dotenv.config()
const { ALCHEMY_API_KEY } = process.env

const allowlistsData = {}

function initAllowlistsDataForAddr(addr) {
  if (!allowlistsData[addr]) {
    allowlistsData[addr] = {
      sales: { usdSpent: 0, tokens: [] },
      collections: { totalOwned: 0, tokens: [] }
    }
  }
}

function addAddressesFromManualList() {
  toAddManuallyAddresses.forEach(initAllowlistsDataForAddr)
  console.log('Add addresses from a specific list : DONE')
}

async function addAddressesFromCollectionsOwners() {
  for (let { tokenId, name, contractAddress, chain } of previousCollections) {
    const config = {
      apiKey: ALCHEMY_API_KEY,
      network:
        chain === 'MATIC'
          ? Network.MATIC_MAINNET
          : chain === 'ETHEREUM'
          ? Network.ETH_MAINNET
          : 'unknown'
    }
    const alchemy = new Alchemy(config)

    const { owners } = tokenId
      ? await alchemy.nft.getOwnersForNft(contractAddress, tokenId)
      : await alchemy.nft.getOwnersForNft(contractAddress)

    owners.forEach((addr) => {
      initAllowlistsDataForAddr(addr)
      allowlistsData[addr]['collections']['tokens'].push({
        chain,
        name,
        tokenId
      })
      allowlistsData[addr]['collections']['totalOwned']++
    })
  }
  console.log('Add addresses from previous collections owners : DONE')
}

async function addAddressesFromBuyers() {
  for (const sellerAddress of sellersAddresses) {
    for (const network of [Network.ETH_MAINNET, Network.MATIC_MAINNET]) {
      const config = {
        apiKey: ALCHEMY_API_KEY,
        network
      }
      const alchemy = new Alchemy(config)
      const nftSales = await alchemy.nft.getNftSales({
        sellerAddress
      })

      console.log('NFT sales ', config.network, nftSales)
    }

    /*
  async function getPrice(coingeckoCoin, date) {
    return superagent(
      `https://api.coingecko.com/api/v3/coins/${coingeckoCoin}/history?date=${date}&localization=false`
    )
  }

  // decentraland sales  https://nft-api.decentraland.org/v1/sales?seller=0x505d688a38b8cb9190b4f671d98a37a784e92c1f
  // coingecko coin : "decentraland"
  // open sea sales https://docs.alchemy.com/reference/getnftsales
  */
  }
}

async function main() {
  try {
    //  await addAddressesFromCollectionsOwners()

    await addAddressesFromBuyers()

    addAddressesFromManualList()

    /*
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
  */
  } catch (e) {
    console.error('Main error : ', e)
  }
}

main()

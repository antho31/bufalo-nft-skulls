import * as dotenv from 'dotenv'

import { Alchemy, Network } from 'alchemy-sdk'
import { Parser } from '@json2csv/plainjs'
import fs from 'fs'
import superagent from 'superagent'
import Throttle from 'superagent-throttle'
import Web3 from 'web3'

import NFTReleasesCollection from '../data/inputs/previous-collections/opensea-nftreleases.js'
import previousCollections from '../data/inputs/previous-collections/index.js'
import sellersAddresses from '../data/inputs/sellers-addresses.js'
import toAddManuallyAddresses from '../data/inputs/toadd-manually-addresses.js'

dotenv.config()
const { ALCHEMY_API_KEY, NFT_PORT_API_KEY } = process.env

const coingeckoThrottle = new Throttle({
  active: true, // set false to pause queue
  rate: 10, // how many requests can be sent every `ratePer`
  ratePer: 1000 * 60, // number of ms in which `rate` requests may be sent
  concurrent: 1 // how many requests can be sent concurrently
})

const nftPortThrottle = new Throttle({
  active: true, // set false to pause queue
  rate: 1, // how many requests can be sent every `ratePer`
  ratePer: 1000, // number of ms in which `rate` requests may be sent
  concurrent: 3 // how many requests can be sent concurrently
})

const WETH_Polygon_Address = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
const ethPrices = {}
const manaPrices = {}

const allowlistsData = {}

function initAllowlistsDataForAddr(addr) {
  if (!allowlistsData[addr]) {
    allowlistsData[addr] = {
      sales: { usdSpent: 0, tokens: [] },
      collections: { totalOwned: 0, tokens: [] }
    }
  }
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
      : await alchemy.nft.getOwnersForContract(contractAddress)

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
}

async function retrieveNftMarketplaceSales() {
  // Note : https://api.nftport.xyz/v0/transactions/accounts/${addr}' do not include all sales on Polygon...
  // We have to check all NFT transfers from Polygon and detect txs with WETH transfers

  for (let { tokenId, name, contractAddress, chain } of NFTReleasesCollection) {
    if (chain === 'ETHEREUM') {
      const {
        body: { transactions }
      } = await superagent(
        `https://api.nftport.xyz/v0/transactions/nfts/${contractAddress}/${tokenId}?chain=ethereum&page_size=50&type=sale`
      )
        .set('Authorization', NFT_PORT_API_KEY)
        .use(nftPortThrottle.plugin())

      for (let {
        buyer_address,
        seller_address,
        quantity,
        price_details: { asset_type, price_usd },
        transaction_hash,
        transaction_date
      } of transactions) {
        if (sellersAddresses.includes(seller_address)) {
          initAllowlistsDataForAddr(buyer_address)
          allowlistsData[buyer_address]['sales']['usdSpent'] += price_usd
          allowlistsData[buyer_address]['sales']['tokens'].push({
            tokenId,
            name,
            contractAddress,
            chain,
            price_usd,
            transaction_hash,
            transaction_date
          })
        }
      }
    } else if (chain === 'MATIC') {
      const {
        body: { transactions }
      } = await superagent(
        `https://api.nftport.xyz/v0/transactions/nfts/${contractAddress}/${tokenId}?chain=polygon&page_size=50&type=transfer`
      )
        .set('Authorization', NFT_PORT_API_KEY)
        .use(nftPortThrottle.plugin())

      for (let {
        transfer_from,
        transfer_to,
        quantity,
        transaction_hash,
        block_number,
        transaction_date
      } of transactions) {
        if (sellersAddresses.includes(transfer_from)) {
          const config = {
            apiKey: ALCHEMY_API_KEY,
            network: Network.MATIC_MAINNET
          }
          const alchemy = new Alchemy(config)

          // @todo get transfer fees too (from 0x 0xf715beb51ec8f63317d66f491e37e7bb048fcc2d)
          const { transfers } = await alchemy.core.getAssetTransfers({
            fromBlock: block_number,
            toBlock: block_number,
            fromAddress: transfer_to,
            toAddress: transfer_from,
            contractAddress: WETH_Polygon_Address,
            excludeZeroValue: true,
            category: ['erc20']
          })

          for (const { value } of transfers) {
            // from YYYY-MM-DD to DD-MM-YYYY
            let date = new Date(transaction_date)
            date = `${date.getDate()}-${
              date.getMonth() + 1
            }-${date.getFullYear()}`

            let price_usd
            if (!ethPrices[date]) {
              const {
                body: {
                  market_data: {
                    current_price: { usd }
                  }
                }
              } = await superagent(
                `https://api.coingecko.com/api/v3/coins/ethereum/history?date=${date}&localization=false`
              ).use(coingeckoThrottle.plugin())
              ethPrices[date] = usd
              price_usd = usd * value
            } else {
              price_usd = ethPrices[date] * value
            }

            initAllowlistsDataForAddr(transfer_to)
            allowlistsData[transfer_to]['sales']['usdSpent'] += price_usd
            allowlistsData[transfer_to]['sales']['tokens'].push({
              tokenId,
              name,
              contractAddress,
              chain,
              price_usd,
              transaction_hash,
              transaction_date
            })
          }
        }
      }
    }
  }
}

async function retrieveManaSales() {
  for (const sellerAddress of sellersAddresses) {
    const {
      body: { data }
    } = await superagent(
      `https://nft-api.decentraland.org/v1/sales?seller=${sellerAddress}&first=1000`
    )

    for (const {
      buyer,
      tokenId,
      contractAddress,
      price,
      timestamp,
      txHash: transaction_hash,
      network
    } of data) {
      const paidInMana = Number(Web3.utils.fromWei(price, 'ether'))

      // from YYYY-MM-DD to DD-MM-YYYY
      let date = new Date(timestamp)
      date = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`

      // note we include DCL fees (not received by seller)
      let price_usd
      if (!manaPrices[date]) {
        const {
          body: {
            market_data: {
              current_price: { usd }
            }
          }
        } = await superagent(
          `https://api.coingecko.com/api/v3/coins/decentraland/history?date=${date}&localization=false`
        ).use(coingeckoThrottle.plugin())
        manaPrices[date] = usd
        price_usd = usd * paidInMana
      } else {
        price_usd = manaPrices[date] * paidInMana
      }

      const collection = previousCollections.find(
        (c) => c.contractAddress.toLowerCase() === contractAddress
      )
      const name = collection ? collection.name : '(DCL item)'
      const chain = network
      const transaction_date = date

      initAllowlistsDataForAddr(buyer)
      allowlistsData[buyer]['sales']['usdSpent'] += price_usd
      allowlistsData[buyer]['sales']['tokens'].push({
        tokenId,
        name,
        contractAddress,
        chain,
        price_usd,
        transaction_hash,
        transaction_date
      })
    }
  }
}

async function main() {
  try {
    toAddManuallyAddresses.forEach(initAllowlistsDataForAddr)
    console.log('Add addresses from a specific list : DONE')

    await addAddressesFromCollectionsOwners()
    console.log('Add addresses from token scraping : DONE')

    await retrieveNftMarketplaceSales()
    console.log('Add addresses & compute sales values from Opensea tx : DONE')

    await retrieveManaSales()
    console.log('Add addresses & compute sales values from DCL : DONE')

    let totalSales = []
    for (const buyer_address in allowlistsData) {
      const {
        sales: { usdSpent, tokens }
      } = allowlistsData[buyer_address]
      const txs = tokens.map(
        (t) => `https://polygonscan.com/tx/${t.transaction_hash}`
      )
      totalSales.push({ buyer_address, usdSpent, txs: txs.join(' , ') })
    }
    totalSales.sort(function (a, b) {
      return a.usdSpent - b.usdSpent
    })
    const parser = new Parser()
    const csv = parser.parse(totalSales)

    const upto100UsdSaleIndex = totalSales.findIndex((e) => e.usdSpent >= 100)
    const superfansAllowlist = Object.keys(
      totalSales.slice(upto100UsdSaleIndex)
    )

    const communityAllowlist = Object.keys(allowlistsData)

    fs.writeFileSync(
      './data/results/superfansAllowlist.json',
      JSON.stringify(superfansAllowlist, null, 2)
    )

    fs.writeFileSync(
      './data/results/communityAllowlist.json',
      JSON.stringify(communityAllowlist, null, 2)
    )

    fs.writeFileSync('./data/results/totalSales.csv', csv)

    fs.writeFileSync(
      './data/results/privateSaleResults.json',
      JSON.stringify(allowlistsData, null, 2)
    )

    console.log(
      'Data results in the data/results folder, checkout communityAllowlist.json, totalSales.csv and privateSaleResults.json files'
    )
  } catch (e) {
    console.error('Main error : ', e)
  }
}

main()

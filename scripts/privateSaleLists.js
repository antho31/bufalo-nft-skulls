import * as dotenv from 'dotenv'

import { Alchemy, Network } from 'alchemy-sdk'
import fs from 'fs'
import { Parser } from '@json2csv/plainjs'

import superagent from 'superagent'
import Throttle from 'superagent-throttle'
import Web3 from 'web3'

import NFTReleasesCollection from '../data/inputs/previous-collections/opensea-nftreleases.js'
import previousCollections from '../data/inputs/previous-collections/index.js'
import sellersAddresses from '../data/inputs/sellers-addresses.js'
import toAddManuallyAddresses from '../data/inputs/toadd-manually-addresses.js'

dotenv.config()
const { ALCHEMY_API_KEY, NFT_PORT_API_KEY } = process.env

const WETH_Polygon_Address = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
const TOTAL_USD_FANS_THRESOLD = 20

const ethPrices = {}
const manaPrices = {}

const allowlistsData = {}

const coingeckoThrottle = new Throttle({
  active: true,
  rate: 10,
  ratePer: 1000 * 60,
  concurrent: 1
})

const nftPortThrottle = new Throttle({
  active: true,
  rate: 1,
  ratePer: 1000,
  concurrent: 3
})

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
        tokenId,
        name,
        contractAddress,
        chain
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
        price_details: { price_usd },
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

          // We might count later transfer fees too ... (from 0x 0xf715beb51ec8f63317d66f491e37e7bb048fcc2d)
          // For now, we check from sellersAddresses only
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
            // Format from YYYY-MM-DD to DD-MM-YYYY for Coingecko request
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

      // Format from YYYY-MM-DD to DD-MM-YYYY for Coingecko request
      let date = new Date(timestamp)
      date = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`

      // We include DCL fees (not received by seller)
      // We might exclude the fees amounts later...
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
    console.log('Add addresses & compute sales values from Opensea txs : DONE')

    await retrieveManaSales()
    console.log('Add addresses & compute sales values from DCL : DONE')

    if (allowlistsData['0x000000000000000000000000000000000000dead'])
      delete allowlistsData['0x000000000000000000000000000000000000dead']

    // Let's generate a spreadsheet (CSV) for the sales, ordered by total spending amount
    let totalSales = []
    for (const allowlistedAddress in allowlistsData) {
      const {
        sales: { usdSpent, tokens }
      } = allowlistsData[allowlistedAddress]
      const txs = tokens.map((t) =>
        t.chain === 'MATIC'
          ? `https://polygonscan.com/tx/${t.transaction_hash}`
          : `https://etherscan.com/tx/${t.transaction_hash}`
      )
      totalSales.push({ allowlistedAddress, usdSpent, txs: txs.join(' , ') })
    }
    totalSales.sort(function (a, b) {
      return b.usdSpent - a.usdSpent
    })
    const parser = new Parser()
    const csv = parser.parse(totalSales)

    const upto20UsdSaleIndex = totalSales.findIndex(
      (e) => e.usdSpent < TOTAL_USD_FANS_THRESOLD
    )
    totalSales.splice(upto20UsdSaleIndex)
    const fansAllowlist = totalSales.map(
      ({ allowlistedAddress }) => allowlistedAddress
    )

    const communityAllowlist = Object.keys(allowlistsData)

    fs.writeFileSync(
      './data/results/allowlists/community.json',
      JSON.stringify(communityAllowlist, null, 2)
    )

    fs.writeFileSync(
      './data/results/allowlists/fans.json',
      JSON.stringify(fansAllowlist, null, 2)
    )

    fs.writeFileSync('./data/results/communityActivity/totalSales.csv', csv)

    allowlistsData['snapshotDate'] = new Date().toJSON()
    fs.writeFileSync(
      `./data/results/communityActivity/snapshot.json`,
      JSON.stringify(allowlistsData, null, 2)
    )

    console.log(
      '[privateSaleLists] Generated files in the data/results/allowlists and data/results/communityActivity folders'
    )
  } catch (e) {
    console.error('[privateSaleLists] Main error : ', e)
  }
}

main()

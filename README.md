# Bufalo's NFT Collection - BOTV Skulls (BOTV)

[Bufalo](https://twitter.com/bufalomusic) is a DJ performing in the Decentraland metaverse, bringing "Futuristic Western Music" to people. 

The DJ / Producer / Visual Artist is launching an NFT collection for its community. The tokens' aims to :  

* offer physical goodies 
* unlock several airdrops (Decentraland wearables, among other surprises)

A staking program gives the opportunity to get : 
* commercial rights for music releases produced by Bufalo
* exclusive perks

## Core information (⚠️ to be confirmed !) 

⛓️ Chain : Polygon PoS

🔢 Supply : 1000 tokens 

🖼️ A unique art skull with seven traits (several rarities) and a 🎵 loop. Reveal on March 16, 2023.

📅 Private sale date (wallets on "Community" allowlist only) : March 2, 2023. Public sale date : March 9, 2023

🔖 Sale price : 0.05 WETH per token, 50 % discount on the second mint for wallets on the "Fans" allowlist. 

🎁 Hat & trench coat (NFT wearables) offered on mint

🔢 2 tokens max par wallet on private sale, 10 tokens max per wallet on public sale

👑 10 % royalties

💵 Treasury (Oxsplits contract) : [0x0231339790F09B5F3d50a37D0dd82D66e82cA37D](https://app.0xsplits.xyz/accounts/0x0231339790F09B5F3d50a37D0dd82D66e82cA37D/?chainId=137)

💰 Collect points when staking an NFT

🌐 More info on [bufalomusic.com](https://bufalomusic.com)


## Allowlists

### Community allowlist : private sale access

All token owners from previous Bufalo collections are admissible on the "Community" allowlist, to mint up to two tokens during the private sale. See the list of eligible collections [here](./data/inputs/previous-collections/index.js).

### Fans allowlist : discount on the second mint

Those who supported Bufalo up to $20 are on the "Fans" allowlist, and get a 50% discount on the second token. Amounts are computed on USD-basis (rate at the time of sale), from : 
* Decentraland purchases 
* [Bufalo NFT realeases'](https://opensea.io/collection/bufalonftreleases) transactions on Opensea (Ethereum & Polygon). See the list of eligible tokens [here](./data/inputs/previous-collections/opensea-nftreleases.js).

### Generate the allowlists

Run the `privateSaleScript` script : 

```bash
npm run privateSaleScript
```

Result files can be found inside the `data/results` folder

|Generated file|Description
|---|----|
|[Community allowlist](./data/results/allowlists/community.json)|Array of addresses 
|[Fan allowlist](./data/results/allowlists/fans.json)|Array of addresses 
|[Activity snapshot](./data/results/communityActivity/snapshot.json)|On-chain collected data 
|[Sales](./data/results/communityActivity/totalSales.csv)|Paid transactions summary ([see Google Spreadsheet version](https://docs.google.com/spreadsheets/d/1jFPqO3S3dCODnYy4J-3v0ztPCuOTN7Qsvka_N4w_-K8/edit?usp=sharing)) 
|[Community merkle](./data/results/merkleAllowlists/community.json)|Merkle root & proofs for each address on the Community allowlist 
|[Fan merkle](./data/results/merkleAllowlists/community.json)|Merkle root & proofs for each address on the Fan allowlist 

## Tech Stack

**Interfaces** : Decentraland NFT API (DCL sales), NFTPort API (NFT data), Alchemy (Blockchain data), Coingecko (Prices history) 

**Snapshot script, tests :** Node v18

**Smart contract language:** Solidity

**Smart contract framework:** Truffle

**Smart contract libs and tools:** OZ, Chainlink

## Roadmap

✅ Generate allowlists (addresses arrays & merkle data), from token ownerships and sales 

🔲 NFT metadata (skull images) & uploads on IPFS

🔲 ERC721A contract for skull NFTs
* Minting price & private sale access with Merkle proof verification
* Hat & trench coat wearable transfers on mint
* Reveal with random assignation using Chainlink

🔲 ERC20 and staking contracts 
* The longer you stake the skull NFT, the more ERC20 tokens you get.


🔲 ERC721A for music NFTs
* Can be purchased burning ERC20 tokens 
* NFT holder get commercial rights to the related music

## Development

You need NodeJS installed on your computer. 

Clone the project and install the dependencies :

```bash
gh repo clone antho31/bufalo-nft-skulls
npm install 
```

Then set your environment variables : 

```bash
cp .env_example .env
nano .env
```
### Environment Variables


| Parameter         | Type     | Description                |
| :-----------------| :------- | :------------------------- |
| `ALCHEMY_API_KEY`        | `string` | **Required to regenerate allowlists**. API key from [Alchemy](https://docs.alchemy.com/docs/alchemy-quickstart-guide#1key-create-an-alchemy-key)  |
| `MNEMONIC`        | `string` | **Required to deploy**. Your seed phrase, HD wallet to use for deployment  |
| `NFT_PORT_API_KEY`        | `string` | **Required to regenerate allowlists**. API key from [NFTPort](https://docs.nftport.xyz/)  |

### Smart contracts deployment

To deploy on Polygon network : 

```bash
  truffle compile
  truffle deploy --network matic
```

### Running Tests

To run tests, you need to run run a local network :

```bash
  truffle develop
```

Next run the following command : 

```bash
  truffle test
```


## Authors

- [Anthony Gourraud - @antho31](https://www.github.com/antho31)


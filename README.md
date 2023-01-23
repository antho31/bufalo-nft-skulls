# Bufalo's NFT Collection - BOTV Skulls (BOTV)

[Bufalo](https://twitter.com/bufalomusic) is a DJ performing in the Decentraland metaverse, bringing "Futurtistic Western Music" to the people. 

The DJ / Producer / Visual Artist is launching an NFT collection for its community. The tokens aims to : 

* offer physical perks 
* give commercial rights on musics produced by Bufalo
* be eligible for several airdrops - Decentraland wearables, among others suprises
 
## Core information

⛓️ Chain : Polygon PoS

🔢 Supply : 1000 tokens 

🖼️ A unique art skull with seven traits (several rarities) and a 🎵 loop. Reveal on March 16, 2023.

📅 Private sale date (addresses on "Community allowlist" only) : March 2, 2023. Public sale date : March 9, 2023

🔖 Sale price : 0.05 WETH per token, 50 % discount on the second mint for addresses on the "Superfans allowlist". 

🎁 Hat & trench coat (Decentraland wearables) offered on mint

🔢 2 tokens max par wallet on private sale, 10 tokens max per wallet on public sale

👑 10 % royalties

🌐 More info on [bufalomusic.com](https://bufalomusic.com)


## Allowlists

All token owners from previous Bufalo collections are admissible on the "Community allowlist", to mint up to two tokens on private sale. Those who supported with $100+ value of MANA are also in another list ("Superfans allowlist"), and get a 50% discount on the second token. 



Check `data/results/wl-private-sale-addresses.json` file to get the whole list. 

To compute the whitelist (and regenerate `wl-private-sale-addresses.json` file), you should run the `wl-private-sale` script : 

```bash
npm run wl-private-sale
```



## Tech Stack

**Scripting :** Node

**Smart contract language:** Solidity

**Smart contract framework:** Truffle

**Smart contract libs and tools:** OZ, Chainlink

## Roadmap

✅ [Scripting] Merkle tree for whitelist

🔲 [Scripting] Generate NFT metadata (skull images)

🔲 [NFT Contract] ERC721A base for skull NFT

🔲 [NFT Contract] Mint : Private & public sale, transfer skull + hat & trench coat wearable NFTs

🔲 [NFT Contract] Reveal : Random assignation with Chainlink

🔲 [Staking Contract] Mint music NFT (ERC721) on staking

🔲 [Staking Contract] Burn music NFT on withdraw

## Installation

You need NodeJS installed on your computer. 

Once project cloned, install the dependencies :

```bash
npm install -g truffle
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
| `ALCHEMY_API_KEY`        | `string` | **Required to regenerate allowlists scripts**. API key from Alchemy  |
| `MNEMONIC`        | `string` | **Required to deploy**. Your seed phrase, HD wallet to use for deployment  |

## Deployment

To deploy on Polygon network : 

```bash
  truffle compile
  truffle deploy --network matic
```


## Local development



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


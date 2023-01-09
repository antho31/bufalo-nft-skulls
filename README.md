# Bufalo NFT skulls

[Bufalo](https://twitter.com/bufalomusic) is a DJ performing in the Decentraland metaverse, bringing "Futurtistic Western Music" to the people. 

The DJ / Producer / Visual Artist is launching an NFT collection for its community. The tokens aims to : 

* offer physical perks 
* give commercial rights on musics produced by Bufalo
* be eligible for several airdrops - Decentraland wearables, among others suprises
 
## Core information

🔢 Supply : 1000 tokens 

🖼️ A unique art skull with seven traits (several rarities) and a 🎵 loop. Reveal on March 2,2023.

📅 Private sale date : TBD, Public sale date : TBD

🔖 Private sale price : TBD, Public sale date : TBD

🎁 A french coat (Decentraland wearable) offered on mint

👑 10 % royalties

## Private sale

All token owners from previous Bufalo collections are whitelisted to mint two tokens on private sale. 
Those who supported with $100+ value of MANA will get a 50% discount on the second token. 

### Whitelisted addresses

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

🔲 [NFT Contract] Mint : Private & public sale, transfer skull + french coat

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


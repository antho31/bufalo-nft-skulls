# Bufalo's NFT Collection - BOTV Skulls (BOTV)

<img src="assets/cover.png" alt="BOTV Skulls cover">

---

[Bufalo](https://twitter.com/bufalomusic) is a DJ performing in the Decentraland metaverse, bringing "Futuristic Western Music" to people.

The DJ / Producer / Visual Artist is launching an NFT collection for its community. The tokens' aims to :

- offer physical goodies
- unlock several airdrops (Decentraland wearables, among other surprises)
- give VIP access into the Bufalo Saloon in Decentraland
- receive a share of the income from deals with music labels

Holding a Skull NFT gives the opportunity to continually claim rewards to get :

- commercial rights for music releases produced by Bufalo
- exclusive perks like video tutorials

## Core information

⛓️ Chain : Polygon PoS

🔢 Supply : 1000 tokens

🔖 Sale price : 0.05 WETH per token, 50 % discount on the second mint for wallets on the "Fans" allowlist

📅 Private sale (wallets on "Community" allowlist only) : March 28. Public sale : March 29

🖼️ A unique art skull with seven traits (several rarities) and a 🎵 loop. Reveal date : March 30. Token assignations perfectly random, with no cheating possible from anyone thanks to the use of Chainlink VRF

🎁 Hat, trench coat & skull wearables offered on mint

🔢 10 tokens max per wallet

👑 10 % royalties

💵 Mint treasury : [0x3c0dabc82bf51d1bf994a54e70e7a7d19865f950](https://debank.com/profile/0x3c0dabc82bf51d1bf994a54e70e7a7d19865f950). Royalties treasury (Oxsplits contract) : [0x0231339790F09B5F3d50a37D0dd82D66e82cA37D](https://app.0xsplits.xyz/accounts/0x0231339790F09B5F3d50a37D0dd82D66e82cA37D/?chainId=137)

💰 Hold-to-earn : receive a certain amount of $BUFA tokens (depending on the rarity of the NFT's attributes) every day. Spend these against benefits.

🌐 More info on the website coming soon [bufalomusic.com](https://bufalomusic.com)

## Allowlists

### Community allowlist : private sale access

All token owners from previous Bufalo collections are admissible on the "Community" allowlist. See the list of eligible collections [here](./data/inputs/previous-collections/index.js).

### Fans allowlist : discount on the second mint

Those who supported Bufalo up to $50 are on the "Fans" allowlist, and get a 50% discount on the second token. Amounts are computed on USD-basis (rate at the time of sale), from :

- Decentraland purchases
- [Bufalo NFT realeases'](https://opensea.io/collection/bufalonftreleases) transactions on Opensea (Ethereum & Polygon). See the list of eligible tokens [here](./data/inputs/previous-collections/opensea-nftreleases.js).

### Generated allowlists

This [Google Spreadsheet](https://docs.google.com/spreadsheets/d/1jFPqO3S3dCODnYy4J-3v0ztPCuOTN7Qsvka_N4w_-K8/edit?usp=sharing) indicates which are the addresses on the allowlists.

| File                                                                | Description                                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [Community allowlist](./data/results/allowlists/community.json)     | Array of addresses                                               |
| [Fan allowlist](./data/results/allowlists/fans.json)                | Array of addresses                                               |
| [Activity snapshot](./data/results/communityActivity/snapshot.json) | On-chain collected data                                          |
| [Sales](./data/results/communityActivity/totalSales.csv)            | Paid transactions summary                                        |
| [Community merkle](./data/results/merkleAllowlists/community.json)  | Merkle root & proofs for each address on the Community allowlist |
| [Fan merkle](./data/results/merkleAllowlists/community.json)        | Merkle root & proofs for each address on the Fan allowlist       |

### Mint : get merkle proofs for a specific address

You can fetch `https://bufalo-api.anthonygourraud.workers.dev/merkleproofs/:addr` to get the merkle proofs for an address `addr`.

```js
// Result from https://bufalo-api.anthonygourraud.workers.dev/merkleproofs/0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA
{
  "addr": "0x64e8f7c2b4fd33f5e8470f3c6df04974f90fc2ca",

  // is from Community allowlist
  "privateSaleMerkleProof": [
    "0x....",
    "0x....."
  ],

  // is not from Fans allowlist
  "discountMerkleProof": []
}
```

## Rarities & $BUFA rewards

Rarity score is computed following [Open Rarity](https://www.openrarity.dev/) standard.
All attributes are defined within the metadata JSON files for each token, available [here](./data/results/metadata/BOTV/tokens/). The rarer the attributes of the token, the more $BUFA tokens its owner can receive.

### Generated score computations

| File                                                                       | Description                                                                                                                                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Rank](./data/results/metadata/BOTV/rank.csv)                              | Rank, score and number of $BUFA per day for every token. ([see Google Spreadsheet version](https://docs.google.com/spreadsheets/d/1igOFN5aebsixi28IkVbI0plyBg_lg3uJtMb_bXB1DX4)) |
| [$BUFA rewards merkle](./data/results/metadata/bufaRewardsMerkleData.json) | Merkle root & proofs to claim $BUFA                                                                                                                                              |

### $BUFA rewards : get merkle proofs to claim`

You can fetch `https://bufalo-api.anthonygourraud.workers.dev/tokensForOwner/polygon/:addr` to get all token infos for the wallet with address `addr`. Use `tokenIds`, `rewardsPerDay` and `rewardsProofs` values from the response to claim.

```json
// Result from https://bufalo-api.anthonygourraud.workers.dev/tokensForOwner/polygon/0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA
{
  "tokenIds": [
    "0"
  ],
  "metadataIds": [
    "977"
  ],
  "rewardsPerDay": [
    150
  ],
  "rewardsProofs": [
    [
      "0x815c37dada917998387f155315f9d0bade8d37c20297f484f017274efe5c4c47",
      "0x17b396aa747cdbfa0ae182fc7ca753415a4cf4891b5354baa4d224caa28db07a",
       ...
    ]
  ],
  "tokenData": [
    {
      "tokenId": "0",
      "metadataId": "977",
      "rank": 170,
      "title": "Bufalo BOTV Skull #977",
      "media": [
        {
          "gateway": "https://nft-cdn.alchemy.com/matic-mainnet/d3965748aa4e688668e3d77b0978d9b3",
          "thumbnail": "https://res.cloudinary.com/alchemyapi/image/upload/thumbnailv2/matic-mainnet/d3965748aa4e688668e3d77b0978d9b3",
          "raw": "ipfs://bafybeicgk7uqmmfhcopoyh7rwvqgiva7ebr6u6osqbeviel7o4x3suaiee/977.png",
          "format": "png",
          "bytes": 1188597
        }
      ],
      "metadata": {
        "name": "Bufalo BOTV Skull #977",
        "description": "",
        "image": "ipfs://bafybeicgk7uqmmfhcopoyh7rwvqgiva7ebr6u6osqbeviel7o4x3suaiee/977.png",
        "attributes": [
          {
            "value": "Yellow",
            "trait_type": "Background"
          },
          ...
        ],
        "animation_url": "ipfs://bafybeig2ov6c5wbmdpcmdc5barky2rgx2b2n33noihldiensblbzf2zute/Bufalo - Billy Bob (Song 2).wav"
      }
    }
  ]
}
```

## Security

- Contracts are not audited yet.

- Note that the contract deployer has privileged access, including:

  - the ability to mint Skulls NFT for free
  - minting price modification at any time
  - the ability to set any address as unlimited minter for $BUFA tokens, including himself

## Tech Stack

**API Deployment** : Cloudflare Workers

**Interfaces** : Decentraland NFT API (DCL sales), NFTPort API (NFT data), Alchemy (Blockchain data), Coingecko (Prices history)

**Snapshot script, tests :** Node v18

**Smart contract language:** Solidity

**Smart contract framework:** Hardhat

**Smart contract libs and tools:** Chainlink, OpenZeppelin, Slither, Thirdweb

## Roadmap

✅ Generate allowlists (addresses arrays & merkle data)

- Previous collections' token ownerships snapshot
- Decentraland & Opensea sales analysis

✅ NFT metadata (skull images) & uploads on IPFS

- Rarity scores computation
- Higest rewards according ranking

✅ ERC721A contract for skull NFTs

- ERC4907 rentable NFT token standard and ERC2981 royalties implementations
- Minting price configurable for any ERC20 and/or blockchain's native coin
- Discounts & private sale access with Merkle proof verification
- Hat, trench coat & skull wearable transfers on mint
- Reveal with random assignation using Chainlink

✅ $BUFA rewards

- ERC20 contract, with minter role granted to the Skull NFT contract
- Earn $BUFA tokens as long as you hold your Skull NFT
- $BUFA minting with Merkle proof verification

🔲 ERC721A for music NFTs

- Can be purchased with $BUFA
- NFT holder get commercial rights to the related music

## Authors

- [Anthony Gourraud - @antho31](https://www.github.com/antho31)

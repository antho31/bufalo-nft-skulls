const fs = require("fs");
const { Parser } = require("@json2csv/plainjs");
const { scoreCollection } = require("openrarityjs");
const keccak256 = require("keccak256");
const { MerkleTree } = require("merkletreejs");
const Web3 = require("web3");

const web3 = new Web3();

fs.writeFileSync(
  `./data/results/metadata/BOTV/tokens/prereveal`,
  JSON.stringify(
    {
      attributes: [],
      animation_url:
        "ipfs://bafybeieynlkerrdbukod3crekcvvrirqvrmux3sbi7wyyejkszalpyzcgy",
      description: "Reveal coming soon...",
      image: `ipfs://bafkreic3f2trpkplot2bk3d5g4q3tcszai2pckj7b6zq45eykv2wq6v7u4`,
      name: "Bufalo BOTV Skull unrevealed"
    },
    null,
    2
  )
);

const itemTraitsBase = {
  Background: null,
  Eyes: null,
  Horns: null,
  Mask: null,
  Music: null,
  Skull: null,
  Legendary: null,
  Text: null
};

const metadatas = {};
const raritiesDistribution = {};
Object.keys(itemTraitsBase).forEach((trait) => {
  raritiesDistribution[trait] = {};
});

let collectionToRank = [];

for (let i = 0; i < 1000; i++) {
  const { attributes, name } = require(`../data/inputs/metadata/${i}.json`);

  let animation_url;
  const itemTraits = {
    ...itemTraitsBase
  };

  for (const { value, trait_type } of attributes) {
    if (!raritiesDistribution[trait_type][value])
      raritiesDistribution[trait_type][value] = { ids: [] };

    if (!itemTraits[trait_type]) {
      itemTraits[trait_type] = value;
      raritiesDistribution[trait_type][value].ids.push(i);
      if (trait_type == "Music") {
        animation_url = `ipfs://bafybeibv34mmilskls4nuubcwow4pjeswzsfv5pdkna4b2nu5g7fipay6i/${value}.wav`;
      }
    } else if (itemTraits[trait_type] != value) {
      throw new Error(`not same values for ${trait_type} - metadata ${i}`);
    }
  }

  const metadata = {
    attributes: Object.keys(itemTraits).map((trait_type) => {
      let value;
      if (itemTraits[trait_type]) {
        value = itemTraits[trait_type];
      } else {
        value = trait_type === "Legendary" ? "No" : "None";
        if (!raritiesDistribution[trait_type][value])
          raritiesDistribution[trait_type][value] = { ids: [] };
        raritiesDistribution[trait_type][value].ids.push(i);
      }
      return { trait_type, value };
    }),
    animation_url,
    description: "",
    image: `ipfs://bafybeicgk7uqmmfhcopoyh7rwvqgiva7ebr6u6osqbeviel7o4x3suaiee/${i}.png`,
    image_url: `https://bafybeicgk7uqmmfhcopoyh7rwvqgiva7ebr6u6osqbeviel7o4x3suaiee.ipfs.nftstorage.link/${i}.png`,

    name: name.includes(`BOTV Skulls`)
      ? `Bufalo BOTV Skull #${i}`
      : `${name} - Bufalo BOTV Skull #${i}`
  };

  metadatas[i] = metadata;

  collectionToRank.push({
    tokenID: i,
    traits: metadata.attributes.map(({ trait_type, value }) => ({
      //  traits: attributes.map(({ trait_type, value }) => ({
      type: trait_type,
      value
    }))
  });

  fs.writeFileSync(
    `./data/results/metadata/BOTV/tokens/${i}`,
    JSON.stringify(metadata, null, 2)
  );
}

const scores = scoreCollection(collectionToRank);

for (const { tokenID, rank, score } of scores) {
  metadatas[tokenID].rank = rank;
  metadatas[tokenID].score = score;
}

let rank = Object.keys(metadatas).map((metadataId) => {
  const { rank, image_url, name, score } = metadatas[metadataId];
  return { metadataId, rank, image_url, name: `${name} `, score };
});

rank.sort((a, b) => {
  if (a.rank > b.rank) {
    return 1;
  }
  if (a.rank < b.rank) {
    return -1;
  }
  return 0;
});

rank = rank.map((r, i) => {
  const bufaPerDay =
    i > 799
      ? 50
      : i > 499
      ? 75
      : i > 199
      ? 100
      : i > 99
      ? 150
      : i > 9
      ? 200
      : 400;

  metadatas[r.metadataId].bufaPerDay = bufaPerDay;

  return Object.assign({}, r, {
    bufaPerDay,
    bufaPerDayEncoded: web3.eth.abi.encodeParameter("uint256", bufaPerDay),
    metadataIdEncoded: web3.eth.abi.encodeParameter("uint256", r.metadataId)
  });
});

const leafNodes = rank.map((r) =>
  keccak256(
    Buffer.concat([
      Buffer.from(r.metadataIdEncoded.replace("0x", ""), "hex"),
      Buffer.from(r.bufaPerDayEncoded.replace("0x", ""), "hex")
    ])
  )
);

const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });

const bufaRewardsMerkle = { root: merkleTree.getHexRoot() };

rank.forEach(({ bufaPerDay, metadataId }, i) => {
  bufaRewardsMerkle[metadataId] = {
    bufaPerDay,
    merkleProofs: merkleTree.getHexProof(leafNodes[i])
  };
});

const parser = new Parser();
const csv = parser.parse(rank);

fs.writeFileSync("./data/results/metadata/BOTV/rank.csv", csv);

fs.writeFileSync(
  `./data/results/metadata/BOTV/rarities.json`,
  JSON.stringify({ rank, metadatas, raritiesDistribution }, null, 2)
);

fs.writeFileSync(
  "./data/results/metadata/bufaRewardsMerkleData.json",
  JSON.stringify(bufaRewardsMerkle, null, 2)
);

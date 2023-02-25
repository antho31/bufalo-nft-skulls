const fs = require("fs");

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

const rarities = {};
Object.keys(itemTraitsBase).forEach((trait) => {
  rarities[trait] = {};
});

const rank = [];

for (let i = 0; i < 1000; i++) {
  const { attributes, name } = require(`../data/inputs/metadata/${i}.json`);

  let animation_url;
  const itemTraits = {
    ...itemTraitsBase
  };

  for (const { value, trait_type } of attributes) {
    if (!rarities[trait_type][value]) rarities[trait_type][value] = { ids: [] };

    if (!itemTraits[trait_type]) {
      itemTraits[trait_type] = value;
      rarities[trait_type][value].ids.push(i);
      if (trait_type == "Music") {
        animation_url = `ipfs://bafybeig2ov6c5wbmdpcmdc5barky2rgx2b2n33noihldiensblbzf2zute/${value}.wav`;
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
        if (!rarities[trait_type][value])
          rarities[trait_type][value] = { ids: [] };
        rarities[trait_type][value].ids.push(i);
      }
      return { trait_type, value };
    }),
    animation_url,
    description: "",
    image: `ipfs://bafybeicgk7uqmmfhcopoyh7rwvqgiva7ebr6u6osqbeviel7o4x3suaiee/${i}.png`,
    name: name.includes(`BOTV Skulls`)
      ? `BOTV Skull #${i}`
      : `${name} - BOTV Skull #${i}`
  };

  rank.push(Object.assign({ metadataId: i }, metadata));

  fs.writeFileSync(
    `./data/results/metadata/BOTV/tokens/${i}`,
    JSON.stringify(metadata, null, 2)
  );
}

fs.writeFileSync(
  `./data/results/metadata/BOTV/tokens/prereveal`,
  JSON.stringify(
    {
      attributes: [],
      animation_url:
        "ipfs://bafybeieynlkerrdbukod3crekcvvrirqvrmux3sbi7wyyejkszalpyzcgy",
      description: "Reveal coming soon...",
      image: `ipfs://bafkreic3f2trpkplot2bk3d5g4q3tcszai2pckj7b6zq45eykv2wq6v7u4`,
      name: "BOTV Skull unrevealed"
    },
    null,
    2
  )
);

for (const trait of Object.keys(rarities)) {
  for (const value of Object.keys(rarities[trait])) {
    rarities[trait][value].nbTokens = rarities[trait][value].ids.length;
    rarities[trait][value].rarity = rarities[trait][value].nbTokens / 1000;
  }
}

for (let i = 0; i < 1000; i++) {
  let rarityScore = 0;
  const { attributes } = rank[i];
  for (const { value, trait_type } of attributes) {
    rarityScore = rarityScore + rarities[trait_type][value].rarity;
  }
  rank[i].rarityScore = rarityScore;
}

rank.sort((a, b) => {
  if (a.rarityScore > b.rarityScore) {
    return 1;
  }
  if (a.rarityScore < b.rarityScore) {
    return -1;
  }
  return 0;
});

fs.writeFileSync(
  `./data/results/metadata/BOTV/rarities.json`,
  JSON.stringify({ rank, rarities }, null, 2)
);

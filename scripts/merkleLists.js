const communityList = require("../data/results/allowlists/community.json");
const fansList = require("../data/results/allowlists/fans.json");
const { getMerkleDataFromAllowlistArray } = require("../utils/merkle");
const fs = require("fs");

function main() {
  try {
    fs.writeFileSync(
      "./data/results/merkleAllowlists/community.json",
      JSON.stringify(getMerkleDataFromAllowlistArray(communityList), null, 2)
    );

    fs.writeFileSync(
      "./data/results/merkleAllowlists/fans.json",
      JSON.stringify(getMerkleDataFromAllowlistArray(fansList), null, 2)
    );

    console.log(
      "[merkleLists] Generated files in the data/results/merkleAllowlists folder"
    );
  } catch (e) {
    console.error("[merkleLists] Main error : ", e);
  }
}

main();

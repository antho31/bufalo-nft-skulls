const keccak256 = require("keccak256");
const { MerkleTree } = require("merkletreejs");

function getMerkleDataFromAllowlistArray(addresses) {
  const leafNodes = addresses.map((addr) =>
    keccak256(Buffer.from(addr.replace("0x", ""), "hex"))
  );
  const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });

  const merkleData = { root: merkleTree.getHexRoot() };
  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i];
    merkleData[addr] = merkleTree.getHexProof(leafNodes[i]);
  }
  return merkleData;
}

module.exports = {
  getMerkleDataFromAllowlistArray
};

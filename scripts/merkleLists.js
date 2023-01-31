import communityList from '../data/results/allowlists/community.json' assert { type: 'json' }
import fansList from '../data/results/allowlists/fans.json' assert { type: 'json' }

import fs from 'fs'
import keccak256 from 'keccak256'
import MerkleTreeJS from 'merkletreejs'
const { MerkleTree } = MerkleTreeJS

function getMerkleDataFromAllowlistArray(addresses) {
  const leafNodes = addresses.map((addr) =>
    keccak256(Buffer.from(addr.replace('0x', ''), 'hex'))
  )
  const merkleTree = new MerkleTree(leafNodes, keccak256, { sortPairs: true })

  const merkleData = { root: merkleTree.getHexRoot() }
  for (let i = 0; i < addresses.length; i++) {
    const addr = addresses[i]
    merkleData[addr] = merkleTree.getHexProof(leafNodes[i])
  }
  return merkleData
}

function main() {
  try {
    fs.writeFileSync(
      './data/results/merkleAllowlists/community.json',
      JSON.stringify(getMerkleDataFromAllowlistArray(communityList), null, 2)
    )

    fs.writeFileSync(
      './data/results/merkleAllowlists/fans.json',
      JSON.stringify(getMerkleDataFromAllowlistArray(fansList), null, 2)
    )

    console.log(
      '[merkleLists] Generated files in the data/results/merkleAllowlists folder'
    )
  } catch (e) {
    console.error('[merkleLists] Main error : ', e)
  }
}

main()

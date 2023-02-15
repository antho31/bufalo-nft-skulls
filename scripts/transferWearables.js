require('dotenv').config()

const { ThirdwebSDK } = require('@thirdweb-dev/sdk')
const { DclWearableAbi } = require('../abis/DCL-ERC721CollectionV2.json')

const { DEPLOYER_PRIVATE_KEY, DEPLOYER_ADDRESS } = process.env

try {
  const sdk = ThirdwebSDK.fromPrivateKey(DEPLOYER_PRIVATE_KEY, 'polygon')

  // Bufalo BFL Genesis Hats https://polygonscan.com/token/0xfded171d346107c1d4eb20f37484e8dd65beac9b
  const contractAddress = '0xFdeD171D346107C1d4eB20F37484e8dD65BeaC9B'

  const contract = await sdk.getContractFromAbi(
    contractAddress,
    DclWearableAbi.abi
  )

  const res = await contract.call(
    'batchTransferFrom',
    DEPLOYER_ADDRESS,
    '0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA',
    [
      1610, 1611, 1612, 1613, 1614, 1615, 1616, 1617, 1618, 1619, 1620, 1621,
      1622, 1623, 1624, 1625, 1626, 1627, 1628, 1629, 1630, 1631, 1632, 1633,
      1634, 1635, 1636, 1637, 1638, 1639, 1640, 1641, 1642, 1643, 1644, 1645,
      1646, 1647, 1648, 1649, 1650, 1651, 1652, 1653, 1654, 1655, 1656, 1657,
      1658, 1659
    ]
  )
} catch (e) {
  console.error(e)
}

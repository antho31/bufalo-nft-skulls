require("dotenv").config();

const { ethers, network, run } = require("hardhat");
const { BigNumber } = ethers;
const fs = require("fs");

const bufaMerkle = require("../data/results/metadata/bufaRewardsMerkleData.json");
const privateListMerkle = require("../data/results/merkleAllowlists/community.json");
const discountListMerkle = require("../data/results/merkleAllowlists/fans.json");

const VRFCoordinatorV2ABI = require("@chainlink/contracts/abi/v0.8/VRFCoordinatorV2.json");
const DclERC721CollectionABI = require("../abis/DCL-ERC721CollectionV2.json");
const ERC721MockABI = require("../abis/ERC721Mock.json");

async function verify(name, address, constructorArguments = []) {
  try {
    await run(`verify:verify`, {
      address,
      constructorArguments
    });
    console.log(`${name} verified on Polygonscan`);
  } catch (e) {
    console.error(`Cannot verify ${name}`, e);
  }
}

async function main() {
  console.log(`Deploying contracts to ${network.name}...`);

  const [{ address: deployerAddress }] = await ethers.getSigners();

  const BUFADeployer = await ethers.getContractFactory("BUFAV1");
  const BUFAContract = await BUFADeployer.deploy();
  await BUFAContract.deployed();
  const BUFAContractAddress = BUFAContract.address;
  const MINTER_ROLE = await BUFAContract.MINTER_ROLE();
  console.log("BUFA contract deployed : ", BUFAContractAddress);

  const BOTV1Deployer = await ethers.getContractFactory("BOTV1");

  let deployBOTV1Args;
  let subscriptionId;
  if (network.name === "polygon") {
    /**
     * Chainlink infos
     */
    // 500 gwei keyHash = 0xcc294a196eeeb44da2888d17c0625cc88d70d9760a69d58d853ba6581a9ab0cd
    // callbackGasLimit = 100000
    subscriptionId = 651;

    deployBOTV1Args = {
      mintCurrency: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH https://polygonscan.com/token/0x7ceb23fd6bc0add59e62ac25578270cff1b9f619
      mintAmount: BigNumber.from("50000000000000000"), // 0.05, decimals = 18 ; 10 ** 18 = 1000000000000000000
      treasury: "0x0231339790F09B5F3d50a37D0dd82D66e82cA37D", // https://app.0xsplits.xyz/accounts/0x0231339790F09B5F3d50a37D0dd82D66e82cA37D/?chainId=137
      vrfCoordinator: "0xAE975071Be8F8eE67addBC1A82488F1C24858067", // https://docs.chain.link/vrf/v2/subscription/supported-networks/#polygon-matic-mainnet
      wearablesAddresses: [
        "0xdf60e4f253003b01f8c6863a996b080d0a9f03de", // Bufalo Cowboy Trench Coat [301,1600] https://polygonscan.com/token/0xdf60e4f253003b01f8c6863a996b080d0a9f03de?a=0x0b83e83f1ec0ee09191fab0ec10dd362ba0b29df
        "0xfded171d346107c1d4eb20f37484e8dd65beac9b", // Bufalo BFL Genesis Hats [510,1659] https://polygonscan.com/token/0xfded171d346107c1d4eb20f37484e8dd65beac9b?a=0x0b83e83f1ec0ee09191fab0ec10dd362ba0b29df
        "0x78D37B7D47b3915685FA6c5E85A01E166296F95C" // Bufalo BOTV1 Crystal Skull [11,1000]
      ],
      wearablesTokenIdsOffset: [302, 511, 1],
      BUFAContractAddress,
      rewardsMerkleRoot: bufaMerkle.root,
      discountListMerkleRoot: discountListMerkle.root,
      privateListMerkleRoot: privateListMerkle.root
    };
  } else if (network.name === "mumbai") {
    /**
     * Chainlink infos
     */
    // keyHash = 0x4b09e658ed251bcafeebbc69400383d49f344ace09b9576fe248bb02c003fe9f
    // callbackGasLimit = 100000
    subscriptionId = 3447;

    deployBOTV1Args = {
      mintCurrency: "0xfe4F5145f6e09952a5ba9e956ED0C25e3Fa4c7F1", // Dummy ERC20 https://mumbai.polygonscan.com/token/0xfe4f5145f6e09952a5ba9e956ed0c25e3fa4c7f1?a=0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA
      mintAmount: BigNumber.from("50000000000000000"), // 0.05, decimals = 18 ; 10 ** 18 = 1000000000000000000
      treasury: "0x376A21fAEAd5603A0912A220D030A97358c7AC25", // https://app.0xsplits.xyz/accounts/0x376A21fAEAd5603A0912A220D030A97358c7AC25/?chainId=80001
      vrfCoordinator: "0x7a1BaC17Ccc5b313516C5E16fb24f7659aA5ebed", // https://docs.chain.link/vrf/v2/subscription/supported-networks/#polygon-matic-mumbai-testnet
      wearablesAddresses: [
        "0x3dE583b9f7b3d1B9893D1918b6227b8656664FEc",
        "0xe869b6A81210444e297543e5c887635B3Ca521Eb",
        "0xdA7C3feea17D1AeDd01fa4131D62084C958bE26E"
      ],
      wearablesTokenIdsOffset: [307, 516, 6],
      BUFAContractAddress,
      rewardsMerkleRoot: bufaMerkle.root,
      discountListMerkleRoot: discountListMerkle.root,
      privateListMerkleRoot: privateListMerkle.root
    };
  } else {
    throw new Error('No valid network. Should be "mumbai" or "polygon"');
  }

  const vrfCoordinatorV2 = await ethers.getContractAt(
    VRFCoordinatorV2ABI,
    deployBOTV1Args.vrfCoordinator
  );

  const deployBOTV1ArgsArray = Object.keys(deployBOTV1Args).map(
    (i) => deployBOTV1Args[i]
  );

  const BOTV1Contract = await BOTV1Deployer.deploy(...deployBOTV1ArgsArray);
  await BOTV1Contract.deployed();
  const BOTV1ContractAddress = BOTV1Contract.address;
  console.log("BOTV1 Skulls collection deployed to:", BOTV1Contract.address);

  await vrfCoordinatorV2.addConsumer(subscriptionId, BOTV1ContractAddress);
  console.log("Added as consumer on Chainlink");

  await BUFAContract.grantRole(MINTER_ROLE, BOTV1ContractAddress);
  console.log("Minter role for BUFA OK");

  // @TODO
  // deploy Music NFT contract
  // verify music nft contracts

  console.log("Ready to verify BUFA & BOTV1");

  await verify("BUFA", BUFAContractAddress);
  await verify("BOTV1", BOTV1ContractAddress, deployBOTV1ArgsArray);

  fs.writeFileSync(
    `./data/results/deployment/${network.name}.json`,
    JSON.stringify(
      {
        BOTV1ContractAddress,
        BUFAContractAddress,
        CurrencyAddress: deployBOTV1Args.mintCurrency
      },
      null,
      2
    )
  );

  const abiForApproval =
    network.name === "polygon" ? DclERC721CollectionABI : ERC721MockABI;
  for (let addr of deployBOTV1Args.wearablesAddresses) {
    const ERC721CollectionV2 = await ethers.getContractAt(abiForApproval, addr);
    await ERC721CollectionV2.setApprovalForAll(BOTV1ContractAddress, true);
  }
  console.log("Set approvals OK");

  console.log("Deploy OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

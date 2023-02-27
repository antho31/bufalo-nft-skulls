require("dotenv").config();

const { ethers, network, run } = require("hardhat");
const { BigNumber } = ethers;
const fs = require("fs");

const privateListMerkle = require("../data/results/merkleAllowlists/community.json");
const discountListMerkle = require("../data/results/merkleAllowlists/fans.json");

const VRFCoordinatorV2ABI = require("@chainlink/contracts/abi/v0.8/VRFCoordinatorV2.json");

const MAX_SUPPLY = 5;

async function deployFakeERC721(address) {
  const ERC721MockDeployer = await ethers.getContractFactory("ERC721Mock");
  const AirdropTokensContract1 = await ERC721MockDeployer.deploy(
    "AirdropTokensContract1",
    "A1"
  );
  const ACOffset1 = 301;
  let tx = await AirdropTokensContract1.mint(address, ACOffset1, MAX_SUPPLY);
  await tx.wait();
  const AirdropTokensContract2 = await ERC721MockDeployer.deploy(
    "AirdropTokensContract2",
    "A2"
  );
  const ACOffset2 = 510;
  tx = await AirdropTokensContract2.mint(address, ACOffset2, MAX_SUPPLY);
  await tx.wait();
  const AirdropTokensContract3 = await ERC721MockDeployer.deploy(
    "AirdropTokensContract3",
    "A3"
  );
  const ACOffset3 = 0;
  tx = await AirdropTokensContract3.mint(address, ACOffset3, MAX_SUPPLY);
  await tx.wait();

  const wearablesContracts = [
    AirdropTokensContract1,
    AirdropTokensContract2,
    AirdropTokensContract3
  ];
  const wearablesAddresses = wearablesContracts.map((c) => c.address);
  const wearablesTokenIdsOffset = [ACOffset1, ACOffset2, ACOffset3];

  return { wearablesAddresses, wearablesTokenIdsOffset };
}

async function main() {
  console.log(`Deploying BOTV to ${network.name}...`);

  const [{ address: deployerAddress }] = await ethers.getSigners();

  const BOTVDeployer = await ethers.getContractFactory("BOTV");

  let deployBOTVArgs;
  let subscriptionId;
  if (network.name === "polygon") {
    subscriptionId = 651;
    deployBOTVArgs = {
      mintCurrency: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH https://polygonscan.com/token/0x7ceb23fd6bc0add59e62ac25578270cff1b9f619
      mintAmount: BigNumber.from("50000000000000000"), // 0.05, decimals = 18 ; 10 ** 18 = 1000000000000000000
      treasury: "0x0231339790F09B5F3d50a37D0dd82D66e82cA37D", // https://app.0xsplits.xyz/accounts/0x0231339790F09B5F3d50a37D0dd82D66e82cA37D/?chainId=137
      vrfCoordinator: "0xAE975071Be8F8eE67addBC1A82488F1C24858067", // https://docs.chain.link/vrf/v2/subscription/supported-networks/#polygon-matic-mainnet
      wearablesAddresses: [
        "0xdf60e4f253003b01f8c6863a996b080d0a9f03de", // Bufalo Cowboy Trench Coat [301,1600] https://polygonscan.com/token/0xdf60e4f253003b01f8c6863a996b080d0a9f03de?a=0x0b83e83f1ec0ee09191fab0ec10dd362ba0b29df
        "0xfded171d346107c1d4eb20f37484e8dd65beac9b" // Bufalo BFL Genesis Hats [510,1659] https://polygonscan.com/token/0xfded171d346107c1d4eb20f37484e8dd65beac9b?a=0x0b83e83f1ec0ee09191fab0ec10dd362ba0b29df
        // @todo skull wearable
      ],
      wearablesTokenIdsOffset: [301, 510],
      discountListMerkleRoot: discountListMerkle.root,
      privateListMerkleRoot: privateListMerkle.root
    };
  } else if (network.name === "mumbai") {
    subscriptionId = 3447;
    const { wearablesAddresses, wearablesTokenIdsOffset } =
      await deployFakeERC721(deployerAddress);

    deployBOTVArgs = {
      mintCurrency: "0xfe4F5145f6e09952a5ba9e956ED0C25e3Fa4c7F1", // Dummy ERC20 https://mumbai.polygonscan.com/token/0xfe4f5145f6e09952a5ba9e956ed0c25e3fa4c7f1?a=0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA
      mintAmount: BigNumber.from("50000000000000000"), // 0.05, decimals = 18 ; 10 ** 18 = 1000000000000000000
      treasury: "0x376A21fAEAd5603A0912A220D030A97358c7AC25", // https://app.0xsplits.xyz/accounts/0x376A21fAEAd5603A0912A220D030A97358c7AC25/?chainId=80001
      vrfCoordinator: "0x7a1BaC17Ccc5b313516C5E16fb24f7659aA5ebed", // https://docs.chain.link/vrf/v2/subscription/supported-networks/#polygon-matic-mumbai-testnet
      wearablesAddresses,
      wearablesTokenIdsOffset,
      discountListMerkleRoot: discountListMerkle.root,
      privateListMerkleRoot: privateListMerkle.root
    };
  } else {
    throw new Error('No valid network. Should be "mumbai" or "polygon"');
  }

  const vrfCoordinatorV2 = await ethers.getContractAt(
    VRFCoordinatorV2ABI,
    deployBOTVArgs.vrfCoordinator
  );

  deployBOTVArgs = Object.keys(deployBOTVArgs).map((i) => deployBOTVArgs[i]);
  const BOTVContract = await BOTVDeployer.deploy(...deployBOTVArgs);
  await BOTVContract.deployed();
  const BOTVContractAddress = BOTVContract.address;
  console.log("BOTV Skulls collection deployed to:", BOTVContract.address);

  await vrfCoordinatorV2.addConsumer(subscriptionId, BOTVContractAddress);

  console.log("Added as consiumer on Chainlink. To be verified on Polygonscan");

  await run(`verify:verify`, {
    address: BOTVContractAddress,
    constructorArguments: deployBOTVArgs
  });
  console.log("BOTV Skulls collection verified on Polygonscan");

  // @TODO
  //  - set approuval for all wearables --> nftContractAddress.setApprovalForAll(BOTVContractAddress,   true  )
  // - deploy BUFA contract
  // - deploy Music NFT contract
  // - deploy staking contract
  // verify all contracts !

  fs.writeFileSync(
    `./data/results/deployment/${network.name}`,
    JSON.stringify({ BOTVContractAddress }, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

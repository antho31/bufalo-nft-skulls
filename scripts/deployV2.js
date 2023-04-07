require("dotenv").config();

const { ethers, network, run } = require("hardhat");
const { BigNumber } = ethers;
const fs = require("fs");

const bufaMerkle = require("../data/results/metadata/bufaRewardsMerkleData.json");
const privateListMerkle = require("../data/results/merkleAllowlists/community.json");
const discountListMerkle = require("../data/results/merkleAllowlists/fans.json");

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

  const BUFADeployer = await ethers.getContractFactory("BUFA");
  const BUFAContract = await BUFADeployer.deploy();
  await BUFAContract.deployed();
  const BUFAContractAddress = BUFAContract.address;
  const MINTER_ROLE = await BUFAContract.MINTER_ROLE();
  console.log("BUFA contract deployed : ", BUFAContractAddress);

  const BOTVDeployer = await ethers.getContractFactory("BOTV2");

  let deployBOTVArgs;
  if (network.name === "polygon") {
    deployBOTVArgs = {
      mintCurrency: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH https://polygonscan.com/token/0x7ceb23fd6bc0add59e62ac25578270cff1b9f619
      mintAmount: BigNumber.from("50000000000000000"), // 0.05, decimals = 18 ; 10 ** 18 = 1000000000000000000
      treasury: "0x0231339790F09B5F3d50a37D0dd82D66e82cA37D", // https://app.0xsplits.xyz/accounts/0x0231339790F09B5F3d50a37D0dd82D66e82cA37D/?chainId=137
      wearablesAddresses: [
        "0xdf60e4f253003b01f8c6863a996b080d0a9f03de", // Bufalo Cowboy Trench Coat [301,1600] https://polygonscan.com/token/0xdf60e4f253003b01f8c6863a996b080d0a9f03de?a=0x0b83e83f1ec0ee09191fab0ec10dd362ba0b29df
        "0xfded171d346107c1d4eb20f37484e8dd65beac9b", // Bufalo BFL Genesis Hats [510,1659] https://polygonscan.com/token/0xfded171d346107c1d4eb20f37484e8dd65beac9b?a=0x0b83e83f1ec0ee09191fab0ec10dd362ba0b29df
        "0x78D37B7D47b3915685FA6c5E85A01E166296F95C" // Bufalo BOTV Crystal Skull [11,1000]
      ],
      wearablesTokenIdsOffset: [384, 593, 83],
      BUFAContractAddress,
      rewardsMerkleRoot: bufaMerkle.root,
      discountListMerkleRoot: discountListMerkle.root,
      privateListMerkleRoot: privateListMerkle.root,
      botv1Contract: "0x1D6F8ff4c5A4588DC95C8E1913E53a5007ad5378"
    };
  } else if (network.name === "mumbai") {
    deployBOTVArgs = {
      mintCurrency: "0xfe4F5145f6e09952a5ba9e956ED0C25e3Fa4c7F1", // Dummy ERC20 https://mumbai.polygonscan.com/token/0xfe4f5145f6e09952a5ba9e956ed0c25e3fa4c7f1?a=0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA
      mintAmount: BigNumber.from("50000000000000000"), // 0.05, decimals = 18 ; 10 ** 18 = 1000000000000000000
      treasury: "0x376A21fAEAd5603A0912A220D030A97358c7AC25", // https://app.0xsplits.xyz/accounts/0x376A21fAEAd5603A0912A220D030A97358c7AC25/?chainId=80001
      wearablesAddresses: [
        "0x3dE583b9f7b3d1B9893D1918b6227b8656664FEc",
        "0xe869b6A81210444e297543e5c887635B3Ca521Eb",
        "0xdA7C3feea17D1AeDd01fa4131D62084C958bE26E"
      ],
      wearablesTokenIdsOffset: [314, 523, 13],
      BUFAContractAddress,
      rewardsMerkleRoot: bufaMerkle.root,
      discountListMerkleRoot: discountListMerkle.root,
      privateListMerkleRoot: privateListMerkle.root,
      botv1Contract: "0x811b8A53B41435A8FE92267C454e59a74135bBDb"
    };
  } else {
    throw new Error('No valid network. Should be "mumbai" or "polygon"');
  }

  const deployBOTVArgsArray = Object.keys(deployBOTVArgs).map(
    (i) => deployBOTVArgs[i]
  );

  const BOTVContract = await BOTVDeployer.deploy(...deployBOTVArgsArray);
  await BOTVContract.deployed();
  const BOTVContractAddress = BOTVContract.address;
  console.log("BOTV Skulls collection deployed to:", BOTVContract.address);

  await BUFAContract.grantRole(MINTER_ROLE, BOTVContractAddress);
  console.log("Minter role for BUFA OK");

  console.log("Ready to verify BUFA & BOTV");

  await verify("BUFA", BUFAContractAddress);
  await verify("BOTV", BOTVContractAddress, deployBOTVArgsArray);

  fs.writeFileSync(
    `./data/results/deployment/${network.name}.json`,
    JSON.stringify(
      {
        BOTVContractAddress,
        BUFAContractAddress,
        CurrencyAddress: deployBOTVArgs.mintCurrency
      },
      null,
      2
    )
  );

  const abiForApproval =
    network.name === "polygon" ? DclERC721CollectionABI : ERC721MockABI;
  for (let addr of deployBOTVArgs.wearablesAddresses) {
    const ERC721CollectionV2 = await ethers.getContractAt(abiForApproval, addr);
    await ERC721CollectionV2.setApprovalForAll(BOTVContractAddress, true);
  }
  console.log("Set approvals OK");

  console.log("Deploy OK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

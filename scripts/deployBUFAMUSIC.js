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
  console.log(`Deploying BUFA MUSIC contracts to ${network.name}...`);

  if (network.name === "mumbai") {
    const trustedFwder = "0xc82BbE41f2cF04e3a8efA18F7032BDD7f6d98a81";
    const botvContractAddress = "0xEC6a14E246E5c3e59Bd9D4574cb98759A962172D";
    const bufaContractAddress = "0x7E440A8bA78F7D78c7aF52A88DF5383675Fb5dA7";

    const BUFADeployer = await ethers.getContractFactory("BUFA");
    const BUFA = await BUFADeployer.attach(bufaContractAddress);

    const BURNER_ROLE = await BUFA.SPENDER_ROLE();

    const BUFAMUSICDeployer = await ethers.getContractFactory("BUFAMUSIC");
    const BUFAMUSIC = await BUFAMUSICDeployer.deploy(
      botvContractAddress,
      bufaContractAddress,
      trustedFwder
    );
    await BUFAMUSIC.deployed();

    console.log("BUFA MUSIC contract deployed : ", BUFAMUSIC.address);

    await BUFA.grantRole(BURNER_ROLE, BUFAMUSIC.address);

    console.log("Role granted");

    console.log("Ready to verify BUFAMUSIC");

    await verify("BUFAMUSIC", BUFAMUSIC.address, [
      botvContractAddress,
      bufaContractAddress,
      trustedFwder
    ]);

    console.log("Deploy OK");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// 0x26488781e916bc31e916a99FD94A9ccE42E8618E

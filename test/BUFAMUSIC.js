require("dotenv").config();

const { DEPLOYER_ADDRESS } = process.env;

const {
  loadFixture,
  time
} = require("@nomicfoundation/hardhat-network-helpers");
const {
  constants: { ZERO_ADDRESS }
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { BigNumber } = require("ethers");
const {
  formatBytes32String,
  parseEther,
  parseUnits
} = require("ethers/lib/utils");
const { ethers, network } = require("hardhat");
const superagent = require("superagent");

const { getMerkleDataFromAllowlistArray } = require("../utils/merkle");

const bufaMerkle = require("../data/results/metadata/bufaRewardsMerkleData.json");

describe("BUFAMUSIC", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function initFixture() {
    const signers = await ethers.getSigners();

    const [deployer] = signers;

    const trustedFwder = "0xc82BbE41f2cF04e3a8efA18F7032BDD7f6d98a81";

    const botv1ContractAddress = "0x1D6F8ff4c5A4588DC95C8E1913E53a5007ad5378";

    const bufav1ContractAddress = "0x9Cca62CF7360e143bD2E25c64742C5d8B7AB2a14";
    const BUFADeployer = await ethers.getContractFactory("BUFAV1");
    const BUFA = await BUFADeployer.attach(bufav1ContractAddress);

    const BURNER_ROLE = await BUFA.BURNER_ROLE();

    const BUFAMUSICDeployer = await ethers.getContractFactory("BUFAMUSIC");
    const BUFAMUSIC = await BUFAMUSICDeployer.deploy(
      botv1ContractAddress,
      bufav1ContractAddress,
      trustedFwder
    );

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DEPLOYER_ADDRESS]
    });
    const deployerSigner = await ethers.getSigner(DEPLOYER_ADDRESS);

    await deployer.send;

    let tx = await BUFA.connect(deployerSigner).grantRole(
      BURNER_ROLE,
      BUFAMUSIC.address
    );
    await tx.wait();

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: ["0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA"]
    });
    const userSigner = await ethers.getSigner(
      "0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA"
    );

    const metadataOffset = 78;

    return {
      deployer,

      deployerSigner,
      userSigner,

      BUFA,
      BUFAMUSIC,
      metadataOffset
    };
  }

  describe("Deployment", async function () {
    it("Should mint  ", async function () {
      const {
        deployer,

        deployerSigner,
        userSigner,

        BUFA,
        BUFAMUSIC,
        metadataOffset
      } = await loadFixture(initFixture);
      const botvTokenIds = [0];

      const { bufaPerDay, merkleProofs } = bufaMerkle[metadataOffset];

      await BUFAMUSIC.connect(userSigner).claimAndMintWithBufaTokens(
        0,
        1,
        botvTokenIds,
        [bufaPerDay],
        [merkleProofs]
      );
    });
  });
});

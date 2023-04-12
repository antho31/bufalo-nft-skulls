require("dotenv").config();

const { DEPLOYER_ADDRESS, DATOCMS_API_KEY } = process.env;

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

    const BOTVContractAddress = "0x1B9d577486D7AF13570F0d521cDDEc083D9F7e14";
    const BUFAContractAddress = "0x6a9D0b634AB078E8F26Fb70baE77CBAD9840FfC2";

    const BUFADeployer = await ethers.getContractFactory("BUFA");
    const BUFA = await BUFADeployer.attach(BUFAContractAddress);
    const BURNER_ROLE = await BUFA.SPENDER_ROLE();

    const BUFAMUSICDeployer = await ethers.getContractFactory("BUFAMUSIC");
    const BUFAMUSIC = await BUFAMUSICDeployer.deploy(
      BOTVContractAddress,
      BUFAContractAddress,
      trustedFwder
    );

    const tokenId = "103141286";
    const title = "Bufalo - Saddle Up - BOTV Skull Staking 1";
    const iswc = "T-316.218.353.7";
    const supply = 50;
    const bufaPriceInt = 9;
    const bufaPrice = parseUnits(bufaPriceInt.toString(), "ether");
    const mintActive = true;
    const tokenActive = true;

    await BUFAMUSIC.updateTokenParameter(
      tokenId,
      title,
      iswc,
      supply,
      bufaPrice,
      mintActive,
      tokenActive
    );

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DEPLOYER_ADDRESS]
    });
    const deployerSigner = await ethers.getSigner(DEPLOYER_ADDRESS);

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

      metadataOffset,

      tokenId,
      title,
      iswc,
      supply,
      bufaPrice,
      mintActive,
      tokenActive
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
        metadataOffset,

        tokenId
      } = await loadFixture(initFixture);
      const botvTokenIds = [0];

      const { bufaPerDay, merkleProofs } = bufaMerkle[metadataOffset];

      await BUFAMUSIC.connect(userSigner).claimAndMintWithBufaTokens(
        tokenId,
        1,
        botvTokenIds,
        [bufaPerDay],
        [merkleProofs]
      );
    });

    it("Should be the correct uri", async function () {
      const {
        BUFAMUSIC,

        tokenId
      } = await loadFixture(initFixture);
      console.log("uri : ", await BUFAMUSIC.uri(tokenId));
    });

    it("Should be the correct price", async function () {
      const {
        BUFAMUSIC,

        tokenId
      } = await loadFixture(initFixture);
      console.log(
        "token parameters : ",
        await BUFAMUSIC.tokenParameters(tokenId)
      );
    });
  });
});

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

const DclERC721CollectionABI = require("../abis/DCL-ERC721CollectionV2.json");

const MAX_SUPPLY = 1000;
const MINT_LIMIT_PER_WALLET = 10;

const MINT_TREASURY = "0x3C0dABC82bf51d1bf994a54E70e7a7d19865f950";

describe("BOTV2", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function initFixture() {
    const signers = await ethers.getSigners();

    const [
      deployer,
      treasury,
      publicUser1,
      publicUser2,
      publicUser3,
      privateUser1,
      privateUser2,
      privateUser3,
      discountUser1,
      discountUser2,
      discountPrivateUser
    ] = signers;

    const ERC20Amount = BigNumber.from("100");
    const ERC20MockDeployer = await ethers.getContractFactory("ERC20Mock");
    const ERC20Mock = await ERC20MockDeployer.deploy();
    let tx;
    for (let { address } of signers) {
      tx = await ERC20Mock.mint(
        address,
        BigNumber.from(ERC20Amount).mul(MINT_LIMIT_PER_WALLET)
      );
      await tx.wait();
    }

    const botv1ContractAddress = "0x1D6F8ff4c5A4588DC95C8E1913E53a5007ad5378";

    const BUFADeployer = await ethers.getContractFactory("BUFA");
    const BUFA = await BUFADeployer.deploy(
      "0xf0511f123164602042ab2bCF02111fA5D3Fe97CD"
    );
    const BUFAdecimals = await BUFA.decimals();
    const BUFAUnits = parseUnits("1", BUFAdecimals);
    const MINTER_ROLE = await BUFA.MINTER_ROLE();

    const wearablesContracts = await Promise.all([
      ethers.getContractAt(
        DclERC721CollectionABI,
        "0xdf60e4f253003b01f8c6863a996b080d0a9f03de"
      ),
      ethers.getContractAt(
        DclERC721CollectionABI,
        "0xfded171d346107c1d4eb20f37484e8dd65beac9b"
      ),
      ethers.getContractAt(
        DclERC721CollectionABI,
        "0x78D37B7D47b3915685FA6c5E85A01E166296F95C"
      )
    ]);
    const wearablesAddresses = wearablesContracts.map((c) => c.address);
    const wearablesTokenIdsOffset = [384, 593, 83];

    const discountListMerkle = getMerkleDataFromAllowlistArray([
      discountUser1.address,
      discountUser2.address,
      discountPrivateUser.address
    ]);
    const discountListMerkleRoot = discountListMerkle.root;
    const discountMerkleProof = (addr) =>
      discountListMerkle[addr.toLocaleLowerCase()]
        ? discountListMerkle[addr.toLocaleLowerCase()]
        : [];

    const privateListMerkle = getMerkleDataFromAllowlistArray([
      privateUser1.address,
      privateUser2.address,
      privateUser3.address,
      discountPrivateUser.address
    ]);
    const privateListMerkleProof = (addr) =>
      privateListMerkle[addr.toLocaleLowerCase()]
        ? privateListMerkle[addr.toLocaleLowerCase()]
        : [];
    const privateListMerkleRoot = privateListMerkle.root;

    const BOTV2Deployer = await ethers.getContractFactory("BOTV2");
    const BOTV2 = await BOTV2Deployer.deploy(
      ERC20Mock.address,
      ERC20Amount,
      treasury.address,
      wearablesAddresses,
      wearablesTokenIdsOffset,
      BUFA.address,
      bufaMerkle.root,
      discountListMerkleRoot,
      privateListMerkleRoot,
      botv1ContractAddress
    );

    await BOTV2.setWearableOwner(DEPLOYER_ADDRESS);

    tx = await BUFA.grantRole(MINTER_ROLE, BOTV2.address);

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DEPLOYER_ADDRESS]
    });
    const deployerSigner = await ethers.getSigner(DEPLOYER_ADDRESS);

    for (let wearableContract of wearablesContracts) {
      tx = await wearableContract
        .connect(deployerSigner)
        .setApprovalForAll(BOTV2.address, true);
      await tx.wait();
    }

    tx = await ERC20Mock.connect(publicUser1).approve(
      BOTV2.address,
      BigNumber.from(ERC20Amount).mul(MAX_SUPPLY)
    );
    await tx.wait();

    return {
      deployer,
      treasury,
      publicUser1,
      publicUser2,
      publicUser3,
      privateUser1,
      privateUser2,
      privateUser3,
      discountUser1,
      discountUser2,
      discountPrivateUser,

      deployerSigner,

      ERC20Amount,

      ERC20MockDeployer,
      ERC20Mock,

      wearablesContracts,
      wearablesAddresses,
      wearablesTokenIdsOffset,

      discountListMerkle,
      discountListMerkleRoot,
      discountMerkleProof,
      privateListMerkle,
      privateListMerkleRoot,
      privateListMerkleProof,

      BUFA,
      BOTV2,
      BOTV2Deployer,

      BUFAUnits,
      MINTER_ROLE,

      botv1ContractAddress
    };
  }

  async function activeSaleFixture() {
    const { BOTV2, ...others } = await initFixture();

    let tx = await BOTV2.setPublicSale(true);
    await tx.wait();

    return { BOTV2, ...others };
  }

  async function afterOneSaleFixture() {
    const { BOTV2, publicUser1, ERC20Mock, ...others } =
      await activeSaleFixture();

    const quantity = 5;
    let tx = await BOTV2.connect(publicUser1).mint(
      publicUser1.address,
      quantity,
      ERC20Mock.address,
      [],
      []
    );
    await tx.wait();

    return { quantity, BOTV2, publicUser1, ERC20Mock, ...others };
  }

  async function onceRevealed() {
    const { BOTV2, ...others } = await loadFixture(afterOneSaleFixture);

    const tokenIds = [0, 1, 2, 3, 4]; // quantity = 5
    // metadataIds = [78,79,80,81,82]
    // bufaRewardsPerDay = [100,50,100,50,150] => 450 for increaseTime = 86400 (1 day)

    const metadataIdsBN = await BOTV2.getMetadataIdsForTokens(tokenIds);
    const metadataIds = metadataIdsBN.map((m) => `${m}`);
    const bufaPerDay = metadataIds.map((m) => bufaMerkle[m].bufaPerDay);
    const merkleProofs = metadataIds.map((m) => bufaMerkle[m].merkleProofs);

    const increasedTime = 86400;

    await time.increase(increasedTime);

    return {
      tokenIds,
      metadataIds,
      bufaPerDay,
      merkleProofs,
      increasedTime,
      BOTV2,
      ...others
    };
  }

  describe("Deployment", async function () {
    it("Should support ERC4907, ERC2981 and ERC721 interfaces", async function () {
      const { BOTV2 } = await loadFixture(initFixture);

      const supportsDummy = await BOTV2.supportsInterface("0x80ac58cf");
      const supportsERC1555 = await BOTV2.supportsInterface("0x4e2312e0");
      const supportsERC165 = await BOTV2.supportsInterface("0x01ffc9a7");
      const supportsERC20 = await BOTV2.supportsInterface("0x36372b07");
      const supportsERC2981 = await BOTV2.supportsInterface("0x2a55205a");
      const supportsERC4907 = await BOTV2.supportsInterface("0xad092b5c");
      const supportsERC721 = await BOTV2.supportsInterface("0x80ac58cd");

      const supportsERC721Metadata = await BOTV2.supportsInterface(
        "0x5b5e139f"
      );

      expect(supportsDummy).to.equal(false);
      expect(supportsERC1555).to.equal(false);
      expect(supportsERC165).to.equal(true);
      expect(supportsERC20).to.equal(false);
      expect(supportsERC2981).to.equal(true);
      expect(supportsERC4907).to.equal(true);
      expect(supportsERC721).to.equal(true);
      expect(supportsERC721Metadata).to.equal(true);
    });

    it("Should fail if invalid arguments are provided in constructor", async function () {
      const {
        deployer,
        treasury,
        ERC20Amount,

        ERC20Mock,

        wearablesAddresses,
        wearablesTokenIdsOffset,
        discountListMerkleRoot,
        privateListMerkleRoot,

        BUFA,
        BOTV2,
        BOTV2Deployer,

        botv1ContractAddress
      } = await loadFixture(initFixture);

      await expect(
        BOTV2Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          ZERO_ADDRESS,
          wearablesAddresses,
          wearablesTokenIdsOffset,
          BUFA.address,
          bufaMerkle.root,
          discountListMerkleRoot,
          privateListMerkleRoot,
          botv1ContractAddress
        )
      ).to.be.revertedWithCustomError(BOTV2, "CannotBeZeroAddress");

      await expect(
        BOTV2Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          wearablesAddresses,
          wearablesTokenIdsOffset,
          ZERO_ADDRESS,
          bufaMerkle.root,
          discountListMerkleRoot,
          privateListMerkleRoot,
          botv1ContractAddress
        )
      ).to.be.revertedWithCustomError(BOTV2, "CannotBeZeroAddress");

      await expect(
        BOTV2Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          [deployer.address, ...wearablesAddresses],
          wearablesTokenIdsOffset,
          BUFA.address,
          bufaMerkle.root,
          discountListMerkleRoot,
          privateListMerkleRoot,
          botv1ContractAddress
        )
      ).to.be.revertedWithCustomError(BOTV2, "IncompleteAirdropParameter");

      const wearablesAddresses2 = [...wearablesAddresses];
      wearablesAddresses2[0] = ZERO_ADDRESS;
      await expect(
        BOTV2Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          wearablesAddresses2,
          wearablesTokenIdsOffset,
          BUFA.address,
          bufaMerkle.root,
          discountListMerkleRoot,
          privateListMerkleRoot,
          botv1ContractAddress
        )
      ).to.be.revertedWithCustomError(BOTV2, "InvalidAirdropParameter");

      await expect(
        BOTV2Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          wearablesAddresses,
          wearablesTokenIdsOffset,
          BUFA.address,
          formatBytes32String(""),
          discountListMerkleRoot,
          privateListMerkleRoot,
          botv1ContractAddress
        )
      ).to.be.revertedWithCustomError(BOTV2, "InvalidMerkleRoot");

      await expect(
        BOTV2Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          wearablesAddresses,
          wearablesTokenIdsOffset,
          BUFA.address,
          bufaMerkle.root,
          formatBytes32String(""),
          privateListMerkleRoot,
          botv1ContractAddress
        )
      ).to.be.revertedWithCustomError(BOTV2, "InvalidMerkleRoot");

      await expect(
        BOTV2Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          wearablesAddresses,
          wearablesTokenIdsOffset,
          BUFA.address,
          bufaMerkle.root,
          discountListMerkleRoot,
          formatBytes32String(""),
          botv1ContractAddress
        )
      ).to.be.revertedWithCustomError(BOTV2, "InvalidMerkleRoot");

      await expect(
        BOTV2Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          wearablesAddresses,
          wearablesTokenIdsOffset,
          BUFA.address,
          bufaMerkle.root,
          discountListMerkleRoot,
          privateListMerkleRoot,
          ZERO_ADDRESS
        )
      ).to.be.revertedWithCustomError(BOTV2, "CannotBeZeroAddress");
    });
  });

  describe("Minting", async function () {
    describe("Mint by contract owner", async function () {
      it("Should mint for free as expected", async function () {
        const {
          deployer,
          publicUser1,
          publicUser2,
          publicUser3,

          BOTV2
        } = await loadFixture(initFixture);

        const totalQty = 10;

        const totalSupply = await BOTV2.totalSupply();

        await expect(
          BOTV2.mintForFree(
            [publicUser1.address, publicUser2.address, publicUser3.address],

            [1, 8, 1]
          )
        ).to.changeTokenBalances(
          BOTV2,

          [publicUser1.address, publicUser2.address, publicUser3.address],

          [1, 8, 1]
        );

        expect(await BOTV2.totalSupply()).to.be.equal(
          totalSupply.add(totalQty)
        );

        await expect(
          BOTV2.mintForFree(
            [publicUser1.address, publicUser2.address, publicUser3.address],

            [1, 8, 1]
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(publicUser2.address, 8, 0, ZERO_ADDRESS, deployer.address);
      });

      /*
      it("Should reject if max supply exceed", async function () {
        const {
          publicUser1,
          publicUser2,
          publicUser3,

          BOTV2
        } = await loadFixture(initFixture);

        for (let i = 0; i < 9; i++) {
          await expect(
            BOTV2.mintForFree([publicUser1.address], [100])
          ).to.changeTokenBalances(BOTV2, [publicUser1.address], [100]);
        }

        await expect(
          BOTV2.mintForFree(
            [publicUser1.address],

            [97]
          )
        ).to.changeTokenBalances(BOTV2, [publicUser1.address], [97]);

        await expect(
          BOTV2.mintForFree(
            [publicUser1.address, publicUser2.address, publicUser3.address],

            [1, 2, 1]
          )
        ).to.revertedWithCustomError(BOTV2, "MaxSupplyExceeded");

        expect(await BOTV2.balanceOf(publicUser1.address)).to.be.equal(
          MAX_SUPPLY - 3
        );
      });

      it("Should reject if not same parameters length", async function () {
        const {
          publicUser1,
          publicUser2,
          publicUser3,

          BOTV2
        } = await loadFixture(initFixture);

        await expect(
          BOTV2.mintForFree(
            [publicUser1.address, publicUser2.address, publicUser3.address],

            [1, 2, 1, 2]
          )
        ).to.revertedWithCustomError(BOTV2, "InvalidMintParameters");
      });
*/

      it("Should reject if 0 as quantity provided", async function () {
        const {
          publicUser1,
          publicUser2,
          publicUser3,

          BOTV2
        } = await loadFixture(initFixture);

        await expect(
          BOTV2.mintForFree(
            [publicUser1.address, publicUser2.address, publicUser3.address],

            [1, 2, 0]
          )
        ).to.revertedWithCustomError(BOTV2, "InvalidMintParameters");
      });

      it("Should reject if no address provided", async function () {
        const { BOTV2 } = await loadFixture(initFixture);

        await expect(BOTV2.mintForFree([], [])).to.revertedWithCustomError(
          BOTV2,
          "InvalidMintParameters"
        );
      });

      it("Should reject if zero address provided", async function () {
        const { publicUser1, BOTV2 } = await loadFixture(initFixture);

        await expect(
          BOTV2.mintForFree(
            [publicUser1.address, ZERO_ADDRESS],

            [1, 2]
          )
        ).to.revertedWithCustomError(BOTV2, "CannotBeZeroAddress");

        expect(await BOTV2.balanceOf(publicUser1.address)).to.be.equal(0);
      });
    });

    describe("Public mint", async function () {
      it("Should mint as expected with ERC20 currency payment", async function () {
        const {
          publicUser1,
          publicUser2,
          publicUser3,
          ERC20Amount,
          ERC20Mock,
          wearablesContracts,
          BOTV2
        } = await loadFixture(activeSaleFixture);

        const quantity = 3;
        const price = BigNumber.from(ERC20Amount).mul(quantity);

        const nbOfMints = quantity * (3 + wearablesContracts.length);

        // should have more ERC20 to run all tests
        let tx = await ERC20Mock.mint(
          publicUser1.address,
          BigNumber.from(price).mul(nbOfMints).sub(MINT_LIMIT_PER_WALLET)
        );
        await tx.wait();

        const totalSupply = await BOTV2.totalSupply();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        ).to.changeTokenBalances(
          ERC20Mock,
          [publicUser1.address, MINT_TREASURY, publicUser2.address],
          [-price, price, 0]
        );

        expect(await BOTV2.totalSupply()).to.be.equal(
          totalSupply.add(quantity)
        );

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        ).to.changeTokenBalances(
          BOTV2,
          [publicUser1.address, MINT_TREASURY, publicUser2.address],
          [0, 0, quantity]
        );

        for (let wearableContract of wearablesContracts) {
          await expect(
            BOTV2.connect(publicUser1).mint(
              publicUser3.address,
              quantity,
              ERC20Mock.address,
              [],
              []
            )
          ).to.changeTokenBalances(
            wearableContract,
            [publicUser1.address, MINT_TREASURY, publicUser3.address],
            [0, 0, quantity]
          );
        }

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            BigNumber.from(ERC20Amount).mul(quantity),
            ERC20Mock.address,
            publicUser1.address
          );

        expect(await BOTV2.totalSupply()).to.be.equal(
          totalSupply.add(nbOfMints)
        );
      });

      it("Should mint as expected with native currency payment", async function () {
        const {
          publicUser1,
          publicUser2,
          publicUser3,
          wearablesContracts,
          BOTV2
        } = await loadFixture(activeSaleFixture);

        const etherAmount = "0.05";
        const amount = parseEther(etherAmount);
        const quantity = 3;
        const value = BigNumber.from(amount).mul(BigNumber.from(quantity));
        const etherValue = "0.15";

        let tx = await BOTV2.setPrice(ZERO_ADDRESS, true, amount);
        await tx.wait();

        const nbOfMints = quantity * (3 + wearablesContracts.length);

        const totalSupply = await BOTV2.totalSupply();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        ).to.changeEtherBalances(
          [publicUser1.address, MINT_TREASURY],
          [parseEther(`-${etherValue}`), value]
        );

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        ).to.changeTokenBalances(
          BOTV2,
          [publicUser1.address, MINT_TREASURY, publicUser2.address],
          [0, 0, quantity]
        );

        for (let wearableContract of wearablesContracts) {
          await expect(
            BOTV2.connect(publicUser1).mint(
              publicUser3.address,
              quantity,
              ZERO_ADDRESS,
              [],
              [],
              { value }
            )
          ).to.changeTokenBalances(
            wearableContract,
            [publicUser1.address, MINT_TREASURY, publicUser3.address],
            [0, 0, quantity]
          );
        }

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            value,
            ZERO_ADDRESS,
            publicUser1.address
          );

        expect(await BOTV2.totalSupply()).to.be.equal(
          totalSupply.add(nbOfMints)
        );
      });

      it("Should mint even if pricing is set as free", async function () {
        const { publicUser1, publicUser2, ERC20Mock, BOTV2 } =
          await loadFixture(activeSaleFixture);

        const value = 0;

        const quantity = 2;
        const totalSupply = await BOTV2.totalSupply();
        const nbOfMints = quantity * 4;

        let tx = await BOTV2.setPrice(ZERO_ADDRESS, true, value);
        await tx.wait();
        tx = await BOTV2.setPrice(ERC20Mock.address, true, 0);
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        ).to.changeTokenBalances(
          ERC20Mock,
          [publicUser1.address, MINT_TREASURY, publicUser2.address],
          [0, 0, 0]
        );

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            0,
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        ).to.changeEtherBalances([publicUser1.address, MINT_TREASURY], [0, 0]);

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            value,
            ZERO_ADDRESS,
            publicUser1.address
          );

        expect(await BOTV2.totalSupply()).to.be.equal(
          totalSupply.add(nbOfMints)
        );
      });

      it("Should revert if not enough available ERC20 amount to spend", async function () {
        const {
          publicUser1,
          publicUser2,

          ERC20Amount,
          ERC20Mock,
          BOTV2
        } = await loadFixture(activeSaleFixture);

        const totalSupply = await BOTV2.totalSupply();

        let tx = await ERC20Mock.connect(publicUser1).approve(BOTV2.address, 0);
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWith("ERC20: insufficient allowance");

        tx = await ERC20Mock.connect(publicUser1).approve(
          BOTV2.address,
          BigNumber.from(ERC20Amount).mul(2).mul(MAX_SUPPLY)
        );
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            publicUser2.address,
            1,
            ERC20Amount,
            ERC20Mock.address,
            publicUser1.address
          );

        tx = await BOTV2.setPrice(
          ERC20Mock.address,
          true,
          BigNumber.from(ERC20Amount).mul(MINT_LIMIT_PER_WALLET).add(1)
        );
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        expect(await BOTV2.totalSupply()).to.be.equal(totalSupply.add(1));
      });

      it("Should revert if msg.value is too low", async function () {
        const { publicUser1, publicUser2, BOTV2 } = await loadFixture(
          activeSaleFixture
        );

        const etherAmount = "0.05";
        const amount = parseEther(etherAmount);
        const quantity = 3;
        const value = BigNumber.from(amount).mul(quantity);

        let tx = await BOTV2.setPrice(ZERO_ADDRESS, true, amount);
        await tx.wait();

        const totalSupply = await BOTV2.totalSupply();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value: amount }
          )
        ).to.be.revertedWithCustomError(BOTV2, "AmountValueTooLow");

        const provider = ethers.provider;
        const balance = await provider.getBalance(publicUser1.address);

        tx = await BOTV2.setPrice(
          ZERO_ADDRESS,
          true,
          BigNumber.from(balance).add(1)
        );
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        ).to.be.revertedWithCustomError(BOTV2, "AmountValueTooLow");

        tx = await BOTV2.setPrice(ZERO_ADDRESS, true, amount);
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            value,
            ZERO_ADDRESS,
            publicUser1.address
          );
        expect(await BOTV2.totalSupply()).to.be.equal(
          totalSupply.add(quantity)
        );
      });

      it("Should revert if provided currency is not enabled", async function () {
        const { publicUser1, publicUser2, ERC20Amount, ERC20Mock, BOTV2 } =
          await loadFixture(activeSaleFixture);

        let tx = await BOTV2.setPrice(ERC20Mock.address, false, ERC20Amount);
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.be.revertedWithCustomError(BOTV2, "ForbiddenCurrency")
          .withArgs(ERC20Mock.address);

        ERC20Amount.add(1);

        await tx.wait();
        tx = await BOTV2.setPrice(ERC20Mock.address, true, ERC20Amount);
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            publicUser2.address,
            1,
            ERC20Amount,
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ZERO_ADDRESS,
            [],
            []
          )
        )
          .to.be.revertedWithCustomError(BOTV2, "ForbiddenCurrency")
          .withArgs(ZERO_ADDRESS);
      });

      it("Should revert if arguments are invalid", async function () {
        const {
          publicUser1,
          publicUser2,
          publicUser3,
          ERC20Amount,
          ERC20Mock,
          BOTV2
        } = await loadFixture(activeSaleFixture);

        let tx = await ERC20Mock.mint(
          publicUser1.address,
          BigNumber.from(ERC20Amount).mul(MINT_LIMIT_PER_WALLET).mul(2)
        );
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            ZERO_ADDRESS,
            1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWithCustomError(BOTV2, "CannotBeZeroAddress");

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ZERO_ADDRESS,
            [],
            []
          )
        )
          .to.be.revertedWithCustomError(BOTV2, "ForbiddenCurrency")
          .withArgs(ZERO_ADDRESS);

        const ERC20MockDeployer = await ethers.getContractFactory("ERC20Mock");
        const ERC20Mock2 = await ERC20MockDeployer.deploy();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock2.address,
            [],
            []
          )
        )
          .to.be.revertedWithCustomError(BOTV2, "ForbiddenCurrency")
          .withArgs(ERC20Mock2.address);

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            MINT_LIMIT_PER_WALLET + 1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWithCustomError(BOTV2, "TokenMintingLimitExceeded");

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            0,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.reverted; // revertedWithCustomError(ERC721A, "MintZeroQuantity");

        const quantity = MINT_LIMIT_PER_WALLET;

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            BigNumber.from(ERC20Amount).mul(quantity),
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWithCustomError(BOTV2, "TokenMintingLimitExceeded");

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser3.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            publicUser3.address,
            quantity,
            BigNumber.from(ERC20Amount).mul(quantity),
            ERC20Mock.address,
            publicUser1.address
          );
      });
      /*
      it("Should revert if number of tokens exceed MAX_SUPPLY value", async function () {
        const { publicUser1, ERC20Amount, ERC20Mock, BOTV2 } =
          await loadFixture(activeSaleFixture);
        let tx;

        tx = await ERC20Mock.mint(
          publicUser1.address,
          BigNumber.from(ERC20Amount).mul(MAX_SUPPLY)
        );
        await tx.wait();

        for (let i = 0; i < MAX_SUPPLY / MINT_LIMIT_PER_WALLET; i++) {
          // Get a new wallet
          const wallet = ethers.Wallet.createRandom();
          // add the provider from Hardhat
          const signer = wallet.connect(ethers.provider);

          await expect(
            BOTV2.connect(publicUser1).mint(
              signer.address,
              MINT_LIMIT_PER_WALLET,
              ERC20Mock.address,
              [],
              []
            )
          )
            .to.emit(BOTV2, "Mint")
            .withArgs(
              signer.address,
              MINT_LIMIT_PER_WALLET,
              BigNumber.from(ERC20Amount).mul(MINT_LIMIT_PER_WALLET),
              ERC20Mock.address,
              publicUser1.address
            );
        }

        expect(await BOTV2.totalSupply()).to.be.equal(
          BigNumber.from(MAX_SUPPLY)
        );

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser1.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWithCustomError(BOTV2, "MaxSupplyExceeded");
      });
*/
    });

    describe("Private sale mint", async function () {
      it("Should authorize if tokenOwner is in the private sale allowlist", async function () {
        const {
          publicUser1,
          privateUser3,
          discountPrivateUser,

          ERC20Amount,

          ERC20Mock,
          privateListMerkleProof,

          BOTV2
        } = await loadFixture(initFixture);

        await expect(
          BOTV2.connect(publicUser1).mint(
            privateUser3.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(privateUser3.address),
            []
          )
        ).to.be.revertedWithCustomError(BOTV2, "NoActiveSale");

        let tx = await BOTV2.setPrivateSale(true);
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            privateUser3.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(privateUser3.address),
            []
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            privateUser3.address,
            1,
            ERC20Amount,
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountPrivateUser.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(discountPrivateUser.address),
            []
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            discountPrivateUser.address,
            1,
            ERC20Amount,
            ERC20Mock.address,
            publicUser1.address
          );
      });

      it("Should revert if tokenOwner is not in the private sale allowlist", async function () {
        const {
          publicUser1,
          publicUser2,
          privateUser3,
          discountUser1,

          ERC20Amount,

          ERC20Mock,
          privateListMerkleProof,

          BOTV2
        } = await loadFixture(initFixture);

        let tx = await BOTV2.setPrivateSale(true);
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(privateUser3.address),
            []
          )
        ).to.be.revertedWithCustomError(BOTV2, "NotAllowedForPrivateSale");

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountUser1.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(discountUser1.address),
            []
          )
        ).to.be.revertedWithCustomError(BOTV2, "NotAllowedForPrivateSale");

        await expect(
          BOTV2.connect(publicUser1).mint(
            privateUser3.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(publicUser1.address),
            []
          )
        ).to.be.revertedWithCustomError(BOTV2, "NotAllowedForPrivateSale");

        await expect(
          BOTV2.connect(publicUser1).mint(
            privateUser3.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(privateUser3.address),
            []
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            privateUser3.address,
            1,
            ERC20Amount,
            ERC20Mock.address,
            publicUser1.address
          );

        tx = await BOTV2.setPublicSale(true);
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountUser1.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(discountUser1.address),
            []
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            discountUser1.address,
            1,
            ERC20Amount,
            ERC20Mock.address,
            publicUser1.address
          );
      });
    });

    describe("Discount", async function () {
      it("Should have a discount if tokenOwner is in the allowlist and is minting a second token", async function () {
        const {
          publicUser1,
          discountUser1,
          discountUser2,
          discountPrivateUser,

          ERC20Amount,

          ERC20Mock,
          discountMerkleProof,

          BOTV2
        } = await loadFixture(activeSaleFixture);

        let discount = BigNumber.from(ERC20Amount).div(2);

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountUser1.address,
            2,
            ERC20Mock.address,
            [],
            discountMerkleProof(discountUser1.address)
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            discountUser1.address,
            2,
            BigNumber.from(ERC20Amount).mul(2).sub(discount),
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountUser2.address,
            1,
            ERC20Mock.address,
            [],
            discountMerkleProof(discountUser2.address)
          )
        ).to.changeTokenBalances(
          ERC20Mock,
          [publicUser1.address, MINT_TREASURY, discountUser2.address],
          [-ERC20Amount, ERC20Amount, 0]
        );

        const etherValue = "0.15";
        const value = parseEther(etherValue);

        let tx = await BOTV2.setPrice(ZERO_ADDRESS, true, value);
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountUser2.address,
            1,
            ZERO_ADDRESS,
            [],
            discountMerkleProof(discountUser2.address),
            { value: BigNumber.from(value).div(2) }
          )
        ).to.changeEtherBalances(
          [publicUser1.address, MINT_TREASURY],
          [parseEther(`-${etherValue}`).div(2), BigNumber.from(value).div(2)]
        );

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountPrivateUser.address,
            1,
            ZERO_ADDRESS,
            [],
            discountMerkleProof(discountPrivateUser.address),
            { value }
          )
        ).to.changeEtherBalances(
          [publicUser1.address, MINT_TREASURY],
          [parseEther(`-${etherValue}`), value]
        );
        await expect(
          BOTV2.connect(publicUser1).mint(
            discountPrivateUser.address,
            5,
            ERC20Mock.address,
            [],
            discountMerkleProof(discountPrivateUser.address)
          )
        ).to.changeTokenBalances(
          ERC20Mock,
          [publicUser1.address, MINT_TREASURY, discountPrivateUser.address],
          [
            -BigNumber.from(ERC20Amount).mul(5).sub(discount),
            BigNumber.from(ERC20Amount).mul(5).sub(discount),
            0
          ]
        );
      });

      it("Should not have a discount for tokenOwner in the allowlist if he is not minting a second token", async function () {
        const {
          publicUser1,
          discountUser1,
          discountUser2,

          ERC20Amount,

          ERC20Mock,
          discountMerkleProof,

          BOTV2
        } = await loadFixture(activeSaleFixture);

        let discount = BigNumber.from(ERC20Amount).div(2);

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountUser1.address,
            2,
            ERC20Mock.address,
            [],
            discountMerkleProof(discountUser1.address)
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            discountUser1.address,
            2,
            BigNumber.from(ERC20Amount).mul(2).sub(discount),
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountUser1.address,
            1,
            ERC20Mock.address,
            [],
            discountMerkleProof(discountUser1.address)
          )
        ).to.changeTokenBalances(
          ERC20Mock,
          [publicUser1.address, MINT_TREASURY, discountUser2.address],
          [-ERC20Amount, ERC20Amount, 0]
        );

        const etherValue = "0.15";
        const value = parseEther(etherValue);

        let tx = await BOTV2.setPrice(ZERO_ADDRESS, true, value);
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountUser2.address,
            1,
            ZERO_ADDRESS,
            [],
            discountMerkleProof(discountUser2.address),
            { value }
          )
        ).to.changeEtherBalances(
          [publicUser1.address, MINT_TREASURY],
          [parseEther(`-${etherValue}`), value]
        );

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountUser2.address,
            1,
            ZERO_ADDRESS,
            [],
            discountMerkleProof(discountUser2.address),
            { value: BigNumber.from(value).div(2) }
          )
        ).to.changeEtherBalances(
          [publicUser1.address, MINT_TREASURY],
          [parseEther(`-${etherValue}`).div(2), BigNumber.from(value).div(2)]
        );

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountUser2.address,
            1,
            ZERO_ADDRESS,
            [],
            discountMerkleProof(discountUser2.address),
            { value: BigNumber.from(value).div(2) }
          )
        ).to.be.revertedWithCustomError(BOTV2, "AmountValueTooLow");

        await expect(
          BOTV2.connect(publicUser1).mint(
            discountUser2.address,
            5,
            ERC20Mock.address,
            [],
            discountMerkleProof(discountUser2.address)
          )
        ).to.changeTokenBalances(
          ERC20Mock,
          [publicUser1.address, MINT_TREASURY, discountUser2.address],
          [
            -BigNumber.from(ERC20Amount).mul(5),
            BigNumber.from(ERC20Amount).mul(5),
            0
          ]
        );
      });

      it("Should not have a discount if tokenOwner is not in the discount allowlist", async function () {
        const {
          publicUser1,
          publicUser2,

          privateUser1,

          discountUser1,

          ERC20Amount,

          ERC20Mock,
          discountMerkleProof,

          BOTV2
        } = await loadFixture(activeSaleFixture);

        await expect(
          BOTV2.connect(publicUser1).mint(
            publicUser2.address,
            2,
            ERC20Mock.address,
            [],
            discountMerkleProof(publicUser2.address)
          )
        )
          .to.emit(BOTV2, "Mint")
          .withArgs(
            publicUser2.address,
            2,
            BigNumber.from(ERC20Amount).mul(2),
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV2.connect(publicUser1).mint(
            privateUser1.address,
            1,
            ERC20Mock.address,
            [],
            discountMerkleProof(discountUser1.address)
          )
        ).to.changeTokenBalances(
          ERC20Mock,
          [publicUser1.address, MINT_TREASURY, privateUser1.address],
          [-ERC20Amount, ERC20Amount, 0]
        );

        const etherValue = "0.15";
        const value = parseEther(etherValue);

        let tx = await BOTV2.setPrice(ZERO_ADDRESS, true, value);
        await tx.wait();

        await expect(
          BOTV2.connect(publicUser1).mint(
            privateUser1.address,
            1,
            ZERO_ADDRESS,
            [],
            discountMerkleProof(privateUser1.address),
            { value: BigNumber.from(value).div(2) }
          )
        ).to.be.revertedWithCustomError(BOTV2, "AmountValueTooLow");

        await expect(
          BOTV2.connect(publicUser1).mint(
            privateUser1.address,
            1,
            ZERO_ADDRESS,
            [],
            discountMerkleProof(discountUser1.address),
            { value: BigNumber.from(value).div(2) }
          )
        ).to.be.revertedWithCustomError(BOTV2, "AmountValueTooLow");

        await expect(
          BOTV2.connect(publicUser1).mint(
            privateUser1.address,
            1,
            ZERO_ADDRESS,
            [],
            discountMerkleProof(discountUser1.address),
            { value }
          )
        ).to.changeEtherBalances(
          [publicUser1.address, MINT_TREASURY],
          [parseEther(`-${etherValue}`), value]
        );
      });
    });
  });

  describe("Migration features", async function () {
    it("Should mint tokens from botv1", async function () {
      const { BOTV2 } = await loadFixture(initFixture);

      await expect(BOTV2.migrate(83)).to.revertedWithCustomError(
        BOTV2,
        "InvalidMintParameters"
      );

      await BOTV2.migrate(80);

      await expect(BOTV2.migrate(3)).to.revertedWithCustomError(
        BOTV2,
        "InvalidMintParameters"
      );

      await BOTV2.migrate(2);

      await expect(BOTV2.migrate(3)).to.revertedWithCustomError(
        BOTV2,
        "InvalidMintParameters"
      );

      expect(await BOTV2.ownerOf(0)).equal(
        "0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA"
      );

      expect(await BOTV2.ownerOf(38)).equal(
        "0x0506d39eFFCAefBC632cbe72C36c4d64759A665F"
      );

      expect(await BOTV2.ownerOf(81)).equal(
        "0x894f0D51FB7cAa5adb5363ad42aff64ae7afdC77"
      );
    });

    it("Should have correct metadata", async function () {
      const { BOTV2, publicUser1, ERC20Mock } = await loadFixture(initFixture);

      await BOTV2.migrate(82);

      await BOTV2.setPublicSale(true);

      await BOTV2.connect(publicUser1).mint(
        publicUser1.address,
        1,
        ERC20Mock.address,
        [],
        []
      );

      expect(await BOTV2.tokenURI(5)).to.equal(
        "ipfs://bafybeigqeiwfl2bh66dflt4v46745u3tnua2xpph5lqve4q2kjsbmninkq/tokens/83"
      );
      expect(await BOTV2.tokenURI(6)).to.equal(
        "ipfs://bafybeigqeiwfl2bh66dflt4v46745u3tnua2xpph5lqve4q2kjsbmninkq/tokens/84"
      );
      expect(await BOTV2.tokenURI(81)).to.equal(
        "ipfs://bafybeigqeiwfl2bh66dflt4v46745u3tnua2xpph5lqve4q2kjsbmninkq/tokens/159"
      );
      expect(await BOTV2.tokenURI(82)).to.equal(
        "ipfs://bafybeigqeiwfl2bh66dflt4v46745u3tnua2xpph5lqve4q2kjsbmninkq/tokens/160"
      );

      for (let i = 0; i < 15; i++) {
        const tokenURI = await BOTV2.tokenURI(i);
        const metadataId = tokenURI.split("/").pop();
        const metadataRes = await superagent(
          `https://bafybeigqeiwfl2bh66dflt4v46745u3tnua2xpph5lqve4q2kjsbmninkq.ipfs.nftstorage.link/tokens/${metadataId}`
        );
        const { image, animation_url } = JSON.parse(metadataRes.text);

        expect(image).to.equal(
          `ipfs://bafybeicgk7uqmmfhcopoyh7rwvqgiva7ebr6u6osqbeviel7o4x3suaiee/${image
            .split("/")
            .pop()}`
        );
        expect(animation_url).to.equal(
          `ipfs://bafybeibv34mmilskls4nuubcwow4pjeswzsfv5pdkna4b2nu5g7fipay6i/${animation_url
            .split("/")
            .pop()}`
        );

        const imgRes = await superagent.head(
          `https://bafybeicgk7uqmmfhcopoyh7rwvqgiva7ebr6u6osqbeviel7o4x3suaiee.ipfs.nftstorage.link/${image
            .split("/")
            .pop()}`
        );
        const animUrlRes = await superagent.head(
          `https://bafybeibv34mmilskls4nuubcwow4pjeswzsfv5pdkna4b2nu5g7fipay6i.ipfs.nftstorage.link/${animation_url
            .split("/")
            .pop()}`
        );
        expect(imgRes.status).equal(200);
        expect(imgRes.header["content-type"]).equal("image/png");
        expect(animUrlRes.status).equal(200);
        expect(animUrlRes.header["content-type"]).equal("audio/x-wav");
      }
    });

    it("Should burn as expected", async function () {
      const { BOTV2 } = await loadFixture(afterOneSaleFixture);

      const totalSupply = await BOTV2.totalSupply();

      await expect(BOTV2.burn(2)).to.emit(BOTV2, "Transfer");
      await expect(BOTV2.burn(1)).to.emit(BOTV2, "Transfer");

      await expect(BOTV2.burn(2)).to.be.reverted;

      expect(BigNumber.from(totalSupply).sub(2)).to.equal(
        await BOTV2.totalSupply()
      );

      await expect(BOTV2.ownerOf(1)).to.revertedWithCustomError(
        BOTV2,
        "OwnerQueryForNonexistentToken"
      );
    });
  });

  describe("$BUFA Rewards", async function () {
    it("Should get rewards according holding period and rarity rank", async function () {
      const {
        BOTV2,
        BUFA,
        publicUser1,
        BUFAUnits,
        tokenIds,
        bufaPerDay,
        merkleProofs,
        increasedTime
      } = await loadFixture(onceRevealed);

      const rewardsAmount = await BOTV2.availableRewards(
        publicUser1.address,
        tokenIds,
        bufaPerDay,
        merkleProofs
      );

      expect(BigNumber.from(rewardsAmount).div(BUFAUnits)).to.equal(450);

      await expect(
        BOTV2.claimRewards(
          publicUser1.address,
          [0],
          [100],
          [bufaMerkle[78].merkleProofs]
        )
      ).to.emit(BUFA, "Transfer");

      await expect(
        BOTV2.claimRewards(
          publicUser1.address,
          tokenIds,
          bufaPerDay,
          merkleProofs
        )
      ).to.emit(BUFA, "Transfer");

      let BUFABalance = await BUFA.balanceOf(publicUser1.address);
      expect(rewardsAmount).to.be.closeTo(BUFABalance, BUFAUnits);

      await time.increase(increasedTime / 2);

      await expect(
        BOTV2.claimRewards(
          publicUser1.address,
          tokenIds,
          bufaPerDay,
          merkleProofs
        )
      ).to.emit(BUFA, "Transfer");

      BUFABalance = await BUFA.balanceOf(publicUser1.address);
      expect(rewardsAmount.mul(3).div(2)).to.be.closeTo(BUFABalance, BUFAUnits);

      await time.increase(increasedTime * 7);

      await expect(
        BOTV2.claimRewards(
          publicUser1.address,
          [0],
          [100],
          [bufaMerkle[78].merkleProofs]
        )
      ).to.emit(BUFA, "Transfer");

      expect(rewardsAmount.mul(3).div(2).add(700)).to.be.closeTo(
        BUFABalance,
        BUFAUnits
      );
    });

    it("Should revert if bufaRewards value is not correct", async function () {
      const { BOTV2, BUFA, publicUser1, tokenIds, bufaPerDay, merkleProofs } =
        await loadFixture(onceRevealed);

      const newBufaPerDays = [...bufaPerDay];
      newBufaPerDays[2] = 1000;

      // metadataIds = [78,79,80,81,82]
      // bufaRewardsPerDay = [100,50,100,50,150] => 450 for increaseTime = 86400 (1 day)

      await expect(
        BOTV2.availableRewards(
          publicUser1.address,
          tokenIds,
          newBufaPerDays,
          merkleProofs
        )
      )
        .to.revertedWithCustomError(BOTV2, "InvalidRewardsForToken")
        .withArgs(tokenIds[2], 80, 1000);

      await expect(
        BOTV2.claimRewards(
          publicUser1.address,
          tokenIds,
          newBufaPerDays,
          merkleProofs
        )
      )
        .to.revertedWithCustomError(BOTV2, "InvalidRewardsForToken")
        .withArgs(tokenIds[2], 80, 1000);

      expect(await BUFA.balanceOf(publicUser1.address)).to.equal(0);
    });

    it("Should revert if tokenId does not exist", async function () {
      const { BOTV2, BUFA, publicUser1, tokenIds, bufaPerDay, merkleProofs } =
        await loadFixture(onceRevealed);

      const newTokenIds = [...tokenIds];
      newTokenIds[2] = 900;

      await expect(
        BOTV2.availableRewards(
          publicUser1.address,
          newTokenIds,
          bufaPerDay,
          merkleProofs
        )
      ).to.revertedWithCustomError(BOTV2, "OwnerQueryForNonexistentToken");

      await expect(
        BOTV2.claimRewards(
          publicUser1.address,
          newTokenIds,
          bufaPerDay,
          merkleProofs
        )
      ).to.revertedWithCustomError(BOTV2, "OwnerQueryForNonexistentToken");

      expect(await BUFA.balanceOf(publicUser1.address)).to.equal(0);
    });

    it("Should revert if not owner", async function () {
      const {
        BOTV2,
        BUFA,
        deployer,
        publicUser1,
        BUFAUnits,
        tokenIds,
        bufaPerDay,
        merkleProofs
      } = await loadFixture(onceRevealed);

      await expect(
        BOTV2.connect(publicUser1).availableRewards(
          deployer.address,
          tokenIds,
          bufaPerDay,
          merkleProofs
        )
      )
        .to.revertedWithCustomError(BOTV2, "NotOwner")
        .withArgs(deployer.address, tokenIds[0]);

      await expect(
        BOTV2.connect(publicUser1).claimRewards(
          deployer.address,
          tokenIds,
          bufaPerDay,
          merkleProofs
        )
      )
        .to.revertedWithCustomError(BOTV2, "NotOwner")
        .withArgs(deployer.address, tokenIds[0]);
      expect(await BUFA.balanceOf(deployer.address)).to.equal(0);
      expect(await BUFA.balanceOf(publicUser1.address)).to.equal(0);

      await BOTV2.connect(publicUser1).claimRewards(
        publicUser1.address,
        tokenIds,
        bufaPerDay,
        merkleProofs
      );

      expect(await BUFA.balanceOf(deployer.address)).to.equal(0);
      expect(
        (await BUFA.balanceOf(publicUser1.address)).div(BUFAUnits)
      ).to.equal(450);
    });

    it("Should reset on transfer", async function () {
      const {
        BOTV2,
        BUFA,
        publicUser1,
        publicUser2,
        BUFAUnits,
        tokenIds,
        bufaPerDay,
        merkleProofs,
        increasedTime
      } = await loadFixture(onceRevealed);

      const rewardsAmount = await BOTV2.availableRewards(
        publicUser1.address,
        tokenIds,
        bufaPerDay,
        merkleProofs
      );

      expect(BigNumber.from(rewardsAmount).div(BUFAUnits)).to.equal(450);

      expect(await BOTV2.ownerOf(0)).to.equal(publicUser1.address);
      expect(await BOTV2.ownerOf(1)).to.equal(publicUser1.address);
      expect(await BOTV2.ownerOf(2)).to.equal(publicUser1.address);

      await BOTV2.connect(publicUser1)[
        "safeTransferFrom(address,address,uint256)"
      ](publicUser1.address, publicUser2.address, 0);

      await BOTV2.connect(publicUser1).transferFrom(
        publicUser1.address,
        publicUser2.address,
        1
      );

      expect(await BOTV2.ownerOf(0)).to.equal(publicUser2.address);
      expect(await BOTV2.ownerOf(1)).to.equal(publicUser2.address);
      expect(await BOTV2.ownerOf(2)).to.equal(publicUser1.address);

      await expect(
        BOTV2.connect(publicUser1).availableRewards(
          publicUser1.address,
          tokenIds,
          bufaPerDay,
          merkleProofs
        )
      )
        .to.revertedWithCustomError(BOTV2, "NotOwner")
        .withArgs(publicUser1.address, tokenIds[0]);

      const [tokenId0, tokenId1, ...otherTokenIds] = tokenIds;
      const [bufaPerDay0, bufaPerDay1, ...otherBufaPerDays] = bufaPerDay;
      const [merkleProofs0, merkleProofs1, ...othermerkleProofs] = merkleProofs;

      await BOTV2.connect(publicUser1).claimRewards(
        publicUser1.address,
        otherTokenIds,
        otherBufaPerDays,
        othermerkleProofs
      );

      await BOTV2.connect(publicUser1).claimRewards(
        publicUser2.address,
        [tokenId0, tokenId1],
        [bufaPerDay0, bufaPerDay1],
        [merkleProofs0, merkleProofs1]
      );

      expect(
        BigNumber.from(await BUFA.balanceOf(publicUser1.address)).div(BUFAUnits)
      ).to.equal(450 - 100 - 50);

      expect(await BUFA.balanceOf(publicUser2.address)).to.be.closeTo(
        0,
        BUFAUnits
      );

      time.increase(increasedTime);

      await BOTV2.connect(publicUser1).claimRewards(
        publicUser1.address,
        otherTokenIds,
        otherBufaPerDays,
        othermerkleProofs
      );

      await BOTV2.connect(publicUser2).claimRewards(
        publicUser2.address,
        [tokenId0],
        [bufaPerDay0],
        [merkleProofs0]
      );

      expect(
        BigNumber.from(await BUFA.balanceOf(publicUser1.address)).div(BUFAUnits)
      ).to.equal((450 - 100 - 50) * 2);

      expect(
        BigNumber.from(await BUFA.balanceOf(publicUser2.address)).div(BUFAUnits)
      ).to.equal(100);

      await BOTV2.connect(publicUser2).claimRewards(
        publicUser2.address,
        [tokenId1],
        [bufaPerDay1],
        [merkleProofs1]
      );

      expect(
        BigNumber.from(await BUFA.balanceOf(publicUser2.address)).div(BUFAUnits)
      ).to.equal(100 + 50);

      time.increase(increasedTime * 1.5);

      await BOTV2.connect(publicUser2).claimRewards(
        publicUser2.address,
        [tokenId1, tokenId0],
        [bufaPerDay1, bufaPerDay0],
        [merkleProofs1, merkleProofs0]
      );

      expect(
        BigNumber.from(await BUFA.balanceOf(publicUser2.address)).div(BUFAUnits)
      ).to.be.closeTo(Math.trunc((100 + 50) * 2.5), 1);
    });

    it("Should ignore token provided multiples times", async function () {
      const {
        BOTV2,
        BUFA,
        publicUser1,
        BUFAUnits,
        tokenIds,
        bufaPerDay,
        merkleProofs
      } = await loadFixture(onceRevealed);

      await expect(
        BOTV2.availableRewards(
          publicUser1.address,
          [tokenIds[2], ...tokenIds],
          [bufaPerDay[2], ...bufaPerDay],
          [merkleProofs[2], ...merkleProofs]
        )
      )
        .to.revertedWithCustomError(BOTV2, "TokenGivenTwice")
        .withArgs(tokenIds[2]);

      await expect(
        BOTV2.claimRewards(
          publicUser1.address,
          [tokenIds[2], ...tokenIds],
          [bufaPerDay[2], ...bufaPerDay],
          [merkleProofs[2], ...merkleProofs]
        )
      ).to.emit(BUFA, "Transfer");

      await expect(
        BOTV2.claimRewards(
          publicUser1.address,
          [...tokenIds, tokenIds[2]],
          [...bufaPerDay, bufaPerDay[2]],
          [...merkleProofs, merkleProofs[2]]
        )
      ).to.emit(BUFA, "Transfer");

      expect(
        (await BUFA.balanceOf(publicUser1.address)).div(BUFAUnits)
      ).to.equal(450);
    });
  });

  describe("Protected operations", async function () {
    async function testProtectedFunction(functionName, functionArgs) {
      const { BOTV2, publicUser1 } = await loadFixture(afterOneSaleFixture);
      await expect(BOTV2[functionName](...functionArgs)).to.not.be.reverted;
      await expect(
        BOTV2.connect(publicUser1)[functionName](...functionArgs)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    }

    it("Should revert if `burn` function is not executed by owner", async function () {
      await testProtectedFunction("burn", [0]);
    });

    it("Should revert if `migrate` function is not executed by owner", async function () {
      await testProtectedFunction("migrate", [10]);
    });

    it("Should revert if `mintForFree` function is not executed by owner", async function () {
      await testProtectedFunction("mintForFree", [
        ["0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA"],
        [1]
      ]);
    });

    it("Should revert if `setPrice` function is not executed by owner", async function () {
      await testProtectedFunction("setPrice", [ZERO_ADDRESS, true, 40000]);
    });

    it("Should revert if `setPrivateSale` is not executed by owner", async function () {
      await testProtectedFunction("setPrivateSale", [true]);
    });

    it("Should revert if `setPublicSale` is not executed by owner", async function () {
      await testProtectedFunction("setPublicSale", [true]);
    });

    it("Should revert if `setBaseURI` is not executed by owner", async function () {
      await testProtectedFunction("setBaseURI", ["new link"]);
    });

    it("Should revert if `setRewardsBufaContractAddress` function is not executed by owner", async function () {
      await testProtectedFunction("setRewardsBufaContractAddress", [
        "0x9cca62cf7360e143bd2e25c64742c5d8b7ab2a14"
      ]);
    });

    it("Should revert if `setDiscountMerkleRoot` is not executed by owner", async function () {
      await testProtectedFunction("setDiscountMerkleRoot", [bufaMerkle.root]);
    });

    it("Should revert if `setPrivateListMerkleRoot` is not executed by owner", async function () {
      await testProtectedFunction("setPrivateListMerkleRoot", [
        bufaMerkle.root
      ]);
    });

    it("Should revert if `setRewardsMerkleRoot` is not executed by owner", async function () {
      await testProtectedFunction("setRewardsMerkleRoot", [bufaMerkle.root]);
    });

    it("Should revert if `setBOTV1` is not executed by owner", async function () {
      await testProtectedFunction("setBOTV1", [
        "0x1D6F8ff4c5A4588DC95C8E1913E53a5007ad5378"
      ]);
    });

    it("Should revert if `setWearableOwner` function is not executed by owner", async function () {
      await testProtectedFunction("setWearableOwner", [
        "0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA"
      ]);
    });

    it("Should revert if `setWearableAirdropValues` function is not executed by owner", async function () {
      await testProtectedFunction("setWearableAirdropValues", [
        [
          "0x3dE583b9f7b3d1B9893D1918b6227b8656664FEc",
          "0xe869b6A81210444e297543e5c887635B3Ca521Eb",
          "0xdA7C3feea17D1AeDd01fa4131D62084C958bE26E"
        ],
        [307, 516, 6]
      ]);
    });
  });
});

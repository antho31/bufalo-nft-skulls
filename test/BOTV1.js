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
const { ethers } = require("hardhat");

const { getMerkleDataFromAllowlistArray } = require("../utils/merkle");

const bufaRewardsMerkle = require("../data/results/metadata/bufaRewardsMerkleData.json");

const MAX_SUPPLY = 1000;
const MINT_LIMIT_PER_WALLET = 10;

const BASE_URI =
  "ipfs://bafybeibo35dz2wsz44ixiw3yudl6ulk4kvdsj7irbjwjn76gkg7msl3lzy/tokens/";

const MINT_TREASURY = "0x3C0dABC82bf51d1bf994a54E70e7a7d19865f950";

describe("BOTV1", function () {
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

    const BUFADeployer = await ethers.getContractFactory("BUFAV1");
    const BUFA = await BUFADeployer.deploy();
    const BUFAdecimals = await BUFA.decimals();

    const BUFAUnits = parseUnits("1", BUFAdecimals);

    const MINTER_ROLE = await BUFA.MINTER_ROLE();

    const BASE_FEE = "100000000000000000";
    const GAS_PRICE_LINK = "1000000000"; // 0.000000001 LINK per gas
    const vrfCoordinatorV2MockDeployer = await ethers.getContractFactory(
      "VRFCoordinatorV2Mock"
    );
    const vrfCoordinatorV2Mock = await vrfCoordinatorV2MockDeployer.deploy(
      BASE_FEE,
      GAS_PRICE_LINK
    );
    tx = await vrfCoordinatorV2Mock.createSubscription();
    const transactionReceipt = await tx.wait(1);
    const subscriptionId = BigNumber.from(
      transactionReceipt.events[0].topics[1]
    );
    await vrfCoordinatorV2Mock.fundSubscription(
      subscriptionId,
      parseEther("7")
    );
    const keyHash =
      "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc";

    const ERC721MockDeployer = await ethers.getContractFactory("ERC721Mock");
    const AirdropTokensContract1 = await ERC721MockDeployer.deploy(
      "AirdropTokensContract1",
      "A1"
    );
    const ACOffset1 = 45;
    tx = await AirdropTokensContract1.mint(
      deployer.address,
      ACOffset1,
      MAX_SUPPLY
    );
    await tx.wait();
    const AirdropTokensContract2 = await ERC721MockDeployer.deploy(
      "AirdropTokensContract2",
      "A2"
    );
    const ACOffset2 = 105;
    tx = await AirdropTokensContract2.mint(
      deployer.address,
      ACOffset2,
      MAX_SUPPLY
    );
    await tx.wait();
    const AirdropTokensContract3 = await ERC721MockDeployer.deploy(
      "AirdropTokensContract3",
      "A3"
    );
    const ACOffset3 = 0;
    tx = await AirdropTokensContract3.mint(
      deployer.address,
      ACOffset3,
      MAX_SUPPLY
    );
    await tx.wait();

    const wearablesContracts = [
      AirdropTokensContract1,
      AirdropTokensContract2,
      AirdropTokensContract3
    ];
    const wearablesAddresses = wearablesContracts.map((c) => c.address);
    const wearablesTokenIdsOffset = [ACOffset1, ACOffset2, ACOffset3];

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

    const BOTV1Deployer = await ethers.getContractFactory("BOTV1");
    const BOTV1 = await BOTV1Deployer.deploy(
      ERC20Mock.address,
      ERC20Amount,
      treasury.address,
      vrfCoordinatorV2Mock.address,
      wearablesAddresses,
      wearablesTokenIdsOffset,
      BUFA.address,
      bufaRewardsMerkle.root,
      discountListMerkleRoot,
      privateListMerkleRoot
    );

    tx = await BUFA.grantRole(MINTER_ROLE, BOTV1.address);

    for (let wearableContract of wearablesContracts) {
      tx = await wearableContract.setApprovalForAll(BOTV1.address, true);
      await tx.wait();
    }

    tx = await ERC20Mock.connect(publicUser1).approve(
      BOTV1.address,
      BigNumber.from(ERC20Amount).mul(MAX_SUPPLY)
    );
    await tx.wait();

    await vrfCoordinatorV2Mock.addConsumer(subscriptionId, BOTV1.address);

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

      ERC20Amount,

      ERC20MockDeployer,
      ERC20Mock,

      vrfCoordinatorV2MockDeployer,
      vrfCoordinatorV2Mock,
      subscriptionId,
      keyHash,

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
      BOTV1,
      BOTV1Deployer,

      BUFAUnits,
      MINTER_ROLE
    };
  }

  async function activeSaleFixture() {
    const { BOTV1, ...others } = await initFixture();

    let tx = await BOTV1.setPublicSale(true);
    await tx.wait();

    return { BOTV1, ...others };
  }

  async function afterOneSaleFixture() {
    const { BOTV1, publicUser1, ERC20Mock, ...others } =
      await activeSaleFixture();

    const quantity = 5;
    let tx = await BOTV1.connect(publicUser1).mint(
      publicUser1.address,
      quantity,
      ERC20Mock.address,
      [],
      []
    );
    await tx.wait();

    return { quantity, BOTV1, publicUser1, ERC20Mock, ...others };
  }

  async function onceRevealed() {
    const { BOTV1, vrfCoordinatorV2Mock, subscriptionId, keyHash, ...others } =
      await loadFixture(afterOneSaleFixture);

    await expect(BOTV1.reveal(keyHash, subscriptionId, 40000));
    const requestId = await BOTV1.requestId();
    await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, BOTV1.address);

    const tokenIds = [0, 1, 2, 3, 4]; // quantity = 5
    // metadataIds = [944,945,946,947,948]
    // bufaRewardsPerDay = [100,75,150,150,75] => 550 for increaseTime = 86400 (1 day)

    const [, metadataIdsBN] = await BOTV1.getMetadataIdsForTokens(tokenIds);
    const metadataIds = metadataIdsBN.map((m) => `${m}`);
    const bufaPerDay = metadataIds.map((m) => bufaRewardsMerkle[m].bufaPerDay);
    const merkleProofs = metadataIds.map(
      (m) => bufaRewardsMerkle[m].merkleProofs
    );

    const increasedTime = 86400;

    await time.increase(increasedTime);

    return {
      tokenIds,
      metadataIds,
      bufaPerDay,
      merkleProofs,
      increasedTime,
      BOTV1,
      vrfCoordinatorV2Mock,
      subscriptionId,
      keyHash,
      ...others
    };
  }

  describe("Deployment", async function () {
    it("Should support ERC4907, ERC2981 and ERC721 interfaces", async function () {
      const { BOTV1 } = await loadFixture(initFixture);

      const supportsDummy = await BOTV1.supportsInterface("0x80ac58cf");
      const supportsERC1555 = await BOTV1.supportsInterface("0x4e2312e0");
      const supportsERC165 = await BOTV1.supportsInterface("0x01ffc9a7");
      const supportsERC20 = await BOTV1.supportsInterface("0x36372b07");
      const supportsERC2981 = await BOTV1.supportsInterface("0x2a55205a");
      const supportsERC4907 = await BOTV1.supportsInterface("0xad092b5c");
      const supportsERC721 = await BOTV1.supportsInterface("0x80ac58cd");

      const supportsERC721Metadata = await BOTV1.supportsInterface(
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
        vrfCoordinatorV2Mock,

        wearablesAddresses,
        wearablesTokenIdsOffset,
        discountListMerkleRoot,
        privateListMerkleRoot,

        BUFA,
        BOTV1,
        BOTV1Deployer
      } = await loadFixture(initFixture);

      await expect(
        BOTV1Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          ZERO_ADDRESS,
          vrfCoordinatorV2Mock.address,
          wearablesAddresses,
          wearablesTokenIdsOffset,
          BUFA.address,
          bufaRewardsMerkle.root,
          discountListMerkleRoot,
          privateListMerkleRoot
        )
      ).to.be.revertedWithCustomError(BOTV1, "CannotBeZeroAddress");

      await expect(
        BOTV1Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          vrfCoordinatorV2Mock.address,
          wearablesAddresses,
          wearablesTokenIdsOffset,
          ZERO_ADDRESS,
          bufaRewardsMerkle.root,
          discountListMerkleRoot,
          privateListMerkleRoot
        )
      ).to.be.revertedWithCustomError(BOTV1, "CannotBeZeroAddress");

      await expect(
        BOTV1Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          vrfCoordinatorV2Mock.address,
          [deployer.address, ...wearablesAddresses],
          wearablesTokenIdsOffset,
          BUFA.address,
          bufaRewardsMerkle.root,
          discountListMerkleRoot,
          privateListMerkleRoot
        )
      ).to.be.revertedWithCustomError(BOTV1, "IncompleteAirdropParameter");

      const wearablesAddresses2 = [...wearablesAddresses];
      wearablesAddresses2[0] = ZERO_ADDRESS;
      await expect(
        BOTV1Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          vrfCoordinatorV2Mock.address,
          wearablesAddresses2,
          wearablesTokenIdsOffset,
          BUFA.address,
          bufaRewardsMerkle.root,
          discountListMerkleRoot,
          privateListMerkleRoot
        )
      ).to.be.revertedWithCustomError(BOTV1, "InvalidAirdropParameter");

      await expect(
        BOTV1Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          vrfCoordinatorV2Mock.address,
          wearablesAddresses,
          wearablesTokenIdsOffset,
          BUFA.address,
          formatBytes32String(""),
          discountListMerkleRoot,
          privateListMerkleRoot
        )
      ).to.be.revertedWithCustomError(BOTV1, "InvalidMerkleRoot");

      await expect(
        BOTV1Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          vrfCoordinatorV2Mock.address,
          wearablesAddresses,
          wearablesTokenIdsOffset,
          BUFA.address,
          bufaRewardsMerkle.root,
          formatBytes32String(""),
          privateListMerkleRoot
        )
      ).to.be.revertedWithCustomError(BOTV1, "InvalidMerkleRoot");

      await expect(
        BOTV1Deployer.deploy(
          ERC20Mock.address,
          ERC20Amount,
          treasury.address,
          vrfCoordinatorV2Mock.address,
          wearablesAddresses,
          wearablesTokenIdsOffset,
          BUFA.address,
          bufaRewardsMerkle.root,
          discountListMerkleRoot,
          formatBytes32String("")
        )
      ).to.be.revertedWithCustomError(BOTV1, "InvalidMerkleRoot");
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

          BOTV1
        } = await loadFixture(initFixture);

        const totalQty = 10;

        const totalSupply = await BOTV1.totalSupply();

        await expect(
          BOTV1.mintForFree(
            [publicUser1.address, publicUser2.address, publicUser3.address],

            [1, 8, 1]
          )
        ).to.changeTokenBalances(
          BOTV1,

          [publicUser1.address, publicUser2.address, publicUser3.address],

          [1, 8, 1]
        );

        expect(await BOTV1.totalSupply()).to.be.equal(
          totalSupply.add(totalQty)
        );

        await expect(
          BOTV1.mintForFree(
            [publicUser1.address, publicUser2.address, publicUser3.address],

            [1, 8, 1]
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(publicUser2.address, 8, 0, ZERO_ADDRESS, deployer.address);
      });

      it("Should reject if max supply exceed", async function () {
        const {
          publicUser1,
          publicUser2,
          publicUser3,

          BOTV1
        } = await loadFixture(initFixture);

        for (let i = 0; i < 9; i++) {
          await expect(
            BOTV1.mintForFree([publicUser1.address], [100])
          ).to.changeTokenBalances(BOTV1, [publicUser1.address], [100]);
        }

        await expect(
          BOTV1.mintForFree(
            [publicUser1.address],

            [97]
          )
        ).to.changeTokenBalances(BOTV1, [publicUser1.address], [97]);

        await expect(
          BOTV1.mintForFree(
            [publicUser1.address, publicUser2.address, publicUser3.address],

            [1, 2, 1]
          )
        ).to.revertedWithCustomError(BOTV1, "MaxSupplyExceeded");

        expect(await BOTV1.balanceOf(publicUser1.address)).to.be.equal(
          MAX_SUPPLY - 3
        );
      });

      it("Should reject if not same parameters length", async function () {
        const {
          publicUser1,
          publicUser2,
          publicUser3,

          BOTV1
        } = await loadFixture(initFixture);

        await expect(
          BOTV1.mintForFree(
            [publicUser1.address, publicUser2.address, publicUser3.address],

            [1, 2, 1, 2]
          )
        ).to.revertedWithCustomError(BOTV1, "InvalidMintParameters");
      });

      it("Should reject if 0 as quantity provided", async function () {
        const {
          publicUser1,
          publicUser2,
          publicUser3,

          BOTV1
        } = await loadFixture(initFixture);

        await expect(
          BOTV1.mintForFree(
            [publicUser1.address, publicUser2.address, publicUser3.address],

            [1, 2, 0]
          )
        ).to.revertedWithCustomError(BOTV1, "InvalidMintParameters");
      });

      it("Should reject if no address provided", async function () {
        const { BOTV1 } = await loadFixture(initFixture);

        await expect(BOTV1.mintForFree([], [])).to.revertedWithCustomError(
          BOTV1,
          "InvalidMintParameters"
        );
      });

      it("Should reject if zero address provided", async function () {
        const { publicUser1, BOTV1 } = await loadFixture(initFixture);

        await expect(
          BOTV1.mintForFree(
            [publicUser1.address, ZERO_ADDRESS],

            [1, 2]
          )
        ).to.revertedWithCustomError(BOTV1, "CannotBeZeroAddress");

        expect(await BOTV1.balanceOf(publicUser1.address)).to.be.equal(0);
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
          BOTV1
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

        const totalSupply = await BOTV1.totalSupply();

        await expect(
          BOTV1.connect(publicUser1).mint(
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

        expect(await BOTV1.totalSupply()).to.be.equal(
          totalSupply.add(quantity)
        );

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        ).to.changeTokenBalances(
          BOTV1,
          [publicUser1.address, MINT_TREASURY, publicUser2.address],
          [0, 0, quantity]
        );

        for (let wearableContract of wearablesContracts) {
          await expect(
            BOTV1.connect(publicUser1).mint(
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
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            BigNumber.from(ERC20Amount).mul(quantity),
            ERC20Mock.address,
            publicUser1.address
          );

        expect(await BOTV1.totalSupply()).to.be.equal(
          totalSupply.add(nbOfMints)
        );
      });

      it("Should mint as expected with native currency payment", async function () {
        const {
          publicUser1,
          publicUser2,
          publicUser3,
          wearablesContracts,
          BOTV1
        } = await loadFixture(activeSaleFixture);

        const etherAmount = "0.05";
        const amount = parseEther(etherAmount);
        const quantity = 3;
        const value = BigNumber.from(amount).mul(BigNumber.from(quantity));
        const etherValue = "0.15";

        let tx = await BOTV1.setPrice(ZERO_ADDRESS, true, amount);
        await tx.wait();

        const nbOfMints = quantity * (3 + wearablesContracts.length);

        const totalSupply = await BOTV1.totalSupply();

        await expect(
          BOTV1.connect(publicUser1).mint(
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
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        ).to.changeTokenBalances(
          BOTV1,
          [publicUser1.address, MINT_TREASURY, publicUser2.address],
          [0, 0, quantity]
        );

        for (let wearableContract of wearablesContracts) {
          await expect(
            BOTV1.connect(publicUser1).mint(
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
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            value,
            ZERO_ADDRESS,
            publicUser1.address
          );

        expect(await BOTV1.totalSupply()).to.be.equal(
          totalSupply.add(nbOfMints)
        );
      });

      it("Should mint even if pricing is set as free", async function () {
        const { publicUser1, publicUser2, ERC20Mock, BOTV1 } =
          await loadFixture(activeSaleFixture);

        const value = 0;

        const quantity = 2;
        const totalSupply = await BOTV1.totalSupply();
        const nbOfMints = quantity * 4;

        let tx = await BOTV1.setPrice(ZERO_ADDRESS, true, value);
        await tx.wait();
        tx = await BOTV1.setPrice(ERC20Mock.address, true, 0);
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
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
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            0,
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        ).to.changeEtherBalances([publicUser1.address, MINT_TREASURY], [0, 0]);

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            value,
            ZERO_ADDRESS,
            publicUser1.address
          );

        expect(await BOTV1.totalSupply()).to.be.equal(
          totalSupply.add(nbOfMints)
        );
      });

      it("Should revert if not enough available ERC20 amount to spend", async function () {
        const {
          publicUser1,
          publicUser2,

          ERC20Amount,
          ERC20Mock,
          BOTV1
        } = await loadFixture(activeSaleFixture);

        const totalSupply = await BOTV1.totalSupply();

        let tx = await ERC20Mock.connect(publicUser1).approve(BOTV1.address, 0);
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWith("ERC20: insufficient allowance");

        tx = await ERC20Mock.connect(publicUser1).approve(
          BOTV1.address,
          BigNumber.from(ERC20Amount).mul(2).mul(MAX_SUPPLY)
        );
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            publicUser2.address,
            1,
            ERC20Amount,
            ERC20Mock.address,
            publicUser1.address
          );

        tx = await BOTV1.setPrice(
          ERC20Mock.address,
          true,
          BigNumber.from(ERC20Amount).mul(MINT_LIMIT_PER_WALLET).add(1)
        );
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
        expect(await BOTV1.totalSupply()).to.be.equal(totalSupply.add(1));
      });

      it("Should revert if msg.value is too low", async function () {
        const { publicUser1, publicUser2, BOTV1 } = await loadFixture(
          activeSaleFixture
        );

        const etherAmount = "0.05";
        const amount = parseEther(etherAmount);
        const quantity = 3;
        const value = BigNumber.from(amount).mul(quantity);

        let tx = await BOTV1.setPrice(ZERO_ADDRESS, true, amount);
        await tx.wait();

        const totalSupply = await BOTV1.totalSupply();

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value: amount }
          )
        ).to.be.revertedWithCustomError(BOTV1, "AmountValueTooLow");

        const provider = ethers.provider;
        const balance = await provider.getBalance(publicUser1.address);

        tx = await BOTV1.setPrice(
          ZERO_ADDRESS,
          true,
          BigNumber.from(balance).add(1)
        );
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        ).to.be.revertedWithCustomError(BOTV1, "AmountValueTooLow");

        tx = await BOTV1.setPrice(ZERO_ADDRESS, true, amount);
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ZERO_ADDRESS,
            [],
            [],
            { value }
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            value,
            ZERO_ADDRESS,
            publicUser1.address
          );
        expect(await BOTV1.totalSupply()).to.be.equal(
          totalSupply.add(quantity)
        );
      });

      it("Should revert if provided currency is not enabled", async function () {
        const { publicUser1, publicUser2, ERC20Amount, ERC20Mock, BOTV1 } =
          await loadFixture(activeSaleFixture);

        let tx = await BOTV1.setPrice(ERC20Mock.address, false, ERC20Amount);
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.be.revertedWithCustomError(BOTV1, "ForbiddenCurrency")
          .withArgs(ERC20Mock.address);

        ERC20Amount.add(1);

        await tx.wait();
        tx = await BOTV1.setPrice(ERC20Mock.address, true, ERC20Amount);
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            publicUser2.address,
            1,
            ERC20Amount,
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ZERO_ADDRESS,
            [],
            []
          )
        )
          .to.be.revertedWithCustomError(BOTV1, "ForbiddenCurrency")
          .withArgs(ZERO_ADDRESS);
      });

      it("Should revert if arguments are invalid", async function () {
        const {
          publicUser1,
          publicUser2,
          publicUser3,
          ERC20Amount,
          ERC20Mock,
          BOTV1
        } = await loadFixture(activeSaleFixture);

        let tx = await ERC20Mock.mint(
          publicUser1.address,
          BigNumber.from(ERC20Amount).mul(MINT_LIMIT_PER_WALLET).mul(2)
        );
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            ZERO_ADDRESS,
            1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWithCustomError(BOTV1, "CannotBeZeroAddress");

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ZERO_ADDRESS,
            [],
            []
          )
        )
          .to.be.revertedWithCustomError(BOTV1, "ForbiddenCurrency")
          .withArgs(ZERO_ADDRESS);

        const ERC20MockDeployer = await ethers.getContractFactory("ERC20Mock");
        const ERC20Mock2 = await ERC20MockDeployer.deploy();

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock2.address,
            [],
            []
          )
        )
          .to.be.revertedWithCustomError(BOTV1, "ForbiddenCurrency")
          .withArgs(ERC20Mock2.address);

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            MINT_LIMIT_PER_WALLET + 1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWithCustomError(BOTV1, "TokenMintingLimitExceeded");

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            0,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.reverted; // revertedWithCustomError(ERC721A, "MintZeroQuantity");

        const quantity = MINT_LIMIT_PER_WALLET;

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            publicUser2.address,
            quantity,
            BigNumber.from(ERC20Amount).mul(quantity),
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWithCustomError(BOTV1, "TokenMintingLimitExceeded");

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser3.address,
            quantity,
            ERC20Mock.address,
            [],
            []
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            publicUser3.address,
            quantity,
            BigNumber.from(ERC20Amount).mul(quantity),
            ERC20Mock.address,
            publicUser1.address
          );
      });

      it("Should revert if number of tokens exceed MAX_SUPPLY value", async function () {
        const { publicUser1, ERC20Amount, ERC20Mock, BOTV1 } =
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
            BOTV1.connect(publicUser1).mint(
              signer.address,
              MINT_LIMIT_PER_WALLET,
              ERC20Mock.address,
              [],
              []
            )
          )
            .to.emit(BOTV1, "Mint")
            .withArgs(
              signer.address,
              MINT_LIMIT_PER_WALLET,
              BigNumber.from(ERC20Amount).mul(MINT_LIMIT_PER_WALLET),
              ERC20Mock.address,
              publicUser1.address
            );
        }

        expect(await BOTV1.totalSupply()).to.be.equal(
          BigNumber.from(MAX_SUPPLY)
        );

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser1.address,
            1,
            ERC20Mock.address,
            [],
            []
          )
        ).to.be.revertedWithCustomError(BOTV1, "MaxSupplyExceeded");
      });
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

          BOTV1
        } = await loadFixture(initFixture);

        await expect(
          BOTV1.connect(publicUser1).mint(
            privateUser3.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(privateUser3.address),
            []
          )
        ).to.be.revertedWithCustomError(BOTV1, "NoActiveSale");

        let tx = await BOTV1.setPrivateSale(true);
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            privateUser3.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(privateUser3.address),
            []
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            privateUser3.address,
            1,
            ERC20Amount,
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV1.connect(publicUser1).mint(
            discountPrivateUser.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(discountPrivateUser.address),
            []
          )
        )
          .to.emit(BOTV1, "Mint")
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

          BOTV1
        } = await loadFixture(initFixture);

        let tx = await BOTV1.setPrivateSale(true);
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(privateUser3.address),
            []
          )
        ).to.be.revertedWithCustomError(BOTV1, "NotAllowedForPrivateSale");

        await expect(
          BOTV1.connect(publicUser1).mint(
            discountUser1.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(discountUser1.address),
            []
          )
        ).to.be.revertedWithCustomError(BOTV1, "NotAllowedForPrivateSale");

        await expect(
          BOTV1.connect(publicUser1).mint(
            privateUser3.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(publicUser1.address),
            []
          )
        ).to.be.revertedWithCustomError(BOTV1, "NotAllowedForPrivateSale");

        await expect(
          BOTV1.connect(publicUser1).mint(
            privateUser3.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(privateUser3.address),
            []
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            privateUser3.address,
            1,
            ERC20Amount,
            ERC20Mock.address,
            publicUser1.address
          );

        tx = await BOTV1.setPublicSale(true);
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            discountUser1.address,
            1,
            ERC20Mock.address,
            privateListMerkleProof(discountUser1.address),
            []
          )
        )
          .to.emit(BOTV1, "Mint")
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

          BOTV1
        } = await loadFixture(activeSaleFixture);

        let discount = BigNumber.from(ERC20Amount).div(2);

        await expect(
          BOTV1.connect(publicUser1).mint(
            discountUser1.address,
            2,
            ERC20Mock.address,
            [],
            discountMerkleProof(discountUser1.address)
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            discountUser1.address,
            2,
            BigNumber.from(ERC20Amount).mul(2).sub(discount),
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV1.connect(publicUser1).mint(
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

        let tx = await BOTV1.setPrice(ZERO_ADDRESS, true, value);
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
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
          BOTV1.connect(publicUser1).mint(
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
          BOTV1.connect(publicUser1).mint(
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

          BOTV1
        } = await loadFixture(activeSaleFixture);

        let discount = BigNumber.from(ERC20Amount).div(2);

        await expect(
          BOTV1.connect(publicUser1).mint(
            discountUser1.address,
            2,
            ERC20Mock.address,
            [],
            discountMerkleProof(discountUser1.address)
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            discountUser1.address,
            2,
            BigNumber.from(ERC20Amount).mul(2).sub(discount),
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV1.connect(publicUser1).mint(
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

        let tx = await BOTV1.setPrice(ZERO_ADDRESS, true, value);
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
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
          BOTV1.connect(publicUser1).mint(
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
          BOTV1.connect(publicUser1).mint(
            discountUser2.address,
            1,
            ZERO_ADDRESS,
            [],
            discountMerkleProof(discountUser2.address),
            { value: BigNumber.from(value).div(2) }
          )
        ).to.be.revertedWithCustomError(BOTV1, "AmountValueTooLow");

        await expect(
          BOTV1.connect(publicUser1).mint(
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

          BOTV1
        } = await loadFixture(activeSaleFixture);

        await expect(
          BOTV1.connect(publicUser1).mint(
            publicUser2.address,
            2,
            ERC20Mock.address,
            [],
            discountMerkleProof(publicUser2.address)
          )
        )
          .to.emit(BOTV1, "Mint")
          .withArgs(
            publicUser2.address,
            2,
            BigNumber.from(ERC20Amount).mul(2),
            ERC20Mock.address,
            publicUser1.address
          );

        await expect(
          BOTV1.connect(publicUser1).mint(
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

        let tx = await BOTV1.setPrice(ZERO_ADDRESS, true, value);
        await tx.wait();

        await expect(
          BOTV1.connect(publicUser1).mint(
            privateUser1.address,
            1,
            ZERO_ADDRESS,
            [],
            discountMerkleProof(privateUser1.address),
            { value: BigNumber.from(value).div(2) }
          )
        ).to.be.revertedWithCustomError(BOTV1, "AmountValueTooLow");

        await expect(
          BOTV1.connect(publicUser1).mint(
            privateUser1.address,
            1,
            ZERO_ADDRESS,
            [],
            discountMerkleProof(discountUser1.address),
            { value: BigNumber.from(value).div(2) }
          )
        ).to.be.revertedWithCustomError(BOTV1, "AmountValueTooLow");

        await expect(
          BOTV1.connect(publicUser1).mint(
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

  describe("Metadata reveal", async function () {
    it("Should give prereveal metadata for minted token as randomNumber is 0", async function () {
      const { BOTV1, quantity } = await loadFixture(afterOneSaleFixture);

      expect(await BOTV1.tokenURI(0)).to.be.equal(`${BASE_URI}prereveal`);
      expect(await BOTV1.tokenURI(1)).to.be.equal(`${BASE_URI}prereveal`);
      await expect(BOTV1.tokenURI(quantity)).to.be.revertedWithCustomError(
        BOTV1,
        "URIQueryForNonexistentToken"
      );
    });

    it("Should give random metadata once reveal function is executed", async function () {
      const { BOTV1, quantity, vrfCoordinatorV2Mock, subscriptionId, keyHash } =
        await loadFixture(afterOneSaleFixture);

      await expect(BOTV1.reveal(keyHash, subscriptionId, 40000)).to.emit(
        vrfCoordinatorV2Mock,
        "RandomWordsRequested"
      );
      const requestId = await BOTV1.requestId();

      await expect(
        vrfCoordinatorV2Mock.fulfillRandomWords(requestId, BOTV1.address)
      ).to.emit(BOTV1, "RevealRandomNumber");

      const randomNumber = await BOTV1.randomNumber();

      const tokenUri0 = `${BASE_URI}${BigNumber.from(randomNumber).mod(
        MAX_SUPPLY
      )}`;
      expect(await BOTV1.tokenURI(0)).to.be.equal(tokenUri0);
      const tokenUri1 = `${BASE_URI}${BigNumber.from(randomNumber)
        .add(1)
        .mod(MAX_SUPPLY)}`;
      expect(await BOTV1.tokenURI(1)).to.be.equal(tokenUri1);
      const tokenUriLast = `${BASE_URI}${BigNumber.from(randomNumber)
        .add(quantity - 1)
        .mod(MAX_SUPPLY)}`;
      expect(await BOTV1.tokenURI(quantity - 1)).to.be.equal(tokenUriLast);

      await expect(BOTV1.tokenURI(quantity)).to.be.revertedWithCustomError(
        BOTV1,
        "URIQueryForNonexistentToken"
      );
    });

    it("Should revert if `reveal` function is executed more than once", async function () {
      const { BOTV1, vrfCoordinatorV2Mock, subscriptionId, keyHash } =
        await loadFixture(afterOneSaleFixture);

      await expect(BOTV1.reveal(keyHash, subscriptionId, 40000)).to.emit(
        vrfCoordinatorV2Mock,
        "RandomWordsRequested"
      );

      await expect(
        BOTV1.reveal(keyHash, subscriptionId, 40000)
      ).to.be.revertedWithCustomError(BOTV1, "RevealAlreadyRequested");

      const requestId = await BOTV1.requestId();

      await expect(
        vrfCoordinatorV2Mock.fulfillRandomWords(requestId, BOTV1.address)
      ).to.emit(BOTV1, "RevealRandomNumber");

      await expect(BOTV1.resetVrfRequest()).to.be.revertedWithCustomError(
        BOTV1,
        "AlreadyRevealed"
      );
    });

    describe("Chainlink errors", async function () {
      it("Should be able to retry if is not funded", async function () {
        const { BOTV1, vrfCoordinatorV2Mock, keyHash } = await loadFixture(
          initFixture
        );

        let tx = await vrfCoordinatorV2Mock.createSubscription();
        const transactionReceipt = await tx.wait();
        const subscriptionId2 = BigNumber.from(
          transactionReceipt.events[0].topics[1]
        );
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId2, BOTV1.address);

        await expect(BOTV1.reveal(keyHash, subscriptionId2, 40000)).to.not.be
          .reverted;

        let requestId = await BOTV1.requestId();

        await expect(
          vrfCoordinatorV2Mock.fulfillRandomWords(requestId, BOTV1.address)
        ).to.be.reverted;

        tx = await vrfCoordinatorV2Mock.fundSubscription(
          subscriptionId2,
          parseEther("7")
        );
        await tx.wait();

        tx = await BOTV1.resetVrfRequest();
        await tx.wait();

        await expect(BOTV1.reveal(keyHash, subscriptionId2, 40000)).to.emit(
          vrfCoordinatorV2Mock,
          "RandomWordsRequested"
        );
        requestId = await BOTV1.requestId();

        await expect(
          vrfCoordinatorV2Mock.fulfillRandomWords(requestId, BOTV1.address)
        ).to.emit(BOTV1, "RevealRandomNumber");
      });

      it("Should be able to retry if not added as consumer", async function () {
        const { BOTV1, vrfCoordinatorV2Mock, keyHash } = await loadFixture(
          initFixture
        );

        let tx = await vrfCoordinatorV2Mock.createSubscription();
        const transactionReceipt = await tx.wait();
        const subscriptionId2 = BigNumber.from(
          transactionReceipt.events[0].topics[1]
        );
        tx = await vrfCoordinatorV2Mock.fundSubscription(
          subscriptionId2,
          parseEther("7")
        );
        await tx.wait();

        await expect(BOTV1.reveal(keyHash, subscriptionId2, 40000)).to.be
          .reverted;

        await vrfCoordinatorV2Mock.addConsumer(subscriptionId2, BOTV1.address);

        await expect(BOTV1.reveal(keyHash, subscriptionId2, 40000)).to.emit(
          vrfCoordinatorV2Mock,
          "RandomWordsRequested"
        );
        let requestId = await BOTV1.requestId();

        await expect(
          vrfCoordinatorV2Mock.fulfillRandomWords(requestId, BOTV1.address)
        ).to.emit(BOTV1, "RevealRandomNumber");
      });

      it("Should be able to retry if bad subscription", async function () {
        const { BOTV1, vrfCoordinatorV2Mock, subscriptionId, keyHash } =
          await loadFixture(initFixture);

        await expect(BOTV1.reveal(keyHash, 40000, 40000)).to.be.reverted;

        await expect(BOTV1.reveal(keyHash, subscriptionId, 40000)).to.emit(
          vrfCoordinatorV2Mock,
          "RandomWordsRequested"
        );
        const requestId = await BOTV1.requestId();

        await expect(
          vrfCoordinatorV2Mock.fulfillRandomWords(requestId, BOTV1.address)
        ).to.emit(BOTV1, "RevealRandomNumber");
      });

      it("Should be able to retry if callbackGasLimit is too low", async function () {
        const { BOTV1, vrfCoordinatorV2Mock, subscriptionId, keyHash } =
          await loadFixture(initFixture);

        await expect(BOTV1.reveal(keyHash, subscriptionId, 10000)).to.emit(
          vrfCoordinatorV2Mock,
          "RandomWordsRequested"
        );

        let requestId = await BOTV1.requestId();

        await expect(
          vrfCoordinatorV2Mock.fulfillRandomWords(requestId, BOTV1.address)
        ).to.not.emit(BOTV1, "RevealRandomNumber");

        let tx = await BOTV1.resetVrfRequest();
        await tx.wait();

        await expect(BOTV1.reveal(keyHash, subscriptionId, 40000)).to.emit(
          vrfCoordinatorV2Mock,
          "RandomWordsRequested"
        );
        requestId = await BOTV1.requestId();

        await expect(
          vrfCoordinatorV2Mock.fulfillRandomWords(requestId, BOTV1.address)
        ).to.emit(BOTV1, "RevealRandomNumber");
      });
    });
  });

  describe("$BUFA Rewards", async function () {
    it("Should not allow rewarding if not revealed", async function () {
      const {
        publicUser1,
        BUFAUnits,
        BUFA,
        BOTV1,
        vrfCoordinatorV2Mock,
        subscriptionId,
        keyHash
      } = await loadFixture(afterOneSaleFixture);

      const tokenIds = [0, 1, 2, 3, 4]; // quantity = 5

      const metadataIds = [944, 945, 946, 947, 948];

      // bufaRewardsPerDay = [100,75,150,150,75] => 550 for increaseTime = 86400 (1 day)

      const bufaPerDay = metadataIds.map(
        (m) => bufaRewardsMerkle[m].bufaPerDay
      );
      const merkleProofs = metadataIds.map(
        (m) => bufaRewardsMerkle[m].merkleProofs
      );

      const increasedTime = 86400;

      await time.increase(increasedTime);

      await expect(
        BOTV1.availableRewards(
          publicUser1.address,
          tokenIds,
          bufaPerDay,
          merkleProofs
        )
      ).to.revertedWithCustomError(BOTV1, "NotRevealed");

      await expect(
        BOTV1.claimRewards(
          publicUser1.address,
          tokenIds,
          bufaPerDay,
          merkleProofs
        )
      ).to.revertedWithCustomError(BOTV1, "NotRevealed");

      expect(await BUFA.balanceOf(publicUser1.address)).to.equal(0);

      await expect(BOTV1.reveal(keyHash, subscriptionId, 40000));
      const requestId = await BOTV1.requestId();
      await vrfCoordinatorV2Mock.fulfillRandomWords(requestId, BOTV1.address);

      await time.increase(increasedTime);

      const rewardsAmount = await BOTV1.availableRewards(
        publicUser1.address,
        tokenIds,
        bufaPerDay,
        merkleProofs
      );

      expect(BigNumber.from(rewardsAmount).div(BUFAUnits)).to.equal(550 * 2);

      await expect(
        BOTV1.claimRewards(
          publicUser1.address,
          tokenIds,
          bufaPerDay,
          merkleProofs
        )
      ).to.emit(BUFA, "Transfer");

      let BUFABalance = await BUFA.balanceOf(publicUser1.address);
      expect(rewardsAmount).to.be.closeTo(BUFABalance, BUFAUnits);
    });

    it("Should get rewards according holding period and rarity rank", async function () {
      const {
        BOTV1,
        BUFA,
        publicUser1,
        BUFAUnits,
        tokenIds,
        bufaPerDay,
        merkleProofs,
        increasedTime
      } = await loadFixture(onceRevealed);

      const rewardsAmount = await BOTV1.availableRewards(
        publicUser1.address,
        tokenIds,
        bufaPerDay,
        merkleProofs
      );

      expect(BigNumber.from(rewardsAmount).div(BUFAUnits)).to.equal(550);

      await expect(
        BOTV1.claimRewards(
          publicUser1.address,
          [0],
          [100],
          [bufaRewardsMerkle[944].merkleProofs]
        )
      ).to.emit(BUFA, "Transfer");

      await expect(
        BOTV1.claimRewards(
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
        BOTV1.claimRewards(
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
        BOTV1.claimRewards(
          publicUser1.address,
          [0],
          [100],
          [bufaRewardsMerkle[944].merkleProofs]
        )
      ).to.emit(BUFA, "Transfer");

      expect(rewardsAmount.mul(3).div(2).add(700)).to.be.closeTo(
        BUFABalance,
        BUFAUnits
      );
    });

    it("Should revert if bufaRewards value is not correct", async function () {
      const { BOTV1, BUFA, publicUser1, tokenIds, bufaPerDay, merkleProofs } =
        await loadFixture(onceRevealed);

      const newBufaPerDays = [...bufaPerDay];
      newBufaPerDays[2] = 1000;

      await expect(
        BOTV1.availableRewards(
          publicUser1.address,
          tokenIds,
          newBufaPerDays,
          merkleProofs
        )
      )
        .to.revertedWithCustomError(BOTV1, "InvalidRewardsForToken")
        .withArgs(tokenIds[2], 946, 1000);

      await expect(
        BOTV1.claimRewards(
          publicUser1.address,
          tokenIds,
          newBufaPerDays,
          merkleProofs
        )
      )
        .to.revertedWithCustomError(BOTV1, "InvalidRewardsForToken")
        .withArgs(tokenIds[2], 946, 1000);

      expect(await BUFA.balanceOf(publicUser1.address)).to.equal(0);
    });

    it("Should revert if tokenId does not exist", async function () {
      const { BOTV1, BUFA, publicUser1, tokenIds, bufaPerDay, merkleProofs } =
        await loadFixture(onceRevealed);

      const newTokenIds = [...tokenIds];
      newTokenIds[2] = 900;

      await expect(
        BOTV1.availableRewards(
          publicUser1.address,
          newTokenIds,
          bufaPerDay,
          merkleProofs
        )
      ).to.revertedWithCustomError(BOTV1, "OwnerQueryForNonexistentToken");

      await expect(
        BOTV1.claimRewards(
          publicUser1.address,
          newTokenIds,
          bufaPerDay,
          merkleProofs
        )
      ).to.revertedWithCustomError(BOTV1, "OwnerQueryForNonexistentToken");

      expect(await BUFA.balanceOf(publicUser1.address)).to.equal(0);
    });

    it("Should revert if not owner", async function () {
      const {
        BOTV1,
        BUFA,
        deployer,
        publicUser1,
        BUFAUnits,
        tokenIds,
        bufaPerDay,
        merkleProofs
      } = await loadFixture(onceRevealed);

      await expect(
        BOTV1.connect(publicUser1).availableRewards(
          deployer.address,
          tokenIds,
          bufaPerDay,
          merkleProofs
        )
      )
        .to.revertedWithCustomError(BOTV1, "NotOwner")
        .withArgs(deployer.address, tokenIds[0]);

      await expect(
        BOTV1.connect(publicUser1).claimRewards(
          deployer.address,
          tokenIds,
          bufaPerDay,
          merkleProofs
        )
      )
        .to.revertedWithCustomError(BOTV1, "NotOwner")
        .withArgs(deployer.address, tokenIds[0]);
      expect(await BUFA.balanceOf(deployer.address)).to.equal(0);
      expect(await BUFA.balanceOf(publicUser1.address)).to.equal(0);

      await BOTV1.connect(publicUser1).claimRewards(
        publicUser1.address,
        tokenIds,
        bufaPerDay,
        merkleProofs
      );

      expect(await BUFA.balanceOf(deployer.address)).to.equal(0);
      expect(
        (await BUFA.balanceOf(publicUser1.address)).div(BUFAUnits)
      ).to.equal(550);
    });

    it("Should reset on transfer", async function () {
      const {
        BOTV1,
        BUFA,
        publicUser1,
        publicUser2,
        BUFAUnits,
        tokenIds,
        bufaPerDay,
        merkleProofs,
        increasedTime
      } = await loadFixture(onceRevealed);

      const rewardsAmount = await BOTV1.availableRewards(
        publicUser1.address,
        tokenIds,
        bufaPerDay,
        merkleProofs
      );

      expect(BigNumber.from(rewardsAmount).div(BUFAUnits)).to.equal(550);

      expect(await BOTV1.ownerOf(0)).to.equal(publicUser1.address);
      expect(await BOTV1.ownerOf(1)).to.equal(publicUser1.address);
      expect(await BOTV1.ownerOf(2)).to.equal(publicUser1.address);

      await BOTV1.connect(publicUser1)[
        "safeTransferFrom(address,address,uint256)"
      ](publicUser1.address, publicUser2.address, 0);

      await BOTV1.connect(publicUser1).transferFrom(
        publicUser1.address,
        publicUser2.address,
        1
      );

      expect(await BOTV1.ownerOf(0)).to.equal(publicUser2.address);
      expect(await BOTV1.ownerOf(1)).to.equal(publicUser2.address);
      expect(await BOTV1.ownerOf(2)).to.equal(publicUser1.address);

      await expect(
        BOTV1.connect(publicUser1).availableRewards(
          publicUser1.address,
          tokenIds,
          bufaPerDay,
          merkleProofs
        )
      )
        .to.revertedWithCustomError(BOTV1, "NotOwner")
        .withArgs(publicUser1.address, tokenIds[0]);

      const [tokenId0, tokenId1, ...otherTokenIds] = tokenIds;
      const [bufaPerDay0, bufaPerDay1, ...otherBufaPerDays] = bufaPerDay;
      const [merkleProofs0, merkleProofs1, ...othermerkleProofs] = merkleProofs;

      await BOTV1.connect(publicUser1).claimRewards(
        publicUser1.address,
        otherTokenIds,
        otherBufaPerDays,
        othermerkleProofs
      );

      await BOTV1.connect(publicUser1).claimRewards(
        publicUser2.address,
        [tokenId0, tokenId1],
        [bufaPerDay0, bufaPerDay1],
        [merkleProofs0, merkleProofs1]
      );

      expect(
        BigNumber.from(await BUFA.balanceOf(publicUser1.address)).div(BUFAUnits)
      ).to.equal(550 - 100 - 75);

      expect(await BUFA.balanceOf(publicUser2.address)).to.be.closeTo(
        0,
        BUFAUnits
      );

      time.increase(increasedTime);

      await BOTV1.connect(publicUser1).claimRewards(
        publicUser1.address,
        otherTokenIds,
        otherBufaPerDays,
        othermerkleProofs
      );

      await BOTV1.connect(publicUser2).claimRewards(
        publicUser2.address,
        [tokenId0],
        [bufaPerDay0],
        [merkleProofs0]
      );

      expect(
        BigNumber.from(await BUFA.balanceOf(publicUser1.address)).div(BUFAUnits)
      ).to.equal((550 - 100 - 75) * 2);

      expect(
        BigNumber.from(await BUFA.balanceOf(publicUser2.address)).div(BUFAUnits)
      ).to.equal(100);

      await BOTV1.connect(publicUser2).claimRewards(
        publicUser2.address,
        [tokenId1],
        [bufaPerDay1],
        [merkleProofs1]
      );

      expect(
        BigNumber.from(await BUFA.balanceOf(publicUser2.address)).div(BUFAUnits)
      ).to.equal(100 + 75);

      time.increase(increasedTime * 1.5);

      await BOTV1.connect(publicUser2).claimRewards(
        publicUser2.address,
        [tokenId1, tokenId0],
        [bufaPerDay1, bufaPerDay0],
        [merkleProofs1, merkleProofs0]
      );

      expect(
        BigNumber.from(await BUFA.balanceOf(publicUser2.address)).div(BUFAUnits)
      ).to.be.closeTo(Math.trunc((100 + 75) * 2.5), 1);
    });

    it("Should ignore token provided multiples times", async function () {
      const {
        BOTV1,
        BUFA,
        publicUser1,
        BUFAUnits,
        tokenIds,
        bufaPerDay,
        merkleProofs
      } = await loadFixture(onceRevealed);

      await expect(
        BOTV1.availableRewards(
          publicUser1.address,
          [tokenIds[2], ...tokenIds],
          [bufaPerDay[2], ...bufaPerDay],
          [merkleProofs[2], ...merkleProofs]
        )
      )
        .to.revertedWithCustomError(BOTV1, "TokenGivenTwice")
        .withArgs(tokenIds[2]);

      await expect(
        BOTV1.claimRewards(
          publicUser1.address,
          [tokenIds[2], ...tokenIds],
          [bufaPerDay[2], ...bufaPerDay],
          [merkleProofs[2], ...merkleProofs]
        )
      ).to.emit(BUFA, "Transfer");

      await expect(
        BOTV1.claimRewards(
          publicUser1.address,
          [...tokenIds, tokenIds[2]],
          [...bufaPerDay, bufaPerDay[2]],
          [...merkleProofs, merkleProofs[2]]
        )
      ).to.emit(BUFA, "Transfer");

      expect(
        (await BUFA.balanceOf(publicUser1.address)).div(BUFAUnits)
      ).to.equal(550);
    });
  });

  describe("Protected operations", async function () {
    async function testProtectedFunction(functionName, functionArgs) {
      const { BOTV1, publicUser1 } = await loadFixture(initFixture);
      await expect(BOTV1[functionName](...functionArgs)).to.not.be.reverted;
      await expect(
        BOTV1.connect(publicUser1)[functionName](...functionArgs)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    }

    it("Should revert if `mintForFree` function is not executed by owner", async function () {
      await testProtectedFunction("mintForFree", [
        ["0x64E8f7C2B4fd33f5E8470F3C6Df04974F90fc2cA"],
        [1]
      ]);
    });

    it("Should revert if `resetVrfRequest` function is not executed by owner", async function () {
      await testProtectedFunction("resetVrfRequest", []);
    });

    it("Should revert if `reveal` function is not executed by owner", async function () {
      await testProtectedFunction("reveal", [
        "0xd89b2bf150e3b9e13446986e571fb9cab24b13cea0a43ea20a6049a85cc807cc",
        1,
        40000
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
  });
});

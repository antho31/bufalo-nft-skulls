const { ethers } = require('hardhat')
const {
  //  time,
  loadFixture
} = require('@nomicfoundation/hardhat-network-helpers')
// const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs')
const { expect } = require('chai')
const {
  // keccak256, toUtf8Bytes, toUtf8String ,
  parseEther
} = require('ethers/lib/utils')
const {
  constants: { ZERO_ADDRESS }
} = require('@openzeppelin/test-helpers')
const { BigNumber } = require('ethers')

describe('DSponsorNFT', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  async function initFixture() {
    const signers = await ethers.getSigners()

    const [deployer, controller, treasury, owner1, owner2, user1, user2] =
      signers

    const ERC20Amount = BigNumber.from('100')

    const ERC20MockDeployer = await ethers.getContractFactory('ERC20Mock')
    const ERC20Mock = await ERC20MockDeployer.deploy()

    const ReentrantDeployer = await ethers.getContractFactory('Reentrant')
    const Reentrant = await ReentrantDeployer.deploy()

    const ERC721MockDeployer = await ethers.getContractFactory('ERC721Mock')
    const ERC721Mock = await ERC721MockDeployer.deploy()

    let tx
    for (let { address } of signers) {
      tx = await ERC20Mock.mint(address, 10 * ERC20Amount)
      await tx.wait()
    }

    const name = 'DSponsorNFT-test'
    const symbol = 'DNFTTEST'
    const maxSupply = 5

    const DSponsorNFTDeployer = await ethers.getContractFactory('DSponsorNFT')
    const DSponsorNFT = await DSponsorNFTDeployer.deploy(
      name,
      symbol,
      maxSupply,
      controller.address,
      treasury.address
    )

    tx = await DSponsorNFT.connect(controller).setPrice(
      ERC20Mock.address,
      true,
      ERC20Amount
    )
    await tx.wait()

    tx = await ERC20Mock.approve(DSponsorNFT.address, ERC20Amount * 2)
    await tx.wait()

    tx = await DSponsorNFT.payAndMint(ERC20Mock.address, owner1.address, '')
    await tx.wait()

    const DSponsorDeployer = await ethers.getContractFactory('DSponsor')
    const DSponsorContract = await DSponsorDeployer.deploy(
      ERC721Mock.address,
      'rulesURI',
      controller.address
    )

    return {
      deployer,
      controller,
      treasury,
      owner1,
      owner2,
      user1,
      user2,

      ERC20Amount,

      name,
      symbol,
      maxSupply,
      tokenId: 0,

      ERC20Mock,
      ERC721Mock,

      DSponsorNFT,
      DSponsorNFTDeployer,

      DSponsorContract,
      Reentrant
    }
  }

  describe('Deployment', async function () {
    it('Should support ERC2981 and ERC721 interfaces', async function () {
      const { DSponsorNFT } = await loadFixture(initFixture)

      const supportsDummy = await DSponsorNFT.supportsInterface('0x80ac58cf')

      // interfaceID == 0x4e2312e0 -  ERC-1155 `ERC1155TokenReceiver` support (i.e. `bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)")) ^ bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"))`).
      const supportsERC1555 = await DSponsorNFT.supportsInterface('0x4e2312e0')

      const supportsERC165 = await DSponsorNFT.supportsInterface('0x01ffc9a7')

      const supportsERC20 = await DSponsorNFT.supportsInterface('0x36372b07')

      const supportsERC2981 = await DSponsorNFT.supportsInterface('0x2a55205a')

      const supportsERC721 = await DSponsorNFT.supportsInterface('0x80ac58cd')

      const supportsERC721Enumerable = await DSponsorNFT.supportsInterface(
        '0x780e9d63'
      )

      const supportsERC721Metadata = await DSponsorNFT.supportsInterface(
        '0x5b5e139f'
      )

      expect(supportsDummy).to.equal(false)
      expect(supportsERC1555).to.equal(false)
      expect(supportsERC165).to.equal(true)
      expect(supportsERC20).to.equal(false)
      expect(supportsERC2981).to.equal(true)
      expect(supportsERC721).to.equal(true)
      expect(supportsERC721Enumerable).to.equal(false)
      expect(supportsERC721Metadata).to.equal(true)
    })

    it('Fails if invalid arguments (zero address, max supply == 0) in constructor', async function () {
      const { deployer, treasury, DSponsorNFT, DSponsorNFTDeployer } =
        await loadFixture(initFixture)

      await expect(
        DSponsorNFTDeployer.deploy(
          'test',
          'test',
          1,
          ZERO_ADDRESS,
          treasury.address
        )
      ).to.be.revertedWithCustomError(DSponsorNFT, 'CannotBeZeroAddress')

      await expect(
        DSponsorNFTDeployer.deploy(
          'test',
          'test',
          1,
          deployer.address,
          ZERO_ADDRESS
        )
      ).to.be.revertedWithCustomError(DSponsorNFT, 'CannotBeZeroAddress')

      await expect(
        DSponsorNFTDeployer.deploy(
          'test',
          'test',
          0,
          deployer.address,
          treasury.address
        )
      ).to.be.revertedWithCustomError(
        DSponsorNFT,
        'MaxSupplyShouldBeGreaterThan0'
      )
    })
  })

  describe('NFT Minting', async function () {
    it('Mints with ERC20 currency', async function () {
      const { owner2, user2, treasury, ERC20Amount, ERC20Mock, DSponsorNFT } =
        await loadFixture(initFixture)
      const referralData = 'referralData'
      const tokenId = 1

      const totalSupply = await DSponsorNFT.totalSupply()

      const ERC20balanceOfOwner2 = await ERC20Mock.balanceOf(owner2.address)
      const ERC20balanceOfUser2 = await ERC20Mock.balanceOf(user2.address)
      const ERC20balanceOfTreasury = await ERC20Mock.balanceOf(treasury.address)

      const NFTbalanceOfOwner2 = await DSponsorNFT.balanceOf(owner2.address)
      const NFTbalanceOfUser2 = await DSponsorNFT.balanceOf(user2.address)
      const NFTbalanceOfTreasury = await DSponsorNFT.balanceOf(treasury.address)

      const tx = await ERC20Mock.connect(user2).approve(
        DSponsorNFT.address,
        ERC20Amount * 20
      )
      await tx.wait()

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ERC20Mock.address,
          owner2.address,
          referralData
        )
      )
        .to.emit(DSponsorNFT, 'Mint')
        .withArgs(
          ERC20Mock.address,
          ERC20Amount,
          owner2.address,
          referralData,
          user2.address,
          tokenId
        )

      expect(await ERC20Mock.balanceOf(owner2.address)).to.be.equal(
        ERC20balanceOfOwner2
      )

      expect(await ERC20Mock.balanceOf(user2.address)).to.be.equal(
        ERC20balanceOfUser2.sub(ERC20Amount)
      )

      expect(await ERC20Mock.balanceOf(treasury.address)).to.be.equal(
        ERC20balanceOfTreasury.add(ERC20Amount)
      )

      expect(await DSponsorNFT.balanceOf(owner2.address)).to.be.equal(
        NFTbalanceOfOwner2.add(1)
      )

      expect(await DSponsorNFT.balanceOf(user2.address)).to.be.equal(
        NFTbalanceOfUser2
      )

      expect(await DSponsorNFT.balanceOf(treasury.address)).to.be.equal(
        NFTbalanceOfTreasury
      )

      expect(await DSponsorNFT.totalSupply()).to.be.equal(totalSupply.add(1))

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ERC20Mock.address,
          owner2.address,
          referralData
        )
      ).to.changeTokenBalances(
        ERC20Mock,
        [user2.address, treasury.address, owner2.address],
        [-ERC20Amount, ERC20Amount, 0]
      )

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ERC20Mock.address,
          owner2.address,
          referralData
        )
      ).to.changeTokenBalances(
        DSponsorNFT,
        [user2.address, treasury.address, owner2.address],
        [0, 0, 1]
      )
    })

    it('Mints with native currency', async function () {
      const { controller, owner2, user2, treasury, DSponsorNFT } =
        await loadFixture(initFixture)
      const referralData = 'referralData'
      const tokenId = 1

      const totalSupply = await DSponsorNFT.totalSupply()

      const etherValue = '0.05'
      const value = parseEther(etherValue)

      const EtherBalanceOfOwner2 = await ethers.provider.getBalance(
        owner2.address
      )

      const NFTbalanceOfOwner2 = await DSponsorNFT.balanceOf(owner2.address)
      const NFTbalanceOfUser2 = await DSponsorNFT.balanceOf(user2.address)
      const NFTbalanceOfTreasury = await DSponsorNFT.balanceOf(treasury.address)

      let tx = await DSponsorNFT.connect(controller).setPrice(
        ZERO_ADDRESS,
        true,
        value
      )
      await tx.wait()

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ZERO_ADDRESS,
          owner2.address,
          referralData,
          { value }
        )
      )
        .to.emit(DSponsorNFT, 'Mint')
        .withArgs(
          ZERO_ADDRESS,
          value,
          owner2.address,
          referralData,
          user2.address,
          tokenId
        )

      expect(await ethers.provider.getBalance(owner2.address)).to.be.equal(
        EtherBalanceOfOwner2
      )

      expect(await DSponsorNFT.balanceOf(owner2.address)).to.be.equal(
        NFTbalanceOfOwner2.add(1)
      )

      expect(await DSponsorNFT.balanceOf(user2.address)).to.be.equal(
        NFTbalanceOfUser2
      )

      expect(await DSponsorNFT.balanceOf(treasury.address)).to.be.equal(
        NFTbalanceOfTreasury
      )

      expect(await DSponsorNFT.totalSupply()).to.be.equal(totalSupply.add(1))

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ZERO_ADDRESS,
          owner2.address,
          referralData,
          { value }
        )
      ).to.changeEtherBalances(
        [user2.address, treasury.address],
        [parseEther(`-${etherValue}`), value]
      )

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ZERO_ADDRESS,
          owner2.address,
          referralData,
          { value }
        )
      ).to.changeTokenBalances(
        DSponsorNFT,
        [user2.address, treasury.address, owner2.address],
        [0, 0, 1]
      )
    })

    it('Can be minted for free', async function () {
      const { owner2, user2, treasury, controller, ERC20Mock, DSponsorNFT } =
        await loadFixture(initFixture)
      const referralData = 'referralData'
      const tokenId = 1

      const totalSupply = await DSponsorNFT.totalSupply()

      const ERC20balanceOfUser2 = await ERC20Mock.balanceOf(user2.address)
      const ERC20balanceOfTreasury = await ERC20Mock.balanceOf(treasury.address)

      const NFTbalanceOfOwner2 = await DSponsorNFT.balanceOf(owner2.address)
      const NFTbalanceOfUser2 = await DSponsorNFT.balanceOf(user2.address)
      const NFTbalanceOfTreasury = await DSponsorNFT.balanceOf(treasury.address)

      let tx = await DSponsorNFT.connect(controller).setPrice(
        ERC20Mock.address,
        true,
        0
      )
      await tx.wait()

      tx = await DSponsorNFT.connect(controller).setPrice(ZERO_ADDRESS, true, 0)
      await tx.wait()

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ZERO_ADDRESS,
          owner2.address,
          referralData
        )
      )
        .to.emit(DSponsorNFT, 'Mint')
        .withArgs(
          ZERO_ADDRESS,
          0,
          owner2.address,
          referralData,
          user2.address,
          tokenId
        )

      tx = await DSponsorNFT.connect(controller).setPrice(ZERO_ADDRESS, true, 0)
      await tx.wait()

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ERC20Mock.address,
          owner2.address,
          referralData
        )
      )
        .to.emit(DSponsorNFT, 'Mint')
        .withArgs(
          ERC20Mock.address,
          0,
          owner2.address,
          referralData,
          user2.address,
          tokenId + 1
        )

      expect(await ERC20Mock.balanceOf(user2.address)).to.be.equal(
        ERC20balanceOfUser2
      )

      expect(await ERC20Mock.balanceOf(treasury.address)).to.be.equal(
        ERC20balanceOfTreasury
      )

      expect(await DSponsorNFT.balanceOf(owner2.address)).to.be.equal(
        NFTbalanceOfOwner2.add(2)
      )

      expect(await DSponsorNFT.balanceOf(user2.address)).to.be.equal(
        NFTbalanceOfUser2
      )

      expect(await DSponsorNFT.balanceOf(treasury.address)).to.be.equal(
        NFTbalanceOfTreasury
      )

      expect(await DSponsorNFT.totalSupply()).to.be.equal(totalSupply.add(2))

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ERC20Mock.address,
          owner2.address,
          referralData
        )
      ).to.changeTokenBalances(
        ERC20Mock,
        [user2.address, treasury.address, owner2.address],
        [0, 0, 0]
      )

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ERC20Mock.address,
          owner2.address,
          referralData
        )
      ).to.changeTokenBalances(
        DSponsorNFT,
        [user2.address, treasury.address, owner2.address],
        [0, 0, 1]
      )
    })

    it('Reverts if not enough available amount to spend', async function () {
      const {
        controller,
        owner2,
        user2,
        treasury,
        DSponsorNFT,
        ERC20Amount,
        ERC20Mock
      } = await loadFixture(initFixture)
      const referralData = 'referralData'

      const totalSupply = await DSponsorNFT.totalSupply()

      const ERC20balanceOfUser2 = await ERC20Mock.balanceOf(user2.address)

      const NFTbalanceOfOwner2 = await DSponsorNFT.balanceOf(owner2.address)
      const NFTbalanceOfUser2 = await DSponsorNFT.balanceOf(user2.address)
      const NFTbalanceOfTreasury = await DSponsorNFT.balanceOf(treasury.address)

      let tx = await DSponsorNFT.connect(controller).setPrice(
        ZERO_ADDRESS,
        true,
        parseEther('0.051')
      )
      await tx.wait()

      tx = await DSponsorNFT.connect(controller).setPrice(
        ERC20Mock.address,
        true,
        ERC20Amount * 1000
      )
      await tx.wait()

      tx = await ERC20Mock.connect(user2).approve(
        DSponsorNFT.address,
        ERC20Amount * 10000
      )
      await tx.wait()

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ZERO_ADDRESS,
          owner2.address,
          referralData,
          { value: parseEther('0.05') }
        )
      ).to.be.revertedWithCustomError(DSponsorNFT, 'AmountValueTooLow')

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          ERC20Mock.address,
          owner2.address,
          referralData
        )
      ).to.be.revertedWith('ERC20: transfer amount exceeds balance')

      expect(await ERC20Mock.balanceOf(user2.address)).to.be.equal(
        ERC20balanceOfUser2
      )
      expect(await DSponsorNFT.balanceOf(owner2.address)).to.be.equal(
        NFTbalanceOfOwner2
      )

      expect(await DSponsorNFT.balanceOf(user2.address)).to.be.equal(
        NFTbalanceOfUser2
      )

      expect(await DSponsorNFT.balanceOf(treasury.address)).to.be.equal(
        NFTbalanceOfTreasury
      )

      expect(await DSponsorNFT.totalSupply()).to.be.equal(totalSupply)
    })

    it('Reverts if arguments are invalid', async function () {
      const { deployer, treasury, ERC20Mock, DSponsorNFTDeployer, user1 } =
        await loadFixture(initFixture)

      const supply = 3
      const contract = await DSponsorNFTDeployer.deploy(
        'test',
        'test',
        supply,
        deployer.address,
        treasury.address
      )

      await expect(
        contract.payAndMint(ERC20Mock.address, ZERO_ADDRESS, '')
      ).to.be.revertedWithCustomError(contract, 'CannotBeZeroAddress')

      await expect(contract.payAndMint(ZERO_ADDRESS, user1.address, ''))
        .to.be.revertedWithCustomError(contract, 'ForbiddenCurrency')
        .withArgs(ZERO_ADDRESS)

      await expect(contract.payAndMint(ERC20Mock.address, user1.address, ''))
        .to.be.revertedWithCustomError(contract, 'ForbiddenCurrency')
        .withArgs(ERC20Mock.address)
    })

    it('Fails if currency is not native and has not transferFrom method', async function () {
      const {
        owner2,
        user2,
        treasury,
        controller,
        DSponsorNFT,
        ERC20Amount,
        DSponsorContract
      } = await loadFixture(initFixture)

      const totalSupply = await DSponsorNFT.totalSupply()

      const NFTbalanceOfOwner2 = await DSponsorNFT.balanceOf(owner2.address)
      const NFTbalanceOfUser2 = await DSponsorNFT.balanceOf(user2.address)
      const NFTbalanceOfTreasury = await DSponsorNFT.balanceOf(treasury.address)

      let tx = await DSponsorNFT.connect(controller).setPrice(
        DSponsorContract.address,
        true,
        ERC20Amount
      )
      await tx.wait()

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          DSponsorContract.address,
          owner2.address,
          'referralData'
        )
      ).to.be.revertedWith('SafeERC20: low-level call failed')

      expect(await DSponsorNFT.balanceOf(owner2.address)).to.be.equal(
        NFTbalanceOfOwner2
      )

      expect(await DSponsorNFT.balanceOf(user2.address)).to.be.equal(
        NFTbalanceOfUser2
      )

      expect(await DSponsorNFT.balanceOf(treasury.address)).to.be.equal(
        NFTbalanceOfTreasury
      )

      expect(await DSponsorNFT.totalSupply()).to.be.equal(totalSupply)
    })

    it('Fails if treasury is a contract with reentrancy attack', async function () {
      const {
        owner2,
        user2,

        controller,
        Reentrant,
        DSponsorNFTDeployer
      } = await loadFixture(initFixture)

      const DSponsorNFT = await DSponsorNFTDeployer.deploy(
        'testreentrant',
        'testreentrant',
        10,
        controller.address,
        Reentrant.address
      )

      const totalSupply = await DSponsorNFT.totalSupply()

      const etherValue = '4.4444444'
      const value = parseEther(etherValue)

      const NFTbalanceOfOwner2 = await DSponsorNFT.balanceOf(owner2.address)
      const NFTbalanceOfUser2 = await DSponsorNFT.balanceOf(user2.address)
      const NFTbalanceOfTreasury = await DSponsorNFT.balanceOf(
        Reentrant.address
      )

      let tx = await DSponsorNFT.connect(controller).setPrice(
        ZERO_ADDRESS,
        true,
        value
      )
      await tx.wait()

      await expect(
        DSponsorNFT.connect(owner2).payAndMint(
          ZERO_ADDRESS,
          owner2.address,
          'referralData',
          { value }
        )
      ).to.be.reverted

      expect(await DSponsorNFT.balanceOf(owner2.address)).to.be.equal(
        NFTbalanceOfOwner2
      )

      expect(await DSponsorNFT.balanceOf(user2.address)).to.be.equal(
        NFTbalanceOfUser2
      )

      expect(await DSponsorNFT.balanceOf(Reentrant.address)).to.be.equal(
        NFTbalanceOfTreasury
      )

      expect(await DSponsorNFT.totalSupply()).to.be.equal(totalSupply)
    })

    it('Fails if currency is a contract with reentrancy attack', async function () {
      const {
        owner2,
        user2,
        treasury,
        controller,
        DSponsorNFT,
        ERC20Amount,
        Reentrant
      } = await loadFixture(initFixture)

      const totalSupply = await DSponsorNFT.totalSupply()

      const NFTbalanceOfOwner2 = await DSponsorNFT.balanceOf(owner2.address)
      const NFTbalanceOfUser2 = await DSponsorNFT.balanceOf(user2.address)
      const NFTbalanceOfTreasury = await DSponsorNFT.balanceOf(treasury.address)

      let tx = await DSponsorNFT.connect(controller).setPrice(
        Reentrant.address,
        true,
        ERC20Amount
      )
      await tx.wait()

      tx = await DSponsorNFT.connect(controller).setPrice(
        ZERO_ADDRESS,
        true,
        ERC20Amount
      )
      await tx.wait()

      await expect(
        DSponsorNFT.connect(user2).payAndMint(
          Reentrant.address,
          owner2.address,
          'referralData'
        )
      ).to.be.revertedWith('ReentrancyGuard: reentrant call')

      expect(await DSponsorNFT.balanceOf(owner2.address)).to.be.equal(
        NFTbalanceOfOwner2
      )

      expect(await DSponsorNFT.balanceOf(user2.address)).to.be.equal(
        NFTbalanceOfUser2
      )

      expect(await DSponsorNFT.balanceOf(treasury.address)).to.be.equal(
        NFTbalanceOfTreasury
      )

      expect(await DSponsorNFT.totalSupply()).to.be.equal(totalSupply)
    })

    it('Reverts if number of tokens exceed MAX_SUPPLY value', async function () {
      const { deployer, treasury, ERC20Mock, DSponsorNFTDeployer, user1 } =
        await loadFixture(initFixture)

      const supply = 3
      const contract = await DSponsorNFTDeployer.deploy(
        'test',
        'test',
        supply,
        deployer.address,
        treasury.address
      )
      const price = 2
      let tx = await contract.setPrice(ERC20Mock.address, true, price)
      await tx.wait()

      tx = await ERC20Mock.approve(contract.address, 1000000)
      await tx.wait()

      for (let i = 0; i < supply; i++) {
        tx = await contract.payAndMint(ERC20Mock.address, user1.address, '')
        await tx.wait()
      }

      await expect(
        contract.payAndMint(ERC20Mock.address, user1.address, '')
      ).to.be.revertedWithCustomError(contract, 'MaxSupplyExceeded')
    })
  })

  describe('Controller operations', async function () {
    it('Fails any controller operation if caller is not controller', async function () {
      const {
        DSponsorNFT,
        owner1,
        ERC20Mock,
        ERC20Amount,
        tokenId,
        controller
      } = await loadFixture(initFixture)

      const controllerAddr = await DSponsorNFT.connect(owner1).getController()

      await expect(
        DSponsorNFT.connect(owner1).setBaseURI('baseURI')
      ).to.be.revertedWithCustomError(
        DSponsorNFT,
        'ForbiddenControllerOperation'
      )

      await expect(
        DSponsorNFT.connect(owner1).setContractURI('contractURI')
      ).to.be.revertedWithCustomError(
        DSponsorNFT,
        'ForbiddenControllerOperation'
      )

      await expect(
        DSponsorNFT.setPrice(ERC20Mock.address, true, ERC20Amount)
      ).to.be.revertedWithCustomError(
        DSponsorNFT,
        'ForbiddenControllerOperation'
      )

      await expect(
        DSponsorNFT.setPrice(ZERO_ADDRESS, true, 100000000)
      ).to.be.revertedWithCustomError(
        DSponsorNFT,
        'ForbiddenControllerOperation'
      )

      await expect(DSponsorNFT.setRoyalty(100)).to.be.revertedWithCustomError(
        DSponsorNFT,
        'ForbiddenControllerOperation'
      )

      await expect(
        DSponsorNFT.connect(owner1).setTokenURI(tokenId, 'baseURI')
      ).to.be.revertedWithCustomError(
        DSponsorNFT,
        'ForbiddenControllerOperation'
      )

      const value = 100
      const tx = await DSponsorNFT.connect(controller).setPrice(
        ZERO_ADDRESS,
        true,
        value
      )
      await tx.wait()

      expect(controllerAddr).to.be.equal(controller.address)
    })

    it('Sets! baseURI, tokenURI & contractURI correctly', async function () {
      const { DSponsorNFT, controller, tokenId } = await loadFixture(
        initFixture
      )

      const maxSupply = await DSponsorNFT.getMaxSupply()

      const baseURI = 'baseURI'
      const contractURI = 'contractURI'
      const tokenURI1 = 'tokenURI1'
      const tokenURI2 = 'tokenURI2'

      let tx = await DSponsorNFT.connect(controller).setBaseURI(baseURI)
      await tx.wait()
      tx = await DSponsorNFT.connect(controller).setContractURI(contractURI)
      await tx.wait()

      expect(await DSponsorNFT.getContractURI()).to.be.equal(contractURI)

      expect(await DSponsorNFT.uri(tokenId)).to.be.equal(baseURI + tokenId)
      expect(await DSponsorNFT.tokenURI(tokenId)).to.be.equal(baseURI + tokenId)

      tx = await DSponsorNFT.connect(controller).setTokenURI(tokenId, tokenURI1)
      await tx.wait()

      tx = await DSponsorNFT.connect(controller).setTokenURI(
        tokenId + 1,
        tokenURI2
      )
      await tx.wait()

      await expect(
        DSponsorNFT.connect(controller).setTokenURI(
          tokenId + maxSupply,
          'maxURI'
        )
      ).to.be.revertedWithCustomError(DSponsorNFT, 'InvalidTokenId')

      expect(await DSponsorNFT.uri(tokenId)).to.be.equal(baseURI + tokenURI1)
      expect(await DSponsorNFT.tokenURI(tokenId)).to.be.equal(
        baseURI + tokenURI1
      )

      tx = await DSponsorNFT.connect(controller).setBaseURI('')
      await tx.wait()

      expect(await DSponsorNFT.uri(tokenId)).to.be.equal(tokenURI1)
      expect(await DSponsorNFT.tokenURI(tokenId)).to.be.equal(tokenURI1)

      await expect(DSponsorNFT.uri(tokenId + 1)).to.be.revertedWith(
        'ERC721: invalid token ID'
      )
      await expect(DSponsorNFT.tokenURI(tokenId + 1)).to.be.revertedWith(
        'ERC721: invalid token ID'
      )
    })

    it('Sets & gets pricing parameters correctly', async function () {
      const { DSponsorNFT, controller, ERC20Mock, ERC721Mock, ERC20Amount } =
        await loadFixture(initFixture)

      expect(
        await DSponsorNFT.getMintPriceForCurrency(ERC20Mock.address)
      ).to.be.deep.equal([true, BigNumber.from(ERC20Amount)])
      expect(
        await DSponsorNFT.getMintPriceForCurrency(ERC721Mock.address)
      ).to.be.deep.equal([false, 0])
      expect(
        await DSponsorNFT.getMintPriceForCurrency(ZERO_ADDRESS)
      ).to.be.deep.equal([false, 0])

      const value = 100
      const newERC20Amount = ERC20Amount + 100

      await expect(
        DSponsorNFT.connect(controller).setPrice(ZERO_ADDRESS, true, value)
      )
        .to.emit(DSponsorNFT, 'MintPriceChange')
        .withArgs(ZERO_ADDRESS, true, value)

      await expect(
        DSponsorNFT.connect(controller).setPrice(
          ERC20Mock.address,
          true,
          newERC20Amount
        )
      )
        .to.emit(DSponsorNFT, 'MintPriceChange')
        .withArgs(ERC20Mock.address, true, newERC20Amount)

      expect(
        await DSponsorNFT.getMintPriceForCurrency(ERC20Mock.address)
      ).to.be.deep.equal([true, BigNumber.from(newERC20Amount)])

      await expect(
        DSponsorNFT.connect(controller).setPrice(
          ERC20Mock.address,
          false,
          newERC20Amount
        )
      )
        .to.emit(DSponsorNFT, 'MintPriceChange')
        .withArgs(ERC20Mock.address, false, newERC20Amount)

        expect(
        await DSponsorNFT.getMintPriceForCurrency(ERC20Mock.address)
      ).to.be.deep.equal([false, BigNumber.from(newERC20Amount)])

      expect(
        await DSponsorNFT.getMintPriceForCurrency(ZERO_ADDRESS)
      ).to.be.deep.equal([true, value])
    })

    it('Sets royalty correctly', async function () {
      const { DSponsorNFT, controller, tokenId } = await loadFixture(
        initFixture
      )

      const treasury = await DSponsorNFT.getTreasury()
      const salePrice = 100

      expect(
        await DSponsorNFT.royaltyInfo(tokenId, salePrice)
      ).to.be.deep.equal([ZERO_ADDRESS, 0])

      const newFee = 500

      let tx = await DSponsorNFT.connect(controller).setRoyalty(newFee)
      await tx.wait()

      expect(
        await DSponsorNFT.royaltyInfo(tokenId, salePrice)
      ).to.be.deep.equal([treasury, 5])
    })
  })
})

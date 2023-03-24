require("dotenv").config();
require("hardhat-contract-sizer");
require("hardhat-gas-reporter");
require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-web3");
require("@nomiclabs/hardhat-etherscan");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.18",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },

  mocha: {
    timeout: 100000000
  },

  networks: {
    hardhat: {
      chainId: 1337
    },
    mumbai: {
      url: process.env.POLYGON_MUMBAI_RPC_PROVIDER,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY]
    },
    polygon: {
      url: process.env.POLYGON_MAINNET_RPC_PROVIDER,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY]
    }
  },

  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY
  },

  gasReporter: {
    enabled: true,

    token: "MATIC",
    gasPriceApi:
      "https://api.polygonscan.com/api?module=proxy&action=eth_gasPrice",

    currency: "EUR",
    coinmarketcap: process.env.COINMARKETCAP_KEY
  }
};

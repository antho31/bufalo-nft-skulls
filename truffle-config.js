require('dotenv').config()

const path = require('path')

const mnemonic = process.env.MNEMONIC

module.exports = {
  contracts_build_directory: path.join(__dirname, 'client/src/contracts'),
  networks: {
    development: {
      host: '127.0.0.1',
      port: 9545,
      network_id: '*'
    },
    matic: {
      provider: () =>
        new HDWalletProvider(mnemonic, `https://rpc-mumbai.maticvigil.com`),
      network_id: 80001,
      confirmations: 2,
      timeoutBlocks: 200,
      skipDryRun: true
    }
  },
  mocha: {},
  compilers: {
    solc: {
      version: '0.8.13'
    }
  },
  db: {
    enabled: false
  }
}

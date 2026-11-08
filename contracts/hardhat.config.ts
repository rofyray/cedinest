import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import 'dotenv/config'

// Default to dRPC: publicnode answers Hardhat's pinned-block state queries with
// 403 "Archive requests require a personal token", so it cannot back a fork.
const RPC = process.env.POLYGON_RPC_URL ?? 'https://polygon.drpc.org'
const config: HardhatUserConfig = {
  solidity: { version: '0.8.24', settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    hardhat: {
      chainId: 137, // keep 137 so the salt and chainId domains match mainnet
      forking: { url: RPC, blockNumber: process.env.FORK_BLOCK ? Number(process.env.FORK_BLOCK) : undefined },
      // EDR has no built-in hardfork history for chain 137, and without one any eth_call at the
      // fork block itself fails ("No known hardfork for execution on historical block").
      // Polygon activations: London = 23_850_000, Shanghai = Agra 50_523_000. Cancun/Prague are
      // deliberately left out: Polygon block headers carry no blob-gas fields and EDR would panic.
      // Locally mined blocks still use Hardhat's default (latest) hardfork.
      chains: {
        137: { hardforkHistory: { london: 23_850_000, shanghai: 50_523_000 } },
      },
    },
    polygon: { url: RPC, accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [] },
  },
  etherscan: { apiKey: process.env.POLYGONSCAN_API_KEY ?? '' },
}
export default config

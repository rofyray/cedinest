export const POLYGON_CHAIN_ID = 137 as const
export const POLYGON_CHAIN_ID_HEX = '0x89' as const
export const POLYGON_RPC = [
  'https://polygon-bor-rpc.publicnode.com',
  'https://polygon.drpc.org',
] as const

export const USDT0 = '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' as const
export const USDT_DECIMALS = 6
export const AAVE_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD' as const
export const A_POL_USDT = '0x6ab707Aca953eDAeFBc4fD23bA73294241490620' as const

// EIP-712 domains, verified against DOMAIN_SEPARATOR() on mainnet
export const USDT0_DOMAIN = {
  name: 'USDT0',
  version: '1',
  verifyingContract: USDT0,
  salt: '0x0000000000000000000000000000000000000000000000000000000000000089',
} as const
export const USDT0_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'verifyingContract', type: 'address' },
  { name: 'salt', type: 'bytes32' },
] as const

export const APOLUSDT_DOMAIN = {
  name: 'Aave Polygon USDT',
  version: '1',
  chainId: 137,
  verifyingContract: A_POL_USDT,
} as const
export const APOLUSDT_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
] as const

export const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export const NIMIQ_RPC = 'https://rpc.nimiqwatch.com'
export const NIMIQ_NETWORK_ID_MAINNET = 24
export const LUNA_PER_NIM = 100_000n
export const NIMIQ_BLOCKS_PER_BATCH = 60

export const PRICE_URL =
  'https://coins.llama.fi/prices/current/coingecko:nimiq-2,coingecko:polygon-ecosystem-token'
export const FX_URL = 'https://open.er-api.com/v6/latest/USD'

// Filled in after the relay contract is deployed to Polygon mainnet.
// The API and the app also accept RELAY_ADDRESS / VITE_RELAY_ADDRESS as an override.
export const RELAY_ADDRESS = '0xA46C2c8e3Fd4A1c6D6c4ae81f5ACC4d32E37f4E4' as const
export const NIM_FEE_ADDRESS = 'NQ00 0000 0000 0000 0000 0000 0000 0000 0000'

export const MAX_UINT256 = (1n << 256n) - 1n
export const MIN_DEPOSIT_RAW = 1_000_000n // 1 USDT
export const QUOTE_TTL_MS = 10 * 60 * 1000
export const PERMIT_TTL_S = 60 * 60
export const MEMO_PREFIX = 'cedinest:'

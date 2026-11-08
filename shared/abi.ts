import { parseAbi } from 'viem'

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function nonces(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
  'function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)',
])

export const poolAbi = parseAbi([
  'function getReserveData(address) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
])

export const relayAbi = parseAbi([
  'function depositFor(address owner,uint256 amount,uint256 deadline,uint8 v,bytes32 r,bytes32 s,bytes32 jobId)',
  'function withdrawFor(address owner,uint256 amount,uint256 deadline,uint8 v,bytes32 r,bytes32 s,bytes32 jobId)',
  'function relayer() view returns (address)',
  'event Deposited(address indexed owner,uint256 amount,bytes32 indexed jobId)',
  'event Withdrawn(address indexed owner,uint256 aTokenAmount,uint256 usdtOut,bytes32 indexed jobId)',
])

# CediNest contracts

`CediNestRelay` moves a user's USDT0 into their own Aave v3 position on Polygon and back,
with a relayer paying the gas. Users only sign EIP-2612 permits; they never need POL.

- USDT0 `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` (permit uses a salt-only EIP-712 domain, no `chainId`)
- aPolUSDT `0x6ab707Aca953eDAeFBc4fD23bA73294241490620`
- Aave v3 Pool `0x794a61358D6845594F94dc1DB02A252b5b4814aD`

## Setup

```sh
cd contracts
npm install
cp .env.example .env   # fill in what you need
```

Hardhat is pinned to `2.26.5`: Hardhat 2.29 / EDR 0.12 ignores the chain-137 hardfork history
and `eth_call` at the fork block fails. Node 26 works without extra flags.

## Tests (fork of live Polygon)

```sh
npm test                 # = npx hardhat test; forks Polygon mainnet at the latest block
npm run test:fork        # same, naming both fork test files explicitly
FORK_BLOCK=96944000 npm test   # pin the fork block (faster, cacheable)
POLYGON_RPC_URL=https://... npm test   # use your own archive RPC
```

The default RPC is `https://polygon.drpc.org`. `polygon-bor-rpc.publicnode.com` rejects pinned-block
state reads (403 "Archive requests require a personal token"), so it cannot back a Hardhat fork;
`polygon-rpc.com` returns 403 outright. Public RPCs are rate limited: if a run fails with HTTP errors,
rerun or set `POLYGON_RPC_URL` to an Alchemy/Infura/QuickNode archive endpoint.

The relay suite prints the measured gas as `GAS depositFor=... withdrawFor=...`.

```sh
npm run check-domains            # fork: compare DOMAIN_SEPARATOR() with the hashed domains
npm run check-domains:polygon    # same, against live Polygon
```

## Deploy and verify

```sh
# .env: DEPLOYER_PRIVATE_KEY, RELAYER_ADDRESS, OWNER_ADDRESS, POLYGONSCAN_API_KEY
npm run deploy:polygon
# prints the address and the exact `npx hardhat verify --network polygon ...` command to run next
npm run abi    # refresh abi/CediNestRelay.json from the compiled artifact
```

Mainnet smoke test (moves 1 USDT0 into Aave and back for a team wallet; needs real funds):

```sh
RELAY_ADDRESS=0x... USER_PRIVATE_KEY=0x... DEPLOYER_PRIVATE_KEY=0x... npm run smoke:polygon
```

## Security notes

- The relayer can call exactly two functions, `depositFor` and `withdrawFor`, and both send the
  output to the signer: `supply(onBehalfOf = owner)` and `withdraw(to = owner)`.
- A stolen relayer key can at worst move a user's savings between their own Aave position and their
  own wallet (and only with a valid permit from that user). It cannot redirect funds.
- No admin withdraw, no upgradeability, no fee taken in USDT. The owner can only rotate the relayer
  (`Ownable2Step`).
- Permits are tolerant of front-running: if someone submits the user's permit first, the relay falls
  back to the resulting allowance. Bad, expired, or already-used signatures revert with `PermitFailed`.
- `withdrawFor(amount = 2^256-1)` pulls `aToken.balanceOf(owner)` at execution time; the user signs
  the aPolUSDT permit with `value = 2^256-1`.
- aToken transfers are scaled-balance based and can leave 1 unit (1e-6 USDT) of rounding dust in the
  user's aPolUSDT balance or in the relay. Tests allow for it.

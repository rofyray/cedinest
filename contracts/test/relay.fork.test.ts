import { expect } from 'chai'
import { ethers, network } from 'hardhat'
import type { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers'
import type { CediNestRelay } from '../typechain-types'
import {
  USDT0, A_POL_USDT, POOL, USDT0_DOMAIN, A_POL_USDT_DOMAIN, MAX_UINT,
  usdt, aToken, fundUser, signPermit, latestTimestamp,
} from './helpers'

const AMOUNT = 5_000_000n // 5 USDT0
const jobId = (label: string) => ethers.id(label)

describe('CediNestRelay on Polygon fork', function () {
  this.timeout(600_000)

  let relayer: HardhatEthersSigner
  let owner: HardhatEthersSigner
  let other: HardhatEthersSigner
  let relay: CediNestRelay
  let relayAddr: string
  let gasDeposit = 0n
  let gasWithdraw = 0n

  async function freshUser(fund: bigint = AMOUNT) {
    const user = ethers.Wallet.createRandom().connect(ethers.provider)
    if (fund > 0n) await fundUser(user.address, fund)
    return user
  }

  async function depositSig(user: ReturnType<typeof ethers.Wallet.createRandom>, amount = AMOUNT, deadlineOffset = 3600n) {
    const deadline = (await latestTimestamp()) + deadlineOffset
    return signPermit(user.connect(ethers.provider), USDT0_DOMAIN, USDT0, relayAddr, amount, deadline)
  }

  async function withdrawSig(user: ReturnType<typeof ethers.Wallet.createRandom>, amount: bigint) {
    const deadline = (await latestTimestamp()) + 3600n
    return signPermit(user.connect(ethers.provider), A_POL_USDT_DOMAIN, A_POL_USDT, relayAddr, amount, deadline)
  }

  /// Deposit AMOUNT for a fresh user through the relay. Returns the user.
  async function depositedUser(amount = AMOUNT) {
    const user = await freshUser(amount)
    const { v, r, s, deadline } = await depositSig(user, amount)
    await (await relay.connect(relayer).depositFor(user.address, amount, deadline, v, r, s, jobId('setup'))).wait()
    return user
  }

  before(async () => {
    console.log(`      chain head at block ${await ethers.provider.getBlockNumber()}`)
    ;[relayer, owner, other] = await ethers.getSigners()
    relay = await ethers.deployContract('CediNestRelay', [USDT0, A_POL_USDT, POOL, relayer.address, owner.address])
    await relay.waitForDeployment()
    relayAddr = await relay.getAddress()
  })

  after(() => {
    console.log(`\n      GAS depositFor=${gasDeposit} withdrawFor=${gasWithdraw}\n`)
  })

  it('deposit happy path: user aPolUSDT grows by amount, relay holds no USDT0, Deposited emitted', async () => {
    const user = await freshUser()
    const { v, r, s, deadline } = await depositSig(user)
    const aBefore = await aToken().balanceOf(user.address)
    const id = jobId('deposit-1')

    const tx = await relay.connect(relayer).depositFor(user.address, AMOUNT, deadline, v, r, s, id)
    const receipt = await tx.wait()
    gasDeposit = receipt!.gasUsed

    await expect(tx).to.emit(relay, 'Deposited').withArgs(user.address, AMOUNT, id)
    const aAfter = await aToken().balanceOf(user.address)
    expect(aAfter - aBefore).to.be.closeTo(AMOUNT, 2n)
    expect(await usdt().balanceOf(user.address)).to.equal(0n)
    expect(await usdt().balanceOf(relayAddr)).to.equal(0n)
    expect(await aToken().balanceOf(relayAddr)).to.equal(0n)
  })

  it('withdraw part: user gets USDT0 back and aPolUSDT falls by amount', async () => {
    const user = await depositedUser()
    const part = AMOUNT / 2n
    const { v, r, s, deadline } = await withdrawSig(user, part)
    const aBefore = await aToken().balanceOf(user.address)
    const uBefore = await usdt().balanceOf(user.address)
    const id = jobId('withdraw-part')

    const tx = await relay.connect(relayer).withdrawFor(user.address, part, deadline, v, r, s, id)
    const receipt = await tx.wait()
    gasWithdraw = receipt!.gasUsed

    const aAfter = await aToken().balanceOf(user.address)
    const uAfter = await usdt().balanceOf(user.address)
    expect(aBefore - aAfter).to.be.closeTo(part, 2n)
    expect(uAfter - uBefore).to.be.closeTo(part, 2n)
    expect(await usdt().balanceOf(relayAddr)).to.equal(0n)
    expect(await aToken().balanceOf(relayAddr)).to.be.lte(1n)
    await expect(tx).to.emit(relay, 'Withdrawn')
  })

  it('withdraw all after 30 days: aPolUSDT ends at 0 or 1 unit and USDT0 returned exceeds the deposit', async () => {
    const user = await depositedUser()

    await network.provider.send('evm_increaseTime', [30 * 24 * 3600])
    await network.provider.send('evm_mine', [])

    const { v, r, s, deadline } = await withdrawSig(user, MAX_UINT)
    const uBefore = await usdt().balanceOf(user.address)
    const id = jobId('withdraw-all')

    const tx = await relay.connect(relayer).withdrawFor(user.address, MAX_UINT, deadline, v, r, s, id)
    const receipt = await tx.wait()
    const uAfter = await usdt().balanceOf(user.address)

    expect(await aToken().balanceOf(user.address)).to.be.lte(1n)
    expect(uAfter - uBefore).to.be.gt(AMOUNT)

    const ev = receipt!.logs
      .map((l) => { try { return relay.interface.parseLog(l) } catch { return null } })
      .find((p) => p?.name === 'Withdrawn')
    expect(ev, 'Withdrawn event').to.not.be.null
    expect(ev!.args.owner).to.equal(user.address)
    expect(ev!.args.jobId).to.equal(id)
    expect(ev!.args.usdtOut).to.equal(uAfter - uBefore)
  })

  it('only relayer: a different caller reverts with NotRelayer', async () => {
    const user = await freshUser()
    const { v, r, s, deadline } = await depositSig(user)
    await expect(
      relay.connect(other).depositFor(user.address, AMOUNT, deadline, v, r, s, jobId('not-relayer')),
    ).to.be.revertedWithCustomError(relay, 'NotRelayer')
    await expect(
      relay.connect(owner).withdrawFor(user.address, AMOUNT, deadline, v, r, s, jobId('not-relayer')),
    ).to.be.revertedWithCustomError(relay, 'NotRelayer')
  })

  it('front-run permit: a third party submits the same permit first, depositFor still succeeds', async () => {
    const user = await freshUser()
    const { v, r, s, deadline } = await depositSig(user)

    // Third party replays the user's signature directly on the token.
    await (await usdt(other).permit(user.address, relayAddr, AMOUNT, deadline, v, r, s)).wait()
    expect(await usdt().allowance(user.address, relayAddr)).to.equal(AMOUNT)

    const aBefore = await aToken().balanceOf(user.address)
    await expect(relay.connect(relayer).depositFor(user.address, AMOUNT, deadline, v, r, s, jobId('front-run')))
      .to.emit(relay, 'Deposited')
    expect((await aToken().balanceOf(user.address)) - aBefore).to.be.closeTo(AMOUNT, 2n)
  })

  it('bad signature: a permit signed by another key reverts PermitFailed', async () => {
    const user = await freshUser()
    const impostor = ethers.Wallet.createRandom().connect(ethers.provider)
    const deadline = (await latestTimestamp()) + 3600n
    const nonce = await usdt().nonces(user.address)
    // Sign the user's permit message with the wrong key.
    const sig = await impostor.signTypedData(USDT0_DOMAIN, {
      Permit: [
        { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
      ],
    }, { owner: user.address, spender: relayAddr, value: AMOUNT, nonce, deadline })
    const { v, r, s } = ethers.Signature.from(sig)
    await expect(
      relay.connect(relayer).depositFor(user.address, AMOUNT, deadline, v, r, s, jobId('bad-sig')),
    ).to.be.revertedWithCustomError(relay, 'PermitFailed')
  })

  it('expired deadline: reverts PermitFailed', async () => {
    const user = await freshUser()
    const { v, r, s, deadline } = await depositSig(user, AMOUNT, -60n)
    await expect(
      relay.connect(relayer).depositFor(user.address, AMOUNT, deadline, v, r, s, jobId('expired')),
    ).to.be.revertedWithCustomError(relay, 'PermitFailed')
  })

  it('reused signature: a second depositFor with the same signature reverts PermitFailed', async () => {
    const user = await freshUser(AMOUNT * 2n)
    const { v, r, s, deadline } = await depositSig(user)
    await (await relay.connect(relayer).depositFor(user.address, AMOUNT, deadline, v, r, s, jobId('reuse-1'))).wait()
    // User still has AMOUNT left, so the only thing stopping a replay is the permit nonce.
    expect(await usdt().balanceOf(user.address)).to.equal(AMOUNT)
    await expect(
      relay.connect(relayer).depositFor(user.address, AMOUNT, deadline, v, r, s, jobId('reuse-2')),
    ).to.be.revertedWithCustomError(relay, 'PermitFailed')
  })

  it('owner can rotate the relayer; the old relayer is locked out', async () => {
    await expect(relay.connect(other).setRelayer(other.address)).to.be.revertedWithCustomError(relay, 'OwnableUnauthorizedAccount')
    await (await relay.connect(owner).setRelayer(other.address)).wait()
    const user = await freshUser()
    const { v, r, s, deadline } = await depositSig(user)
    await expect(
      relay.connect(relayer).depositFor(user.address, AMOUNT, deadline, v, r, s, jobId('rotated')),
    ).to.be.revertedWithCustomError(relay, 'NotRelayer')
    await (await relay.connect(owner).setRelayer(relayer.address)).wait()
  })
})

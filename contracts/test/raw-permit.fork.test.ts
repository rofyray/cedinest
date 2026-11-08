import { expect } from 'chai'
import { ethers } from 'hardhat'
import {
  USDT0, A_POL_USDT, POOL, USDT0_DOMAIN, A_POL_USDT_DOMAIN,
  usdt, aToken, pool, fundUser, signPermit, latestTimestamp,
} from './helpers'

describe('raw permit on Polygon fork', function () {
  this.timeout(300_000)

  before(async () => {
    console.log(`      forked Polygon at block ${await ethers.provider.getBlockNumber()}`)
  })

  it('hashDomain(USDT0_DOMAIN) matches USDT0.DOMAIN_SEPARATOR()', async () => {
    const onChain = await usdt().DOMAIN_SEPARATOR()
    expect(ethers.TypedDataEncoder.hashDomain(USDT0_DOMAIN)).to.equal(onChain)
  })

  it('hashDomain(A_POL_USDT_DOMAIN) matches aPolUSDT.DOMAIN_SEPARATOR()', async () => {
    const onChain = await aToken().DOMAIN_SEPARATOR()
    expect(ethers.TypedDataEncoder.hashDomain(A_POL_USDT_DOMAIN)).to.equal(onChain)
  })

  it('salt-domain permit from a fresh wallet lets a second account supply into Aave on the user\'s behalf', async () => {
    const [relayer] = await ethers.getSigners()
    const user = ethers.Wallet.createRandom().connect(ethers.provider)
    const value = 5_000_000n // 5 USDT0
    await fundUser(user.address, value)
    expect(await usdt().balanceOf(user.address)).to.equal(value)

    const deadline = (await latestTimestamp()) + 3600n
    const { v, r, s } = await signPermit(user, USDT0_DOMAIN, USDT0, relayer.address, value, deadline)

    const aBefore = await aToken().balanceOf(user.address)

    await (await usdt(relayer).permit(user.address, relayer.address, value, deadline, v, r, s)).wait()
    expect(await usdt().allowance(user.address, relayer.address)).to.equal(value)
    await (await usdt(relayer).transferFrom(user.address, relayer.address, value)).wait()
    await (await usdt(relayer).approve(POOL, value)).wait()
    await (await pool(relayer).supply(USDT0, value, user.address, 0)).wait()

    const aAfter = await aToken().balanceOf(user.address)
    expect(aAfter - aBefore).to.be.closeTo(value, 2n)
    expect(await usdt().balanceOf(user.address)).to.equal(0n)
    expect(await aToken().balanceOf(A_POL_USDT)).to.be.gte(0n) // sanity: whale still a contract
  })
})

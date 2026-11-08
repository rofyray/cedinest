export function apyFromLiquidityRate(rateRay: bigint) {
  const apr = Number(rateRay) / 1e27
  return (1 + apr / 31_536_000) ** 31_536_000 - 1 // 0.0367 = 3.67%
}

// Reserve flags from `configuration`: active = bit 56, frozen = bit 57, paused = bit 60.
export function reserveFlags(configuration: bigint) {
  const bit = (n: bigint) => ((configuration >> n) & 1n) === 1n
  return { active: bit(56n), frozen: bit(57n), paused: bit(60n) }
}

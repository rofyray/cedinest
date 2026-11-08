export const GAS_DEPOSIT = 285_000n   // measured 237,328 gasUsed on a Polygon fork x 1.2
export const GAS_WITHDRAW = 348_000n  // measured 289,509 gasUsed on a Polygon fork x 1.2
export const FEE_MARGIN = 1.5         // covers gas spikes between quote and send
export const MIN_FEE_NIM = 50

export function quoteFee(p: { gas: bigint; gasPriceWei: bigint; polUsd: number; nimUsd: number }) {
  const gasPol = Number(p.gas * p.gasPriceWei) / 1e18
  const gasUsd = gasPol * p.polUsd
  const nim = Math.max(MIN_FEE_NIM, Math.ceil((gasUsd * FEE_MARGIN) / p.nimUsd / 10) * 10)
  return { feeNim: nim, feeLuna: BigInt(nim) * 100_000n, feeUsd: nim * p.nimUsd, gasUsd }
}

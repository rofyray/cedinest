/**
 * A fake Nimiq Pay for local development and e2e tests (VITE_MOCK_WALLET=1).
 * Installs window.nimiq and window.ethereum backed by a throwaway key that never holds real funds.
 * Never bundled in production: main.ts only imports it when the env flag is on.
 */
import { privateKeyToAccount } from 'viem/accounts'

const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const // Hardhat account #1
const account = privateKeyToAccount(KEY)
const NIM_ADDRESS = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

const setting = (k: string, fallback: string) => { try { return localStorage.getItem(k) ?? fallback } catch { return fallback } }
const randomHash = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')

export function installMockWallet() {
  const w = window as any
  const log = (...a: unknown[]) => console.info('[mock-wallet]', ...a)

  w.nimiqPay = { language: 'en', userFiat: 'USD', network: 'mainnet' }
  w.nimiq = {
    async listAccounts() { return [NIM_ADDRESS] },
    async getBalance() { return Number(setting('mock.nimBalanceLuna', '1824000000')) },
    async sendBasicTransactionWithData(tx: { recipient: string; value: number; data: string }) {
      if (setting('mock.cancelFee', '0') === '1') throw Object.assign(new Error('User rejected'), { code: 4001 })
      // Nimiq Pay refuses a payment it cannot fund; the app must not pre-empt that on its own reading.
      if (Number(setting('mock.nimBalanceLuna', '1824000000')) < tx.value) throw Object.assign(new Error('Insufficient balance'), { code: -32000 })
      log('NIM payment', tx)
      const prefix = setting('mock.nimHashPrefix', '')
      return (prefix + randomHash()).slice(0, 64)
    },
    async sendBasicTransaction() { return randomHash() },
    on() { return this }, once() { return this },
  }
  w.ethereum = {
    isMockWallet: true,
    async request({ method, params }: { method: string; params?: any[] }) {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts': return [account.address]
        case 'eth_chainId': return '0x89'
        case 'wallet_switchEthereumChain': return null
        case 'personal_sign': {
          if (setting('mock.cancelSign', '0') === '1') throw Object.assign(new Error('User rejected'), { code: 4001 })
          const [hex] = params as [string, string]
          const bytes = Uint8Array.from(hex.slice(2).match(/../g)!.map((b) => parseInt(b, 16)))
          return account.signMessage({ message: { raw: bytes } })
        }
        case 'eth_signTypedData_v4': {
          if (setting('mock.cancelSign', '0') === '1') throw Object.assign(new Error('User rejected'), { code: 4001 })
          const [, json] = params as [string, string]
          const td = JSON.parse(json)
          log('typed data', td.domain, td.message)
          const { EIP712Domain: _d, ...types } = td.types
          const message = Object.fromEntries(Object.entries(td.message).map(([k, v]) => [k, /^\d+$/.test(String(v)) && k !== 'owner' && k !== 'spender' ? BigInt(v as string) : v]))
          return account.signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message: message as any })
        }
        default: throw new Error(`mock-wallet: ${method} not supported`)
      }
    },
    on() {}, removeListener() {},
  }
  log('installed for', account.address, NIM_ADDRESS)
}

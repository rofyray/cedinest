/** Greps the built bundle for the em dash and "USDT0" in visible strings. Run after `vite build`. */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'dist', 'assets')
const QUOTES = new Set(['"', "'", '`'])
let bad = 0
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.js')) continue
  const src = readFileSync(join(dir, f), 'utf8')
  for (const m of src.matchAll(/—/g)) { console.error(`${f}: em dash at ${m.index}: ${src.slice(m.index! - 40, m.index! + 40)}`); bad++ }
  for (const m of src.matchAll(/USDT0/g)) {
    // Allowed only as the exact literal "USDT0": the EIP-712 domain name, never shown to the user.
    const before = src[m.index! - 1] ?? '', after = src[m.index! + 5] ?? ''
    if (!(QUOTES.has(before) && QUOTES.has(after))) { console.error(`${f}: USDT0 shown at ${m.index}: ${src.slice(m.index! - 40, m.index! + 40)}`); bad++ }
  }
}
if (bad) { console.error(`${bad} copy problem(s)`); process.exit(1) }
console.log('copy check: clean')

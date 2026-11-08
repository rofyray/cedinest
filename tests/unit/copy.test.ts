/**
 * Copy rules: no em dashes, no "USDT0" shown to Yaw, and no bare English sentences in .vue templates
 * (every string comes from src/copy/en.ts through t()).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en, t } from '../../src/copy/en'

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.vue')) out.push(p)
  }
  return out
}

const flatten = (o: any, prefix = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [[`${prefix}${k}`, v]] : flatten(v, `${prefix}${k}.`)))

describe('copy', () => {
  const strings = flatten(en)

  it('has no em dashes and never says USDT0', () => {
    for (const [key, value] of strings) {
      expect(value, key).not.toMatch(/—/)
      expect(value, key).not.toMatch(/USDT0/)
    }
  })

  it('interpolates variables and leaves unknown keys visible', () => {
    expect(t('home.earned', { ghs: 'GH₵ 11.62' })).toBe('GH₵ 11.62 earned so far. E dey grow small small.')
    expect(t('nope.nothing')).toBe('nope.nothing')
    expect(t('save.approval1', {})).toBe('1. Pay the {nim} NIM stamp fee')
  })

  it('keeps every sentence in en.ts, not in .vue templates', () => {
    const files = walk(join(process.cwd(), 'src'))
    const offenders: string[] = []
    for (const file of files) {
      if (file.endsWith('Lab.vue')) continue // hidden feasibility page, not shipped
      const src = readFileSync(file, 'utf8')
      const template = src.match(/<template>([\s\S]*)<\/template>/)?.[1] ?? ''
      // Text nodes between tags: three or more words with letters, outside {{ }}.
      for (const m of template.matchAll(/>([^<>{}]*?)</g)) {
        const text = m[1]!.replace(/\s+/g, ' ').trim()
        if (/[A-Za-z]{2,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(text)) offenders.push(`${file.split('/src/')[1]}: "${text}"`)
      }
    }
    expect(offenders).toEqual([])
  })
})

import { createHmac, randomBytes } from 'node:crypto'
import { verifyMessage } from 'viem'
import { isEvmAddress } from '../../shared/ids.js'
import { db } from './db.js'
import { env } from './env.js'
import { bearer, HttpError } from './http.js'

const SESSION_DAYS = 30
const CHALLENGE_MINUTES = 10

export const tokenHash = (token: string) => createHmac('sha256', env.sessionSecret).update(token).digest('hex')

export function challengeMessage(owner: string, nonce: string, issued: string) {
  return [
    'CediNest sign-in',
    '',
    'This signature proves this wallet is yours. It costs nothing and moves no money.',
    '',
    `Wallet: ${owner}`,
    `Nonce: ${nonce}`,
    `Issued: ${issued}`,
  ].join('\n')
}

export async function createChallenge(owner: string) {
  if (!isEvmAddress(owner)) throw new HttpError(400, 'bad_request', 'owner must be a 0x address')
  const nonce = randomBytes(16).toString('hex')
  const issued = new Date().toISOString()
  const { sql } = await db()
  await sql`delete from challenges where expires_at < now()`
  await sql`insert into challenges (nonce, owner, expires_at)
    values (${nonce}, ${owner.toLowerCase()}, now() + make_interval(mins => ${CHALLENGE_MINUTES}))`
  return { nonce, issued, message: challengeMessage(owner, nonce, issued) }
}

export async function createSession(p: { owner: string; nonce: string; issued: string; signature: string }) {
  if (!isEvmAddress(p.owner)) throw new HttpError(400, 'bad_request', 'owner must be a 0x address')
  const { sql } = await db()
  const rows = await sql`delete from challenges where nonce = ${p.nonce} and owner = ${p.owner.toLowerCase()} and expires_at > now() returning nonce`
  if (!rows[0]) throw new HttpError(400, 'challenge_expired', 'sign-in challenge expired, ask for a new one')
  const ok = await verifyMessage({
    address: p.owner, message: challengeMessage(p.owner, p.nonce, p.issued), signature: p.signature as `0x${string}`,
  }).catch(() => false)
  if (!ok) throw new HttpError(400, 'bad_signature', 'that signature did not match the wallet')
  const token = randomBytes(32).toString('hex')
  await sql`insert into sessions (token_hash, owner, expires_at)
    values (${tokenHash(token)}, ${p.owner.toLowerCase()}, now() + make_interval(days => ${SESSION_DAYS}))`
  return { token, owner: p.owner.toLowerCase() }
}

/** The signed-in owner (lower-case) for this request, or null. */
export async function sessionOwner(req: Request): Promise<string | null> {
  const token = bearer(req)
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null
  const { sql } = await db()
  const rows = await sql`select owner from sessions where token_hash = ${tokenHash(token)} and expires_at > now()`
  return rows[0]?.owner ?? null
}

export async function requireSession(req: Request) {
  const owner = await sessionOwner(req)
  if (!owner) throw new HttpError(401, 'sign_in_required', 'sign in first')
  return owner
}

/** Applies db/schema.sql to DATABASE_URL (idempotent). */
import { db } from '../api/_lib/db'

if (!process.env.DATABASE_URL) { console.error('set DATABASE_URL'); process.exit(2) }
const d = await db()
await d.migrate()
const rows = await d.sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`
const n = rows[0]?.n
console.log(`migrated: ${n} tables`)
process.exit(0)

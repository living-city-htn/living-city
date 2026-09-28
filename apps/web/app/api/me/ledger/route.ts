import { balance, ledgerOf, read } from '@living-city/fixtures/store'
import { currentUser, json } from '@/lib/stub'

// GET /api/me/ledger -> { balance, entries: LedgerEntry[] } newest first, last 50.
// docs/01 section 8.8: every credit and debit is a row with a reason and a reference.
export async function GET(req: Request) {
  const user = currentUser(req)
  return json(await read(() => ({
    balance: balance(user.id),
    entries: ledgerOf(user.id).slice(0, 50),
  })))
}

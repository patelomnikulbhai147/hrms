// ─────────────────────────────────────────────────────────────────────────────
// PESSIMISTIC ROW LOCKS FOR BALANCE MUTATIONS
//
// A balance that is READ, adjusted in JS, then WRITTEN back absolutely is a lost
// update waiting to happen:
//
//   T1 reads extraEmployeeSlots = 0        T2 reads extraEmployeeSlots = 0
//   T1 writes 0 + 10 = 10                  T2 writes 0 + 10 = 10
//   → the customer paid for 20 slots and received 10.
//
// Prisma's interactive transactions do NOT prevent this on their own: MySQL's
// default REPEATABLE READ lets both transactions read the same committed value
// concurrently. A plain `findUnique` takes no lock.
//
// `SELECT ... FOR UPDATE` takes an exclusive lock on the row for the remainder
// of the transaction, so the second transaction blocks at the SELECT and only
// proceeds once the first has COMMITTED — at which point it re-reads the new
// value. That makes read-modify-write safe, including when the new value must
// be clamped (which a relative `{ increment }` cannot express).
//
// Use inside an interactive transaction, BEFORE reading the balance you are
// about to overwrite. Outside a transaction the lock is released immediately and
// buys nothing, so callers must pass the transaction client.
// ─────────────────────────────────────────────────────────────────────────────

// ── CRITICAL: read the balance FROM the locking query ────────────────────────
// Taking the lock is only half of the fix. Under MySQL's default REPEATABLE
// READ, a transaction's first plain SELECT establishes a consistent snapshot,
// and every later NON-locking read returns that snapshot — even after another
// transaction has committed a new value. So this sequence is still broken:
//
//     SELECT ... FOR UPDATE          -- waits, then acquires the lock
//     prisma.findUnique(...)         -- NON-locking: returns the STALE snapshot
//     update(balance = stale + n)    -- lost update, exactly as before
//
// `SELECT ... FOR UPDATE` is a *current* read: it sees the latest committed row.
// The caller must therefore use the values THIS function returns, and must not
// re-read them with a plain query afterwards.
//
/**
 * Exclusively lock one row and return its current committed values.
 *
 * @param {object} tx        the Prisma TRANSACTION client (not the base client)
 * @param {string} table     physical table name (validated against an allow-list)
 * @param {string} keyColumn the key column (validated against an allow-list)
 * @param {number} keyValue  the key value — always bound as a parameter
 * @param {string[]} [columns] extra columns to return from the locking read
 * @returns {Promise<object|null>} the locked row's current values, or null if absent
 */
async function lockRowForUpdate(tx, table, keyColumn, keyValue, columns = []) {
  // Identifiers cannot be parameterised, so both the table and every column are
  // restricted to a fixed allow-list rather than interpolated from user input.
  const ALLOWED = {
    CompanySubscription: ['companyId', 'id', 'extraEmployeeSlots', 'subscriptionSeats', 'plan', 'billingCycle'],
    verification_credit_wallet: ['companyId', 'id', 'totalCredits', 'usedCredits', 'remainingCredits', 'expiredCredits', 'status'],
  };
  const allowedCols = ALLOWED[table];
  if (!allowedCols || !allowedCols.includes(keyColumn)) {
    throw new Error(`lockRowForUpdate: refusing to lock un-allow-listed ${table}.${keyColumn}`);
  }
  for (const c of columns) {
    if (!allowedCols.includes(c)) {
      throw new Error(`lockRowForUpdate: column ${table}.${c} is not allow-listed`);
    }
  }
  const id = Number(keyValue);
  if (!Number.isInteger(id)) throw new Error('lockRowForUpdate: key must be an integer');

  const select = [keyColumn, ...columns].join(', ');
  const rows = await tx.$queryRawUnsafe(
    `SELECT ${select} FROM ${table} WHERE ${keyColumn} = ? FOR UPDATE`,
    id
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

module.exports = { lockRowForUpdate };

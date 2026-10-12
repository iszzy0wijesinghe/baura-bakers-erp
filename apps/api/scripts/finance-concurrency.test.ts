/** Concurrent uniqueness tests on an isolated MySQL test database.
 * Creates temporary fixtures and deletes them in finally. Never targets production.
 * This does not replace authenticated HTTP authorization or close/post race tests.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

const connection = process.env.FINANCE_TEST_DATABASE_URL;
if (!connection) throw new Error('FINANCE_TEST_DATABASE_URL is required.');
const url = new URL(connection);
const database = decodeURIComponent(url.pathname.slice(1));
if (url.protocol !== 'mysql:' || !/^(?:[a-z0-9_]*_test|test_[a-z0-9_]+)$/i.test(database)) {
  throw new Error('Refusing non-test MySQL database.');
}
const db = new PrismaClient({ datasources: { db: { url: connection } } });
const tag = randomUUID().slice(0, 12).toUpperCase();
const date = new Date('2097-04-15T00:00:00Z');
let yearId: string | undefined;

async function race(label: string, make: (i: number) => Promise<unknown>) {
  const results = await Promise.allSettled([make(0), make(1)]);
  const successes = results.filter((result) => result.status === 'fulfilled');
  const failures = results.filter((result) => result.status === 'rejected');
  assert.equal(successes.length, 1, `${label}: expected exactly one successful write`);
  assert.equal(failures.length, 1, `${label}: expected exactly one rejected write`);
  const error = (failures[0] as PromiseRejectedResult).reason;
  assert.ok(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002', `${label}: expected P2002 unique constraint violation, received ${String(error)}`);
  console.log(`PASS ${label}: one winner, one P2002`);
}

async function main() {
  const selected = await db.$queryRaw<Array<{ selected_db: string }>>`SELECT DATABASE() AS selected_db`;
  assert.equal(selected[0]?.selected_db, database);
  console.log(`Finance concurrency checks: ${database} (temporary TEST-${tag} fixtures)`);
  const year = await db.financeFiscalYear.create({
    data: { label: `TEST-${tag}`, startsOn: new Date('2097-04-01T00:00:00Z'), endsOn: new Date('2098-03-31T00:00:00Z'),
      periods: { create: [{ number: 1, startsOn: new Date('2097-04-01T00:00:00Z'), endsOn: new Date('2097-04-30T00:00:00Z') }] } },
    include: { periods: true },
  });
  yearId = year.id;
  const periodId = year.periods[0].id;
  const create = (journalNo: string, idempotencyKey: string) => db.financeJournal.create({
    data: { journalNo, idempotencyKey, fiscalYearId: year.id, periodId, accountingDate: date, description: `Concurrency test ${tag}`, status: 'POSTED' },
  });
  await race('concurrent duplicate journal number', (i) => create(`TEST-${tag}-NUMBER`, `TEST-${tag}-KEY-${i}`));
  await race('concurrent duplicate idempotency key', (i) => create(`TEST-${tag}-IDEMP-${i}`, `TEST-${tag}-SAME`));
  const count = await db.financeJournal.count({ where: { fiscalYearId: year.id } });
  assert.equal(count, 2, 'Exactly two winning journal records should exist');
  console.log('PASS concurrent inserts persisted exactly two winners');
  console.log('NOTE: This checks database uniqueness under concurrent writes, NOT authenticated HTTP routes, period-close races, or valid double-entry posting.');
}

async function cleanup() {
  if (!yearId) return;
  await db.financeJournalLine.deleteMany({ where: { journal: { fiscalYearId: yearId } } });
  await db.financeJournal.deleteMany({ where: { fiscalYearId: yearId } });
  await db.financePeriod.deleteMany({ where: { fiscalYearId: yearId } });
  await db.financeFiscalYear.delete({ where: { id: yearId } });
  console.log('Temporary test fixtures cleaned up.');
}

main().catch((error) => { console.error('FAIL finance concurrency:', error); process.exitCode = 1; })
  .finally(async () => { try { await cleanup(); } catch (error) { console.error('WARNING: test fixture cleanup failed:', error); process.exitCode = 1; } await db.$disconnect(); });

/** Real MySQL period-lock contention test. Requires FINANCE_TEST_DATABASE_URL. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';

const connection = process.env.FINANCE_TEST_DATABASE_URL;
if (!connection) throw new Error('FINANCE_TEST_DATABASE_URL is required.');
const parsed = new URL(connection);
const database = decodeURIComponent(parsed.pathname.slice(1));
if (!/^(?:[a-z0-9_]*_test|test_[a-z0-9_]+)$/i.test(database)) throw new Error('Refusing non-test database.');
if (parsed.protocol !== 'mysql:') throw new Error('Only MySQL test databases are supported.');
const db = new PrismaClient({ datasources: { db: { url: connection } } });
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const suffix = randomUUID().slice(0, 8).toUpperCase();
let yearId: string | undefined;
let periodId: string | undefined;

async function main() {
  const result = await db.$queryRaw<Array<{ name: string }>>`SELECT DATABASE() AS name`;
  assert.equal(result[0]?.name, database);
  const year = await db.financeFiscalYear.create({ data: {
    label: `RACE-${suffix}`, startsOn: new Date('2097-04-01T00:00:00Z'), endsOn: new Date('2098-03-31T00:00:00Z'),
  } });
  yearId = year.id;
  const period = await db.financePeriod.create({ data: {
    fiscalYearId: year.id, number: 1, startsOn: new Date('2097-04-01T00:00:00Z'), endsOn: new Date('2097-04-30T00:00:00Z'),
  } });
  periodId = period.id;

  let release!: () => void;
  let acquired!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const lockAcquired = new Promise<void>(resolve => { acquired = resolve; });
  const holder = db.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM FinancePeriod WHERE id = ${period.id} FOR UPDATE`;
    assert.equal(rows[0]?.status, 'OPEN');
    acquired();
    await hold;
    await tx.financePeriod.update({ where: { id: period.id }, data: { status: 'CLOSED', closedAt: new Date() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 });

  await lockAcquired;
  let contenderFinished = false;
  const contender = db.$transaction(async tx => {
    const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM FinancePeriod WHERE id = ${period.id} FOR UPDATE`;
    assert.equal(rows[0]?.status, 'CLOSED', 'Contender must see committed closed status');
    return rows[0].status;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 }).finally(() => { contenderFinished = true; });

  try {
    await sleep(350);
    assert.equal(contenderFinished, false, 'Contender must wait while period row is locked');
    console.log('PASS competing transaction waits for period row lock');
  } finally {
    release();
  }
  await holder;
  assert.equal(await contender, 'CLOSED');
  console.log('PASS competing transaction sees CLOSED after lock release');
  assert.equal((await db.financePeriod.findUniqueOrThrow({ where: { id: period.id } })).status, 'CLOSED');
  console.log('PASS committed accounting period remains CLOSED');
  console.log('NOTE: This is database lock contention, not an authenticated HTTP/route-level test.');
}

main().catch(e => { console.error('FAIL period race:', e); process.exitCode = 1; }).finally(async () => {
  try {
    if (periodId) await db.financePeriod.delete({ where: { id: periodId } });
    if (yearId) await db.financeFiscalYear.delete({ where: { id: yearId } });
    console.log('Temporary fixtures cleaned up.');
  } catch (e) { console.error('CLEANUP FAILED: remove RACE-' + suffix + ' fixtures from TEST database only', e); process.exitCode = 1; }
  await db.$disconnect();
});

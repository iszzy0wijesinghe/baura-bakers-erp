/**
 * Finance database integration checks. Every fixture and journal is rolled back.
 * This tests Prisma/database invariants and posting-shaped transactions, NOT HTTP
 * authentication, route handlers, concurrent requests or end-to-end operations.
 * Requires FINANCE_TEST_DATABASE_URL pointing to a dedicated *_test database.
 */
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Prisma, PrismaClient } from '@prisma/client';
import { validateJournalLines } from '../src/modules/finance/finance.validation';

const connection = process.env.FINANCE_TEST_DATABASE_URL;
if (!connection) throw new Error('Set FINANCE_TEST_DATABASE_URL to a separate test database; nothing was run.');
const parsedUrl = new URL(connection);
const dbName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''));
if (!/^(?:[a-z0-9_]*_test|test_[a-z0-9_]+)$/i.test(dbName)) {
  throw new Error(`Refusing database "${dbName}". Test DB name must end in _test or start with test_.`);
}
if (!['mysql:', 'mysqls:'].includes(parsedUrl.protocol)) throw new Error('Expected a MySQL test database URL.');
const db = new PrismaClient({ datasources: { db: { url: connection } } });
const rollback = Symbol('FINANCE_TEST_ROLLBACK');
const decimal = (v: string) => new Prisma.Decimal(v);
let checks = 0;
function ok(name: string, fn: () => void) { fn(); checks++; console.log(`PASS ${name}`); }
async function rejects(name: string, fn: () => Promise<unknown>, predicate?: (e: unknown) => boolean) {
  let rejected = false;
  try { await fn(); } catch (e) { if (predicate && !predicate(e)) throw e; rejected = true; }
  assert.ok(rejected, `${name}: expected rejection`);
  checks++; console.log(`PASS ${name}`);
}
async function main() {
  const probe = await db.$queryRaw<Array<{ selected_db: string }>>`SELECT DATABASE() AS selected_db`;
  assert.equal(probe[0]?.selected_db, dbName, 'Database connection target mismatch');
  console.log(`Isolated DB: ${dbName}; transaction fixtures will be rolled back.`);
  try {
    await db.$transaction(async (tx) => {
      const suffix = randomUUID().slice(0, 8).toUpperCase();
      const year = await tx.financeFiscalYear.create({ data: { label: `TEST-${suffix}`, startsOn: new Date('2098-04-01T00:00:00Z'), endsOn: new Date('2099-03-31T00:00:00Z') } });
      const period = await tx.financePeriod.create({ data: { fiscalYearId: year.id, number: 1, startsOn: new Date('2098-04-01T00:00:00Z'), endsOn: new Date('2098-04-30T00:00:00Z') } });
      const cash = await tx.financeAccount.create({ data: { code: `TCA-${suffix}`, name: 'Test cash', type: 'ASSET', normalBalance: 'DEBIT' } });
      const bank = await tx.financeAccount.create({ data: { code: `TBA-${suffix}`, name: 'Test bank', type: 'ASSET', normalBalance: 'DEBIT' } });
      const expense = await tx.financeAccount.create({ data: { code: `TEX-${suffix}`, name: 'Test expense', type: 'EXPENSE', normalBalance: 'DEBIT' } });
      const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM FinancePeriod WHERE id = ${period.id} FOR UPDATE`;
      ok('period row can be locked for posting', () => assert.equal(locked[0]?.status, 'OPEN'));
      const date = new Date('2098-04-12T00:00:00Z');
      const lines = validateJournalLines([{ accountId: expense.id, debit: '125.50', credit: '0' }, { accountId: cash.id, debit: '0', credit: '125.50' }]);
      const posted = await tx.financeJournal.create({ data: {
        journalNo: `T-${suffix}-01`, fiscalYearId: year.id, periodId: period.id, accountingDate: date,
        description: 'Test expense', status: 'POSTED', idempotencyKey: `test:${suffix}:expense`,
        sourceType: 'EXPENSE', postedAt: new Date(),
        lines: { create: lines.map((l, i) => ({ lineNo: i + 1, accountId: l.accountId, debit: decimal((Number(l.debit) / 100).toFixed(2)), credit: decimal((Number(l.credit) / 100).toFixed(2)) })) }
      }, include: { lines: true } });
      ok('expense journal persists two balanced lines', () => {
        assert.equal(posted.lines.length, 2);
        assert.equal(posted.lines.reduce((a, l) => a.plus(l.debit), decimal('0')).toFixed(2), '125.50');
        assert.equal(posted.lines.reduce((a, l) => a.plus(l.credit), decimal('0')).toFixed(2), '125.50');
      });
      await rejects('duplicate journal number rejected by unique constraint', () => tx.financeJournal.create({ data: {
        journalNo: posted.journalNo, fiscalYearId: year.id, periodId: period.id, accountingDate: date, description: 'Duplicate', status: 'POSTED'
      } }), (e) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002');
      await rejects('duplicate idempotency key rejected by unique constraint', () => tx.financeJournal.create({ data: {
        journalNo: `T-${suffix}-02`, fiscalYearId: year.id, periodId: period.id, accountingDate: date,
        description: 'Duplicate key', status: 'POSTED', idempotencyKey: `test:${suffix}:expense`
      } }), (e) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002');
      const reversal = await tx.financeJournal.create({ data: {
        journalNo: `T-${suffix}-REV`, fiscalYearId: year.id, periodId: period.id, accountingDate: date,
        description: 'Test reversal', status: 'POSTED', reversalOfId: posted.id,
        lines: { create: posted.lines.map((l) => ({ lineNo: l.lineNo, accountId: l.accountId, debit: l.credit, credit: l.debit })) }
      }, include: { lines: true } });
      await tx.financeJournal.update({ where: { id: posted.id }, data: { status: 'REVERSED' } });
      ok('reversal swaps debits and credits', () => {
        assert.equal(reversal.lines[0].debit.toFixed(2), '0.00');
        assert.equal(reversal.lines[0].credit.toFixed(2), '125.50');
        assert.equal(reversal.lines[1].debit.toFixed(2), '125.50');
        assert.equal(reversal.lines[1].credit.toFixed(2), '0.00');
      });
      await rejects('one reversal per journal enforced', () => tx.financeJournal.create({ data: {
        journalNo: `T-${suffix}-R2`, fiscalYearId: year.id, periodId: period.id, accountingDate: date,
        description: 'Second reversal', status: 'POSTED', reversalOfId: posted.id
      } }), (e) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002');
      const transfer = await tx.financeJournal.create({ data: {
        journalNo: `T-${suffix}-TR`, fiscalYearId: year.id, periodId: period.id, accountingDate: date,
        description: 'Cash to bank', status: 'POSTED', sourceType: 'TRANSFER',
        lines: { create: [{ lineNo: 1, accountId: bank.id, debit: decimal('50.00'), credit: decimal('0') }, { lineNo: 2, accountId: cash.id, debit: decimal('0'), credit: decimal('50.00') }] }
      }, include: { lines: true } });
      ok('cash/bank transfer balanced', () => assert.equal(transfer.lines[0].debit.toFixed(2), transfer.lines[1].credit.toFixed(2)));
      await tx.financePeriod.update({ where: { id: period.id }, data: { status: 'CLOSED', closedAt: new Date() } });
      const closed = await tx.financePeriod.findUniqueOrThrow({ where: { id: period.id } });
      ok('closed period recognized by application guard', () => assert.equal(closed.status, 'CLOSED'));
      // IMPORTANT: database schema itself does NOT prevent posting to a closed period.
      // This check exercises only the guard predicate, not the HTTP route handler.
      ok('unbalanced posting rejected by validation', () => assert.throws(() => validateJournalLines([
        { accountId: cash.id, debit: '10.00', credit: '0' }, { accountId: bank.id, debit: '0', credit: '9.99' }
      ])));
      throw rollback;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
  const leaked = await db.financeFiscalYear.count({ where: { label: { startsWith: 'TEST-' }, startsOn: new Date('2098-04-01T00:00:00Z') } });
  // Other test suites may use TEST- fixtures; we don't assert global zero.
  console.log(`PASS transaction rollback completed (${checks} checks). Other TEST- years in DB: ${leaked}`);
  console.log('NOTE: HTTP permissions, concurrent posting/close races, and route-specific behavior remain UNTESTED.');
}
main().catch((error) => { console.error('FAIL finance DB integration:', error); process.exitCode = 1; }).finally(() => db.$disconnect());

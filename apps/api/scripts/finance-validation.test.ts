import assert from 'node:assert/strict';
import test from 'node:test';
import { accountingDate, amountInCents, validateJournalLines } from '../src/modules/finance/finance.validation';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
test('accepts valid leap-day and rejects impossible dates', () => {
  assert.equal(accountingDate('2028-02-29').toISOString().slice(0, 10), '2028-02-29');
  assert.throws(() => accountingDate('2026-02-29'));
  assert.throws(() => accountingDate('2026-13-01'));
});
test('money is exact to two decimal places', () => {
  assert.equal(amountInCents('125.07'), 12507n);
  for (const value of ['1.001', '-1', '1e5', '0', '01.00', '99999999999999999']) assert.throws(() => amountInCents(value));
});
test('balanced journal is accepted', () => {
  assert.equal(validateJournalLines([{ accountId: A, debit: '12.30', credit: '0' }, { accountId: B, debit: '0', credit: '12.30' }]).length, 2);
});
test('unbalanced, empty, both-sided, and zero lines are rejected', () => {
  for (const lines of [
    [{ accountId: A, debit: '10', credit: '0' }, { accountId: B, debit: '0', credit: '9' }],
    [{ accountId: A, debit: '10', credit: '1' }, { accountId: B, debit: '0', credit: '9' }],
    [{ accountId: A, debit: '0', credit: '0' }, { accountId: B, debit: '0', credit: '0' }],
    [],
  ]) assert.throws(() => validateJournalLines(lines));
});

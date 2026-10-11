/** Pure accounting validations; safe to test without connecting to a database. */
export function accountingDate(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('FINANCE: Use YYYY-MM-DD for accounting dates.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('FINANCE: Invalid accounting date.');
  return date;
}
export function amountInCents(value: unknown, allowZero = false): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('FINANCE: Invalid monetary amount.');
  const str = String(value);
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(str)) throw new Error('FINANCE: Invalid monetary amount.');
  const [whole, fraction = ''] = str.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if ((!allowZero && cents === 0n) || cents > 999999999999999999n) throw new Error('FINANCE: Amount is outside permitted limits.');
  return cents;
}
export function validateJournalLines(value: unknown): Array<{accountId: string; debit: bigint; credit: bigint}> {
  if (!Array.isArray(value) || value.length < 2 || value.length > 100) throw new Error('FINANCE: Journal requires 2–100 lines.');
  const lines = value.map((line: unknown) => {
    if (!line || typeof line !== 'object') throw new Error('FINANCE: Invalid journal line.');
    const row = line as Record<string, unknown>;
    if (typeof row.accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.accountId)) throw new Error('FINANCE: Invalid account ID.');
    const debit = amountInCents(row.debit ?? '0', true);
    const credit = amountInCents(row.credit ?? '0', true);
    if ((debit === 0n) === (credit === 0n)) throw new Error('FINANCE: Each line must have debit or credit, not both.');
    return { accountId: row.accountId, debit, credit };
  });
  const debits = lines.reduce((total, line) => total + line.debit, 0n);
  const credits = lines.reduce((total, line) => total + line.credit, 0n);
  if (debits === 0n || debits !== credits) throw new Error('FINANCE: Journal debits and credits must balance.');
  return lines;
}

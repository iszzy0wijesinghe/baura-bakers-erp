/**
 * Baura ERP Finance: read-only database integrity audit.
 * Run from apps/api: node scripts/finance-integrity-audit.mjs
 * Requires the existing Prisma client and DATABASE_URL environment configuration.
 * NEVER writes to the database.
 *
 * @format
 */

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PrismaClient, Prisma } = require("@prisma/client");
const prisma = new PrismaClient();
const D = (value) => new Prisma.Decimal(value);
const zero = D(0);
const problems = [];
const warnings = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
};
const iso = (date) => date.toISOString().slice(0, 10);

async function audit() {
  const [years, periods, accounts, journals] = await Promise.all([
    prisma.financeFiscalYear.findMany({ orderBy: { startsOn: "asc" } }),
    prisma.financePeriod.findMany({ orderBy: { startsOn: "asc" } }),
    prisma.financeAccount.findMany(),
    prisma.financeJournal.findMany({
      include: { lines: true },
      orderBy: { accountingDate: "asc" },
    }),
  ]);
  const periodById = new Map(periods.map((p) => [p.id, p]));
  const yearById = new Map(years.map((y) => [y.id, y]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  console.log(
    `Finance audit (READ ONLY): ${years.length} years, ${periods.length} periods, ${accounts.length} accounts, ${journals.length} journals`,
  );

  for (let i = 1; i < years.length; i++) {
    check(
      years[i - 1].endsOn < years[i].startsOn,
      `Overlapping fiscal years: ${years[i - 1].label} / ${years[i].label}`,
    );
  }
  for (const year of years) {
    const children = periods
      .filter((p) => p.fiscalYearId === year.id)
      .sort((a, b) => a.number - b.number);
    check(
      children.length === 12,
      `${year.label}: expected 12 periods, found ${children.length}`,
    );
    for (let i = 0; i < children.length; i++) {
      const p = children[i];
      check(
        p.number === i + 1,
        `${year.label}: unexpected period number ${p.number}`,
      );
      check(
        p.startsOn >= year.startsOn &&
          p.endsOn <= year.endsOn &&
          p.startsOn <= p.endsOn,
        `${year.label}: period ${p.number} outside fiscal year`,
      );
      if (i > 0) {
        const expected = new Date(children[i - 1].endsOn.getTime() + 86400000);
        check(
          iso(expected) === iso(p.startsOn),
          `${year.label}: gap/overlap before period ${p.number}`,
        );
      }
    }
    if (children.length === 12) {
      check(
        iso(children[0].startsOn) === iso(year.startsOn),
        `${year.label}: first period start differs from fiscal year`,
      );
      check(
        iso(children[11].endsOn) === iso(year.endsOn),
        `${year.label}: last period end differs from fiscal year`,
      );
    }
  }
  for (const p of periods) {
    check(yearById.has(p.fiscalYearId), `Period ${p.id}: missing fiscal year`);
    check(
      p.status !== "CLOSED" || Boolean(p.closedAt),
      `Period ${p.id}: closed without closedAt`,
    );
  }
  for (const a of accounts) {
    if (a.parentId) {
      const parent = accountById.get(a.parentId);
      check(Boolean(parent), `Account ${a.code}: missing parent`);
      if (parent)
        check(
          parent.type === a.type,
          `Account ${a.code}: parent has different account type`,
        );
      const visited = new Set([a.id]);
      let cursor = parent;
      while (cursor) {
        if (visited.has(cursor.id)) {
          problems.push(`Account ${a.code}: cyclic account hierarchy`);
          break;
        }
        visited.add(cursor.id);
        cursor = cursor.parentId ? accountById.get(cursor.parentId) : null;
      }
    }
  }
  let postedCount = 0;
  let debits = zero;
  let credits = zero;
  for (const j of journals) {
    const period = periodById.get(j.periodId);
    const year = yearById.get(j.fiscalYearId);
    check(
      Boolean(period && year),
      `Journal ${j.journalNo}: missing period or fiscal year`,
    );
    if (period && year) {
      check(
        period.fiscalYearId === year.id,
        `Journal ${j.journalNo}: period belongs to a different fiscal year`,
      );
      check(
        j.accountingDate >= period.startsOn &&
          j.accountingDate <= period.endsOn,
        `Journal ${j.journalNo}: accounting date outside period`,
      );
    }
    if (j.status !== "POSTED" && j.status !== "REVERSED") continue;
    postedCount++;
    check(j.lines.length >= 2, `Journal ${j.journalNo}: fewer than two lines`);
    check(Boolean(j.postedAt), `Journal ${j.journalNo}: missing postedAt`);
    let jd = zero;
    let jc = zero;
    for (const line of j.lines) {
      check(
        accountById.has(line.accountId),
        `Journal ${j.journalNo}: unknown account on line ${line.lineNo}`,
      );
      check(
        line.debit.gte(zero) && line.credit.gte(zero),
        `Journal ${j.journalNo}: negative line amount`,
      );
      check(
        (line.debit.gt(zero) && line.credit.eq(zero)) ||
          (line.credit.gt(zero) && line.debit.eq(zero)),
        `Journal ${j.journalNo}: line ${line.lineNo} must have exactly one positive side`,
      );
      jd = jd.plus(line.debit);
      jc = jc.plus(line.credit);
    }
    check(
      jd.eq(jc) && jd.gt(zero),
      `Journal ${j.journalNo}: unbalanced (${jd.toFixed(2)} / ${jc.toFixed(2)})`,
    );
    debits = debits.plus(jd);
    credits = credits.plus(jc);
  }
  const byId = new Map(journals.map((j) => [j.id, j]));
  for (const j of journals) {
    if (!j.reversalOfId) continue;
    const original = byId.get(j.reversalOfId);
    check(Boolean(original), `Reversal ${j.journalNo}: original missing`);
    if (!original) continue;
    check(
      original.status === "REVERSED",
      `Reversal ${j.journalNo}: original not marked REVERSED`,
    );
    const amounts = (lines) => {
      const totals = new Map();
      for (const line of lines) {
        const prev = totals.get(line.accountId) ?? {
          debit: zero,
          credit: zero,
        };
        totals.set(line.accountId, {
          debit: prev.debit.plus(line.debit),
          credit: prev.credit.plus(line.credit),
        });
      }
      return totals;
    };
    const a = amounts(original.lines);
    const b = amounts(j.lines);
    for (const accountId of new Set([...a.keys(), ...b.keys()])) {
      const x = a.get(accountId) ?? { debit: zero, credit: zero };
      const y = b.get(accountId) ?? { debit: zero, credit: zero };
      check(
        x.debit.eq(y.credit) && x.credit.eq(y.debit),
        `Reversal ${j.journalNo}: account ${accountId} does not negate original`,
      );
    }
  }
  check(debits.eq(credits), "Global posted journal totals do not balance");
  if (!journals.length)
    warnings.push(
      "No journals exist yet; posting/reversal controls remain untested.",
    );
  console.log(
    `Posted/reversed journals: ${postedCount}; total debit: ${debits.toFixed(2)}; total credit: ${credits.toFixed(2)}`,
  );
  for (const message of warnings) console.log(`WARN: ${message}`);
  for (const message of problems) console.error(`FAIL: ${message}`);
  console.log(
    problems.length
      ? `AUDIT FAILED (${problems.length} issue(s))`
      : "AUDIT PASSED (read-only consistency checks)",
  );
  process.exitCode = problems.length ? 1 : 0;
}
try {
  await audit();
} catch (error) {
  console.error(
    "Audit could not run:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 2;
} finally {
  await prisma.$disconnect();
}

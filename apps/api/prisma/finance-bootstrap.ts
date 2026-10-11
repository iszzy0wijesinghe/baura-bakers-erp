import { PrismaClient, FinanceAccountType, FinanceNormalBalance } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const startYear = 2026;

type Account = readonly [string, string, FinanceAccountType, FinanceNormalBalance];
const accounts: Account[] = [
  ["1000", "Cash on Hand", "ASSET", "DEBIT"],
  ["1010", "POS Cash Clearing", "ASSET", "DEBIT"],
  ["1100", "Bank - Operating", "ASSET", "DEBIT"],
  ["1200", "Accounts Receivable", "ASSET", "DEBIT"],
  ["1300", "Raw Material Inventory", "ASSET", "DEBIT"],
  ["1310", "Finished Goods Inventory", "ASSET", "DEBIT"],
  ["1400", "Prepaid Expenses", "ASSET", "DEBIT"],
  ["1500", "Equipment and Fixtures", "ASSET", "DEBIT"],
  ["1590", "Accumulated Depreciation", "ASSET", "CREDIT"],
  ["2000", "Accounts Payable", "LIABILITY", "CREDIT"],
  ["2100", "Taxes Payable", "LIABILITY", "CREDIT"],
  ["2200", "Accrued Expenses", "LIABILITY", "CREDIT"],
  ["2300", "Customer Deposits", "LIABILITY", "CREDIT"],
  ["3000", "Owner Capital", "EQUITY", "CREDIT"],
  ["3100", "Retained Earnings", "EQUITY", "CREDIT"],
  ["3200", "Current Year Earnings", "EQUITY", "CREDIT"],
  ["4000", "POS Sales Revenue", "REVENUE", "CREDIT"],
  ["4010", "Online Sales Revenue (Future)", "REVENUE", "CREDIT"],
  ["4020", "Other Sales Revenue", "REVENUE", "CREDIT"],
  ["4090", "Sales Returns and Discounts", "REVENUE", "DEBIT"],
  ["5000", "Cost of Goods Sold", "EXPENSE", "DEBIT"],
  ["5100", "Inventory Wastage", "EXPENSE", "DEBIT"],
  ["6000", "Salaries and Wages", "EXPENSE", "DEBIT"],
  ["6100", "Rent Expense", "EXPENSE", "DEBIT"],
  ["6200", "Utilities Expense", "EXPENSE", "DEBIT"],
  ["6300", "Transport Expense", "EXPENSE", "DEBIT"],
  ["6400", "Repairs and Maintenance", "EXPENSE", "DEBIT"],
  ["6500", "Bank Charges", "EXPENSE", "DEBIT"],
  ["6600", "Administrative Expenses", "EXPENSE", "DEBIT"],
  ["6700", "Depreciation Expense", "EXPENSE", "DEBIT"],
];

async function main() {
  const label = `FY ${startYear}/${startYear + 1}`;
  const existing = await prisma.financeFiscalYear.findUnique({ where: { label }, include: { periods: true } });
  if (existing && (existing.periods.length !== 12 || existing.startsOn.toISOString().slice(0, 10) !== `${startYear}-04-01` || existing.endsOn.toISOString().slice(0, 10) !== `${startYear + 1}-03-31`)) {
    throw new Error(`Existing ${label} configuration is inconsistent; review manually.`);
  }
  const codes = accounts.map(([code]) => code);
  const stored = await prisma.financeAccount.findMany({ where: { code: { in: codes } } });
  const byCode = new Map(stored.map((a) => [a.code, a]));
  for (const [code, name, type, normalBalance] of accounts) {
    const found = byCode.get(code);
    if (found && (found.name !== name || found.type !== type || found.normalBalance !== normalBalance)) {
      throw new Error(`Account ${code} already exists with different details. No changes made; reconcile manually.`);
    }
  }
  console.log(`${label}: ${existing ? "already exists" : "will be created"}; ${accounts.length - stored.length} missing accounts.`);
  if (!apply) { console.log("DRY RUN ONLY. Run with --apply after reviewing the account names and confirming a database backup."); return; }
  await prisma.$transaction(async (tx) => {
    const year = await tx.financeFiscalYear.findUnique({ where: { label }, include: { periods: true } });
    if (!year) {
      const startsOn = new Date(Date.UTC(startYear, 3, 1));
      const endsOn = new Date(Date.UTC(startYear + 1, 2, 31));
      const overlap = await tx.financeFiscalYear.findFirst({ where: { startsOn: { lte: endsOn }, endsOn: { gte: startsOn } } });
      if (overlap) throw new Error("An overlapping financial year already exists.");
      await tx.financeFiscalYear.create({ data: { label, startsOn, endsOn, periods: { create: Array.from({ length: 12 }, (_, i) => {
        const m = 3 + i;
        const y = startYear + Math.floor(m / 12);
        const month = m % 12;
        return { number: i + 1, startsOn: new Date(Date.UTC(y, month, 1)), endsOn: new Date(Date.UTC(y, month + 1, 0)) };
      }) } } });
    }
    for (const [code, name, type, normalBalance] of accounts) {
      const found = await tx.financeAccount.findUnique({ where: { code } });
      if (found) {
        if (found.name !== name || found.type !== type || found.normalBalance !== normalBalance) throw new Error(`Conflict for ${code}`);
        continue;
      }
      await tx.financeAccount.create({ data: { code, name, type, normalBalance } });
    }
  });
  console.log("Finance bootstrap completed. No historical journals or opening balances were posted.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());

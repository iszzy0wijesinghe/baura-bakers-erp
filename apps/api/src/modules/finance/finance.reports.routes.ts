import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requirePermission } from "../../middleware/auth.middleware";

const router = Router();
const read = requirePermission("erp.finance.read");
const zero = new Prisma.Decimal(0);
function parseDate(input: unknown, fallback: string): Date {
  const value = input === undefined ? fallback : input;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid date: use YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Invalid calendar date.");
  return date;
}
function handleError(res: Response, error: unknown) {
  if (error instanceof Error && error.message.startsWith("Invalid")) return res.status(400).json({ message: error.message });
  console.error("Finance reporting failed", error);
  return res.status(500).json({ message: "Unable to generate financial report." });
}
async function balances(through: Date, from?: Date) {
  const accounts = await prisma.financeAccount.findMany({
    orderBy: { code: "asc" },
    include: { lines: {
      where: { journal: { status: { in: ["POSTED", "REVERSED"] }, accountingDate: { lte: through, ...(from ? { gte: from } : {}) } } },
      select: { debit: true, credit: true }
    } }
  });
  return accounts.map(({ lines, ...account }) => {
    const debit = lines.reduce((sum, line) => sum.plus(line.debit), zero);
    const credit = lines.reduce((sum, line) => sum.plus(line.credit), zero);
    const balance = account.normalBalance === "DEBIT" ? debit.minus(credit) : credit.minus(debit);
    return { id: account.id, code: account.code, name: account.name, type: account.type,
      normalBalance: account.normalBalance, debit: debit.toFixed(2), credit: credit.toFixed(2), balance: balance.toFixed(2) };
  });
}
const total = (rows: Array<{ balance: string }>) => rows.reduce((sum, row) => sum.plus(row.balance), zero);

router.get("/reports/income-statement", read, async (req, res) => {
  try {
    const reportYear = new Date().getUTCFullYear();
    const reportMonth = new Date().getUTCMonth();
    const from = parseDate(req.query.from, `${reportYear - (reportMonth < 3 ? 1 : 0)}-04-01`);
    const through = parseDate(req.query.through, new Date().toISOString().slice(0, 10));
    if (from > through) return res.status(400).json({ message: "From date must not exceed through date." });
    const rows = await balances(through, from);
    const revenue = rows.filter((row) => row.type === "REVENUE");
    const expenses = rows.filter((row) => row.type === "EXPENSE");
    const revenueTotal = total(revenue);
    const expenseTotal = total(expenses);
    res.json({ from, through, currency: "LKR", revenue, expenses,
      revenueTotal: revenueTotal.toFixed(2), expenseTotal: expenseTotal.toFixed(2),
      netProfit: revenueTotal.minus(expenseTotal).toFixed(2) });
  } catch (error) { handleError(res, error); }
});

router.get("/reports/balance-sheet", read, async (req, res) => {
  try {
    const through = parseDate(req.query.through, new Date().toISOString().slice(0, 10));
    const rows = await balances(through);
    const assets = rows.filter((row) => row.type === "ASSET");
    const liabilities = rows.filter((row) => row.type === "LIABILITY");
    const equity = rows.filter((row) => row.type === "EQUITY");
    const profit = total(rows.filter((row) => row.type === "REVENUE"))
      .minus(total(rows.filter((row) => row.type === "EXPENSE")));
    const assetTotal = total(assets);
    const liabilityTotal = total(liabilities);
    const equityTotal = total(equity);
    const difference = assetTotal.minus(liabilityTotal).minus(equityTotal).minus(profit);
    res.json({ through, currency: "LKR", assets, liabilities, equity,
      assetTotal: assetTotal.toFixed(2), liabilityTotal: liabilityTotal.toFixed(2),
      equityTotal: equityTotal.toFixed(2), currentEarnings: profit.toFixed(2),
      liabilitiesAndEquityTotal: liabilityTotal.plus(equityTotal).plus(profit).toFixed(2),
      difference: difference.toFixed(2), balanced: difference.isZero(),
      note: "Current earnings include all posted revenue and expense entries through the report date. Historical closing entries, if any, remain in their posted accounts." });
  } catch (error) { handleError(res, error); }
});
export default router;

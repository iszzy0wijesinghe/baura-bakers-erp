import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requirePermission } from "../../middleware/auth.middleware";

const router = Router();
const read = requirePermission("erp.finance.read");
const closePeriod = requirePermission("erp.finance.periods.close");
const reverseJournal = requirePermission("erp.finance.journals.reverse");
const postingEnabled = () => process.env.FINANCE_POSTING_ENABLED === "true";

function problem(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected finance error";
  const known = message.startsWith("FINANCE: ");
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ message: "Duplicate reversal or journal reference." });
  if (!known) console.error("Finance controls error", error);
  return res.status(known ? 400 : 500).json({ message: known ? message.slice(9) : "Finance operation failed" });
}
function reject(message: string): never { throw new Error(`FINANCE: ${message}`); }
function dateOnly(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) reject("Date must be YYYY-MM-DD.");
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value) reject("Invalid date.");
  return result;
}
const money = (value: Prisma.Decimal) => value.toFixed(2);

// All ledger views are derived from posted entries; draft and unposted entries are excluded.
router.get("/ledger/:accountId", read, async (req, res) => {
  try {
    const accountId = String(req.params.accountId);
    const account = await prisma.financeAccount.findUnique({ where: { id: accountId } });
    if (!account) return res.status(404).json({ message: "Account not found" });
    const through = req.query.through ? dateOnly(req.query.through) : undefined;
    const from = req.query.from ? dateOnly(req.query.from) : undefined;
    if (from && through && from > through) reject("From date must precede through date.");
    const rows = await prisma.financeJournalLine.findMany({
      where: { accountId: account.id, journal: { status: { in: ["POSTED", "REVERSED"] }, ...(through ? { accountingDate: { lte: through } } : {}) } },
      include: { journal: { select: { id: true, journalNo: true, accountingDate: true, description: true, status: true, reversalOfId: true } } },
      orderBy: [{ journal: { accountingDate: "asc" } }, { journal: { createdAt: "asc" } }, { lineNo: "asc" }],
    });
    let running = new Prisma.Decimal(0);
    const ledger = rows.map((row) => {
      const delta = account.normalBalance === "DEBIT" ? row.debit.minus(row.credit) : row.credit.minus(row.debit);
      running = running.plus(delta);
      return { id: row.id, journal: row.journal, lineNo: row.lineNo, description: row.description, debit: money(row.debit), credit: money(row.credit), balance: money(running) };
    });
    const openingBalance = from ? ledger.filter((row) => new Date(row.journal.accountingDate) < from).at(-1)?.balance ?? "0.00" : "0.00";
    res.json({ account, openingBalance, closingBalance: money(running), lines: from ? ledger.filter((row) => new Date(row.journal.accountingDate) >= from) : ledger });
  } catch (error) { problem(res, error); }
});

router.get("/periods", read, async (req, res) => {
  try {
    const fiscalYearId = typeof req.query.fiscalYearId === "string" ? req.query.fiscalYearId : undefined;
    res.json(await prisma.financePeriod.findMany({ where: fiscalYearId ? { fiscalYearId } : {}, include: { fiscalYear: { select: { label: true } } }, orderBy: [{ startsOn: "desc" }] }));
  } catch (error) { problem(res, error); }
});

router.post("/periods/:id/close", closePeriod, async (req, res) => {
  if (!postingEnabled()) return res.status(503).json({ message: "Finance period closing is disabled." });
  try {
    const periodId = String(req.params.id);
    const period = await prisma.$transaction(async (tx) => {
      // Lock the period row: posting must also acquire this lock to prevent close/post races.
      const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM FinancePeriod WHERE id = ${periodId} FOR UPDATE`;
      if (!rows.length) reject("Accounting period not found.");
      if (rows[0].status !== "OPEN") reject("Accounting period is already closed.");
      const record = await tx.financePeriod.findUniqueOrThrow({ where: { id: periodId } });
      const earlierOpen = await tx.financePeriod.count({ where: { startsOn: { lt: record.startsOn }, status: "OPEN" } });
      if (earlierOpen) reject("Close earlier accounting periods first.");
      return tx.financePeriod.update({ where: { id: record.id }, data: { status: "CLOSED", closedAt: new Date(), closedById: req.user!.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.json(period);
  } catch (error) { problem(res, error); }
});

router.post("/journals/:id/reverse", reverseJournal, async (req, res) => {
  if (!postingEnabled()) return res.status(503).json({ message: "Finance journal reversal is disabled." });
  try {
    const originalJournalId = String(req.params.id);
    const date = dateOnly(req.body?.accountingDate);
    const journalNo = req.body?.journalNo;
    if (typeof journalNo !== "string" || !/^[A-Za-z0-9._/-]{4,40}$/.test(journalNo)) reject("Invalid reversal journal number.");
    const result = await prisma.$transaction(async (tx) => {
      const originals = await tx.$queryRaw<Array<{ id: string; status: string }>>`SELECT id, status FROM FinanceJournal WHERE id = ${originalJournalId} FOR UPDATE`;
      if (!originals.length || originals[0].status !== "POSTED") reject("Only posted journals can be reversed once.");
      const original = await tx.financeJournal.findUniqueOrThrow({ where: { id: originalJournalId }, include: { lines: { orderBy: { lineNo: "asc" } } } });
      const periods = await tx.$queryRaw<Array<{ id: string; fiscalYearId: string; status: string }>>`SELECT id, fiscalYearId, status FROM FinancePeriod WHERE startsOn <= ${date} AND endsOn >= ${date} FOR UPDATE`;
      if (periods.length !== 1 || periods[0].status !== "OPEN") reject("Reversal date must belong to an open period.");
      const period = periods[0];
      const reversal = await tx.financeJournal.create({ data: {
        journalNo, accountingDate: date, description: `Reversal of ${original.journalNo}: ${original.description}`.slice(0, 500),
        fiscalYearId: period.fiscalYearId, periodId: period.id, status: "POSTED", reversalOfId: original.id,
        sourceType: "FINANCE_REVERSAL", sourceId: original.id, sourceEvent: "REVERSE", idempotencyKey: `finance:reverse:${original.id}`,
        createdById: req.user!.id, postedById: req.user!.id, postedAt: new Date(),
        lines: { create: original.lines.map((line) => ({ lineNo: line.lineNo, accountId: line.accountId, description: line.description, debit: line.credit, credit: line.debit })) },
      }, include: { lines: true } });
      await tx.financeJournal.update({ where: { id: original.id }, data: { status: "REVERSED" } });
      return reversal;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json(result);
  } catch (error) { problem(res, error); }
});

export default router;

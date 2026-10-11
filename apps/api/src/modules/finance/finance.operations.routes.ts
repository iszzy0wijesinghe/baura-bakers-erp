import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requirePermission } from "../../middleware/auth.middleware";

// Mounted AFTER authMiddleware in finance.routes.ts.
// Deliberately disabled until posting/reversal tests have passed on an isolated database.
const router = Router();
const read = requirePermission("erp.finance.read");
const post = requirePermission("erp.finance.journals.post");
const enabled = () => process.env.FINANCE_OPERATIONS_ENABLED === "true" && process.env.FINANCE_POSTING_ENABLED === "true";
const bad = (message: string): never => { throw new Error(`FINANCE: ${message}`); };
const report = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message.startsWith("FINANCE: ")) return res.status(400).json({ message: message.slice(9) });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ message: "Duplicate transaction reference. Check existing records before retrying." });
  console.error("Finance operation failed", error);
  return res.status(500).json({ message: "Finance operation failed" });
};
const dateValue = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) bad("Date must be YYYY-MM-DD.");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) bad("Invalid accounting date.");
  return date;
};
const money = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") bad("Invalid amount.");
  const str = String(value);
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/.test(str)) bad("Amount must have at most two decimal places.");
  const [whole, fraction = ""] = str.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents <= 0n || cents > 999999999999999999n) bad("Amount must be positive and within ledger limits.");
  return new Prisma.Decimal(`${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`);
};
const textField = (value: unknown, label: string, max: number) => {
  if (typeof value !== "string") return bad(`Invalid ${label}.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return bad(`Invalid ${label}.`);
  return trimmed;
};
const journalNumber = (value: unknown) => {
  if (typeof value !== "string") return bad("Reference must be 4–40 letters, numbers, dots, dashes or slashes.");
  if (!/^[A-Za-z0-9._/-]{4,40}$/.test(value)) return bad("Reference must be 4–40 letters, numbers, dots, dashes or slashes.");
  return value;
};
const keyValue = (value: unknown) => {
  if (typeof value !== "string") return bad("An idempotency key (8–191 characters) is required.");
  if (!/^[A-Za-z0-9:_./-]{8,191}$/.test(value)) return bad("An idempotency key (8–191 characters) is required.");
  return value;
};

type Operation = "EXPENSE" | "TRANSFER";
async function createOperation(req: any, res: Response, kind: Operation) {
  try {
    if (!enabled()) return res.status(503).json({ message: "Finance operations are disabled until isolated accounting tests pass." });
    const body = req.body ?? {};
    const accountingDate = dateValue(body.accountingDate);
    const journalNo = journalNumber(body.reference);
    const description = textField(body.description, "description", 500);
    const idempotencyKey = keyValue(body.idempotencyKey);
    const amount = money(body.amount);
    const expenseAccountId = kind === "EXPENSE" ? textField(body.expenseAccountId, "expense account", 36) : null;
    const fromAccountId = textField(body.fromAccountId, "source account", 36);
    const toAccountId = kind === "TRANSFER" ? textField(body.toAccountId, "destination account", 36) : null;
    const debitId = expenseAccountId ?? toAccountId!;
    if (debitId === fromAccountId) bad("Debit and credit accounts must be different.");
    const result = await prisma.$transaction(async (tx) => {
      // Same period row lock protocol as existing journal posting and period closing.
      const locked = await tx.$queryRaw<Array<{ id: string; status: string; fiscalYearId: string }>>`
        SELECT id, status, fiscalYearId FROM FinancePeriod
        WHERE startsOn <= ${accountingDate} AND endsOn >= ${accountingDate} FOR UPDATE`;
      if (locked.length !== 1 || locked[0].status !== "OPEN") bad("Accounting period is missing or closed.");
      const accounts = await tx.financeAccount.findMany({ where: { id: { in: [debitId, fromAccountId] }, isActive: true, allowPosting: true } });
      if (accounts.length !== 2) bad("Both accounts must be active posting accounts.");
      const debit = accounts.find((a) => a.id === debitId)!;
      const credit = accounts.find((a) => a.id === fromAccountId)!;
      if (kind === "EXPENSE" && debit.type !== "EXPENSE") bad("Expense must debit an expense account.");
      if (kind === "TRANSFER" && debit.type !== "ASSET") bad("Transfer destination must be an asset account.");
      if (credit.type !== "ASSET") bad("Payment source must be an asset account.");
      return tx.financeJournal.create({ data: {
        journalNo, accountingDate, description, status: "POSTED",
        fiscalYearId: locked[0].fiscalYearId, periodId: locked[0].id,
        sourceType: kind, sourceId: journalNo, sourceEvent: "RECORDED", idempotencyKey,
        createdById: req.user!.id, postedById: req.user!.id, postedAt: new Date(),
        lines: { create: [
          { lineNo: 1, accountId: debitId, debit: amount, credit: new Prisma.Decimal(0) },
          { lineNo: 2, accountId: fromAccountId, debit: new Prisma.Decimal(0), credit: amount }
        ] }
      }, include: { lines: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return res.status(201).json(result);
  } catch (error) { return report(res, error); }
}

router.get("/operations", read, async (req, res) => {
  try {
    const kind = req.query.kind;
    if (kind !== undefined && kind !== "EXPENSE" && kind !== "TRANSFER") bad("Invalid operation kind.");
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const records = await prisma.financeJournal.findMany({
      where: { sourceType: kind ? String(kind) : { in: ["EXPENSE", "TRANSFER"] } },
      take: limit, orderBy: { createdAt: "desc" },
      include: { lines: { orderBy: { lineNo: "asc" }, include: { account: { select: { code: true, name: true } } } } }
    });
    return res.json(records);
  } catch (error) { return report(res, error); }
});
router.get("/operations/status", read, (_req, res) => res.json({ enabled: enabled() }));
router.post("/operations/expenses", post, (req, res) => createOperation(req, res, "EXPENSE"));
router.post("/operations/transfers", post, (req, res) => createOperation(req, res, "TRANSFER"));
export default router;

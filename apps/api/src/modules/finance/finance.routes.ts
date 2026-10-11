import { Router, type Request, type Response } from "express";
import { Prisma, FinanceAccountType, FinanceNormalBalance } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { authMiddleware, requirePermission } from "../../middleware/auth.middleware";

import controlsRouter from "./finance.controls.routes";
import operationsRouter from "./finance.operations.routes";
import { validateJournalLines } from "./finance.validation";

const router = Router();
router.use(authMiddleware);
router.use(controlsRouter);
router.use(operationsRouter);
const read = requirePermission("erp.finance.read");
const manage = requirePermission("erp.finance.manage");
const post = requirePermission("erp.finance.journals.post");
const postingEnabled = () => process.env.FINANCE_POSTING_ENABLED === "true";

function fail(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected finance error";
  return res.status(message.startsWith("FINANCE:") ? 400 : 500).json({ message: message.replace(/^FINANCE: /, "") });
}
function invalid(message: string): never { throw new Error(`FINANCE: ${message}`); }
function dateOnly(input: unknown): Date {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) invalid("Use YYYY-MM-DD for accounting dates.");
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) invalid("Invalid accounting date.");
  return date;
}
function cents(input: unknown): bigint {
  const value = String(input);
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) invalid("Amounts must be nonnegative with at most two decimals.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
function decimal(amount: bigint): Prisma.Decimal { return new Prisma.Decimal(`${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`); }

router.get("/years", read, async (_req, res) => {
  try { res.json(await prisma.financeFiscalYear.findMany({ include: { periods: { orderBy: { number: "asc" } } }, orderBy: { startsOn: "desc" } })); }
  catch (error) { fail(res, error); }
});

router.post("/years/initialize", manage, async (req, res) => {
  try {
    const startYear = Number(req.body?.startYear);
    if (!Number.isInteger(startYear) || startYear < 2000 || startYear > 2100) invalid("Invalid financial year.");
    const label = `FY ${startYear}/${startYear + 1}`;
    const year = await prisma.$transaction(async (tx) => {
      const existing = await tx.financeFiscalYear.findUnique({ where: { label }, include: { periods: true } });
      if (existing) {
        if (existing.periods.length !== 12) invalid("Existing financial year has incomplete periods; investigate before continuing.");
        return existing;
      }
      const startsOn = new Date(Date.UTC(startYear, 3, 1));
      const endsOn = new Date(Date.UTC(startYear + 1, 2, 31));
      const overlapping = await tx.financeFiscalYear.findFirst({ where: { startsOn: { lte: endsOn }, endsOn: { gte: startsOn } } });
      if (overlapping) invalid("Financial year overlaps an existing year.");
      return tx.financeFiscalYear.create({ data: { label, startsOn, endsOn, periods: { create: Array.from({ length: 12 }, (_, i) => {
        const month = (3 + i) % 12;
        const yearNumber = startYear + Math.floor((3 + i) / 12);
        return { number: i + 1, startsOn: new Date(Date.UTC(yearNumber, month, 1)), endsOn: new Date(Date.UTC(yearNumber, month + 1, 0)) };
      }) } }, include: { periods: { orderBy: { number: "asc" } } } });
    });
    res.status(201).json(year);
  } catch (error) { fail(res, error); }
});

router.get("/accounts", read, async (_req, res) => {
  try { res.json(await prisma.financeAccount.findMany({ orderBy: { code: "asc" } })); }
  catch (error) { fail(res, error); }
});

router.post("/accounts", manage, async (req, res) => {
  try {
    const { code, name, type, normalBalance, parentId } = req.body ?? {};
    if (typeof code !== "string" || !/^[A-Z0-9.-]{2,30}$/.test(code)) invalid("Invalid account code.");
    if (typeof name !== "string" || !name.trim() || name.length > 150) invalid("Invalid account name.");
    if (!Object.values(FinanceAccountType).includes(type)) invalid("Invalid account type.");
    if (!Object.values(FinanceNormalBalance).includes(normalBalance)) invalid("Invalid normal balance.");
    if (parentId) {
      const parent = await prisma.financeAccount.findUnique({ where: { id: parentId } });
      if (!parent || parent.type !== type) invalid("Parent account must exist and have the same type.");
    }
    res.status(201).json(await prisma.financeAccount.create({ data: { code, name: name.trim(), type, normalBalance, parentId: parentId || null } }));
  } catch (error) { fail(res, error); }
});

router.get("/journals", read, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    res.json(await prisma.financeJournal.findMany({ take: limit, orderBy: { createdAt: "desc" }, include: { lines: { include: { account: { select: { code: true, name: true } } }, orderBy: { lineNo: "asc" } } } }));
  } catch (error) { fail(res, error); }
});

router.post("/journals/post", post, async (req: Request, res: Response) => {
  try {
    if (!postingEnabled()) return res.status(503).json({ message: "Journal posting is disabled. Use an isolated test environment before enabling." });
    const { journalNo, accountingDate, description, lines, idempotencyKey } = req.body ?? {};
    if (typeof journalNo !== "string" || !/^[A-Za-z0-9._/-]{4,40}$/.test(journalNo)) invalid("Invalid journal number.");
    if (typeof description !== "string" || !description.trim() || description.length > 500) invalid("Invalid description.");
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 191)) invalid("Invalid idempotency key.");
    const date = dateOnly(accountingDate);
    const parsed = validateJournalLines(lines);
    const result = await prisma.$transaction(async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.financeJournal.findUnique({ where: { idempotencyKey } });
        if (existing) invalid("Idempotency key already used; inspect the existing journal before retrying.");
      }
      const lockedPeriods = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM FinancePeriod WHERE startsOn <= ${date} AND endsOn >= ${date} FOR UPDATE`;
      const period = lockedPeriods.length === 1 ? await tx.financePeriod.findUnique({ where: { id: lockedPeriods[0].id } }) : null;
      if (!period || period.status !== "OPEN") invalid("Accounting period is missing or closed.");
      const accountIds = [...new Set(parsed.map((line) => line.accountId))];
      const accounts = await tx.financeAccount.findMany({ where: { id: { in: accountIds }, isActive: true, allowPosting: true } });
      if (accounts.length !== accountIds.length) invalid("One or more accounts are inactive or unavailable for posting.");
      return tx.financeJournal.create({ data: {
        journalNo, accountingDate: date, description: description.trim(), status: "POSTED",
        fiscalYearId: period.fiscalYearId, periodId: period.id, idempotencyKey: idempotencyKey || null,
        createdById: req.user!.id, postedById: req.user!.id, postedAt: new Date(),
        lines: { create: parsed.map((line, index) => ({ lineNo: index + 1, accountId: line.accountId, debit: decimal(line.debit), credit: decimal(line.credit) })) }
      }, include: { lines: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return res.status(409).json({ message: "Duplicate journal number or idempotency key." });
    fail(res, error);
  }
});

router.get("/trial-balance", read, async (req, res) => {
  try {
    const through = req.query.through ? dateOnly(req.query.through) : new Date("9999-12-31T00:00:00.000Z");
    const accounts = await prisma.financeAccount.findMany({ orderBy: { code: "asc" }, include: { lines: { where: { journal: { status: { in: ["POSTED", "REVERSED"] }, accountingDate: { lte: through } } }, select: { debit: true, credit: true } } } });
    res.json(accounts.map(({ lines, ...account }) => ({ ...account, debit: lines.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0)).toFixed(2), credit: lines.reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0)).toFixed(2) })));
  } catch (error) { fail(res, error); }
});
export default router;

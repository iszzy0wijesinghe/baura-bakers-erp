import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requirePermission } from "../../middleware/auth.middleware";

/**
 * Read-only preflight for POS -> Finance integration.
 * This endpoint does not create journals or change sales.
 * A sale is considered linked only if a POSTED journal explicitly references its ID.
 */
const router = Router();
router.get("/reconciliation/pos", requirePermission("erp.finance.read"), async (req, res) => {
  try {
    const limitInput = req.query.limit;
    const limit = limitInput === undefined ? 50 : Number(limitInput);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({ message: "limit must be an integer between 1 and 100" });
    }
    const fromInput = req.query.from;
    const toInput = req.query.to;
    const parseDate = (value: unknown): Date | null => {
      if (value === undefined) return null;
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid date. Use YYYY-MM-DD.");
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Invalid calendar date.");
      return date;
    };
    const from = parseDate(fromInput);
    const to = parseDate(toInput);
    if (from && to && from > to) return res.status(400).json({ message: "from must be on or before to" });
    const endExclusive = to ? new Date(to.getTime() + 86400000) : null;
    const where: Prisma.SalesOrderWhereInput = {
      status: "COMPLETED",
      ...(from || endExclusive ? { soldAt: { ...(from ? { gte: from } : {}), ...(endExclusive ? { lt: endExclusive } : {}) } } : {})
    };
    const [saleCount, saleTotals, sales] = await prisma.$transaction([
      prisma.salesOrder.count({ where }),
      prisma.salesOrder.aggregate({ where, _sum: { netTotal: true, cogsTotal: true } }),
      prisma.salesOrder.findMany({ where, take: limit, orderBy: [{ soldAt: "desc" }, { id: "desc" }], select: {
        id: true, orderNo: true, soldAt: true, paymentMethod: true, netTotal: true, cogsTotal: true
      } })
    ]);
    const ids = sales.map(s => s.id);
    const journals = ids.length ? await prisma.financeJournal.findMany({
      where: { sourceType: { in: ["POS", "POS_SALE", "SALE"] }, sourceId: { in: ids }, status: "POSTED" },
      select: { id: true, journalNo: true, sourceId: true }
    }) : [];
    const bySale = new Map<string, Array<{ id: string; journalNo: string }>>();
    for (const journal of journals) {
      if (!journal.sourceId) continue;
      const linked = bySale.get(journal.sourceId) ?? [];
      linked.push({ id: journal.id, journalNo: journal.journalNo });
      bySale.set(journal.sourceId, linked);
    }
    const rows = sales.map(s => ({
      ...s,
      postedJournals: bySale.get(s.id) ?? [],
      status: bySale.has(s.id) ? "LINKED" : "UNLINKED"
    }));
    return res.json({
      scope: "COMPLETED_SALES_ONLY",
      warning: "Read-only audit. Linked status uses known source types POS/POS_SALE/SALE and does not prove ledger correctness. Totals cover all matching sales; rows cover only the newest requested page.",
      filters: { from: fromInput ?? null, to: toInput ?? null, limit },
      saleCount,
      totalNetSales: saleTotals._sum.netTotal ?? new Prisma.Decimal(0),
      totalCostOfGoods: saleTotals._sum.cogsTotal ?? new Prisma.Decimal(0),
      inspectedRows: rows.length,
      linkedRows: rows.filter(r => r.status === "LINKED").length,
      unlinkedRows: rows.filter(r => r.status === "UNLINKED").length,
      rows
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Invalid")) return res.status(400).json({ message: error.message });
    console.error("POS finance reconciliation failed", error);
    return res.status(500).json({ message: "POS finance reconciliation failed" });
  }
});
export default router;

/** @format */

import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { runSerializableTransaction } from "../../lib/transaction";
import {
  authMiddleware,
  requirePermission,
} from "../../middleware/auth.middleware";
import { getSriLankaDateParts } from "../business-calendar/businessCalendar.routes";

const router = Router();
router.use(authMiddleware);
const requestSchema = z.object({
  reason: z.string().trim().min(10).max(500),
  restock: z.boolean().default(false),
  /** Confirmation that the refund was actually paid to the customer. */
  paymentRefundConfirmed: z.literal(true),
  /** Required if returned perishable goods are going back into sellable stock. */
  restockInspectionConfirmed: z.boolean().optional(),
});
const fail = (message: string): never => {
  throw new Error(`POS_REFUND: ${message}`);
};

/** Full-sale refund only. No external payment gateway refund is initiated here. */
router.post(
  "/:saleId/refund",
  requirePermission("erp.pos.refunds.create"),
  async (req, res) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({
          message: "Invalid refund request",
          errors: parsed.error.flatten(),
        });
    const saleId = String(req.params.saleId);
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(saleId))
      return res.status(400).json({ message: "Invalid sale ID" });
    if (process.env.POS_REFUNDS_ENABLED !== "true")
      return res
        .status(503)
        .json({
          message: "POS refunds are disabled pending integration tests.",
        });
    if (
      parsed.data.restock &&
      parsed.data.restockInspectionConfirmed !== true
    ) {
      return res
        .status(400)
        .json({
          message: "Restocking requires explicit inspection confirmation.",
        });
    }
    const actorId = req.user!.id;
    const now = new Date();
    const businessDate = getSriLankaDateParts(now).date;
    const accountingDate = new Date(`${businessDate}T00:00:00.000Z`);
    try {
      const result = await runSerializableTransaction(async (tx) => {
        // Period first: consistent ordering with POS posting and period closing.
        const periods = await tx.$queryRaw<
          Array<{ id: string; fiscalYearId: string; status: string }>
        >`
        SELECT id, fiscalYearId, status FROM FinancePeriod
        WHERE startsOn <= ${accountingDate} AND endsOn >= ${accountingDate} FOR UPDATE`;
        const saleRows = await tx.$queryRaw<
          Array<{ id: string; status: string }>
        >`
        SELECT id, status FROM SalesOrder WHERE id = ${saleId} FOR UPDATE`;
        if (saleRows.length !== 1) fail("Sale not found.");
        if (saleRows[0].status !== "COMPLETED")
          fail("Only completed, unrefunded sales can be refunded.");
        const sale = await tx.salesOrder.findUniqueOrThrow({
          where: { id: saleId },
          include: {
            payments: true,
            items: { include: { finishedGoodsConsumptions: true } },
          },
        });
        if (sale.saleType !== "POS" || sale.originalSaleId)
          fail("Only original POS sales can be refunded.");
        if (!sale.payments.length || sale.payments.some((payment) => payment.status !== "COMPLETED"))
          fail("All original sale payments must be completed.");
        const paidTotal = sale.payments.reduce(
          (sum, payment) => sum.plus(payment.amount), new Prisma.Decimal(0),
        );
        if (!paidTotal.equals(sale.netTotal))
          fail("Payment total does not match sale total.");
        const originalJournal = await tx.financeJournal.findUnique({
          where: { idempotencyKey: `pos:sale:${sale.id}` },
          include: {
            lines: { include: { account: true }, orderBy: { lineNo: "asc" } },
          },
        });
        if (originalJournal) {
          if (process.env.FINANCE_POSTING_ENABLED !== "true")
            fail(
              "Finance posting must be enabled to refund an accounted sale.",
            );
          if (
            originalJournal.status !== "POSTED" ||
            originalJournal.sourceType !== "POS_SALE" ||
            originalJournal.sourceId !== sale.id
          )
            fail("Original sale journal is not eligible for refund.");
          if (periods.length !== 1 || periods[0].status !== "OPEN")
            fail("Refund accounting period is not open.");
          const existing = await tx.financeJournal.findUnique({
            where: { idempotencyKey: `pos:refund:${sale.id}` },
            select: { id: true },
          });
          if (existing) fail("Sale refund journal already exists.");
          // Validate each payment against its own debit line. A split sale has
          // N payment debits, one revenue credit, and optionally two COGS lines.
          // Do not assume a fixed number of journal lines.
          const allLines = originalJournal.lines;
          const paymentCount = sale.payments.length;
          const hasCost = !sale.cogsTotal.isZero();
          const expectedCount = paymentCount + 1 + (hasCost ? 2 : 0);
          if (allLines.length !== expectedCount ||
              allLines.some((line, index) => line.lineNo !== index + 1))
            fail("Original POS journal structure does not match the sale.");
          const paymentLines = allLines.slice(0, paymentCount);
          const revenueLine = allLines[paymentCount];
          const paymentAmounts = sale.payments.map((payment) => payment.amount.toFixed(2)).sort();
          const journalAmounts = paymentLines.map((line) => line.debit.toFixed(2)).sort();
          if (paymentLines.some((line) => line.account.type !== "ASSET" || !line.credit.isZero()) ||
              paymentAmounts.some((amount, index) => amount !== journalAmounts[index]) ||
              revenueLine.account.type !== "REVENUE" ||
              !revenueLine.debit.isZero() ||
              !revenueLine.credit.equals(sale.netTotal))
            fail("Original POS payment/revenue lines do not match the sale.");
          if (hasCost) {
            const costLine = allLines[paymentCount + 1];
            const inventoryLine = allLines[paymentCount + 2];
            if (costLine.account.type !== "EXPENSE" ||
                !costLine.debit.equals(sale.cogsTotal) || !costLine.credit.isZero() ||
                inventoryLine.account.type !== "ASSET" ||
                !inventoryLine.credit.equals(sale.cogsTotal) || !inventoryLine.debit.isZero())
              fail("Original POS cost/inventory lines do not match the sale.");
          }
          const eligible = parsed.data.restock
            ? allLines : allLines.slice(0, paymentCount + 1);
          const debit = eligible.reduce(
            (sum, line) => sum.plus(line.credit),
            new Prisma.Decimal(0),
          );
          const credit = eligible.reduce(
            (sum, line) => sum.plus(line.debit),
            new Prisma.Decimal(0),
          );
          if (!debit.equals(credit) || debit.lte(0))
            fail("Refund journal would be unbalanced.");
          await tx.financeJournal.create({
            data: {
              journalNo: `PRF-${sale.id}`,
              fiscalYearId: periods[0].fiscalYearId,
              periodId: periods[0].id,
              accountingDate,
              description:
                `POS refund ${sale.orderNo}: ${parsed.data.reason}`.slice(
                  0,
                  500,
                ),
              status: "POSTED",
              sourceType: "POS_REFUND",
              sourceId: sale.id,
              sourceEvent: "REFUNDED",
              idempotencyKey: `pos:refund:${sale.id}`,
              ...(parsed.data.restock
                ? { reversalOfId: originalJournal.id }
                : {}),
              createdById: actorId,
              postedById: actorId,
              postedAt: now,
              lines: {
                create: eligible.map((line, index) => ({
                  lineNo: index + 1,
                  accountId: line.accountId,
                  debit: line.credit,
                  credit: line.debit,
                  description: `Refund ${sale.orderNo}`,
                })),
              },
            },
          });
          if (parsed.data.restock)
            await tx.financeJournal.update({
              where: { id: originalJournal.id },
              data: { status: "REVERSED" },
            });
        } else if (process.env.FINANCE_POS_AUTO_POST_ENABLED === "true") {
          fail(
            "Original sale has no accounting journal while automatic posting is enabled.",
          );
        }
        if (parsed.data.restock) {
          const consumptions = sale.items.flatMap((item) =>
            item.finishedGoodsConsumptions.map((consumption) => ({
              item,
              consumption,
            })),
          );
          if (!consumptions.length)
            fail("No original finished-goods allocations found.");
          for (const { item, consumption } of consumptions) {
            const lot = await tx.finishedGoodsLot.findUniqueOrThrow({
              where: { id: consumption.finishedGoodsLotId },
            });
            if (lot.expiryDate && lot.expiryDate < now)
              fail("Expired stock cannot be returned to sellable inventory.");
            if (
              !lot.productId ||
              lot.productId !== item.productId ||
              lot.productSizeId !== item.productSizeId
            )
              fail(
                "Original stock allocation does not match the returned item.",
              );
            const updated = await tx.finishedGoodsLot.updateMany({
              where: {
                id: lot.id,
                remainingQty: {
                  lte: lot.producedQty.minus(consumption.consumedQty),
                },
              },
              data: { remainingQty: { increment: consumption.consumedQty } },
            });
            if (updated.count !== 1)
              fail("Restocking would exceed original lot quantity.");
            await tx.finishedGoodsMovement.create({
              data: {
                productId: item.productId,
                productSizeId: item.productSizeId,
                stockLotId: lot.id,
                movementType: "RETURN",
                refType: "POS_REFUND",
                refId: sale.id,
                qtyDelta: consumption.consumedQty,
                unitCost: consumption.unitCost,
                costAmount: consumption.costAmount,
                note: `Restocked after refund ${sale.orderNo}`,
                occurredAt: now,
              },
            });
          }
        }
        await tx.posPayment.updateMany({
          where: { salesOrderId: sale.id, status: "COMPLETED" },
          data: { status: "REFUNDED", voidedAt: now },
        });
        await tx.salesOrder.update({
          where: { id: sale.id },
          data: {
            status: "REFUNDED",
            reversalReason: parsed.data.reason,
            reversedAt: now,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: actorId,
            action: "REFUND",
            entityType: "SalesOrder",
            entityId: sale.id,
            afterJson: {
              orderNo: sale.orderNo,
              reason: parsed.data.reason,
              restock: parsed.data.restock,
              amount: sale.netTotal.toFixed(2),
              payments: sale.payments.map((payment) => ({
                id: payment.id,
                method: payment.method,
                amount: payment.amount.toFixed(2),
              })),
              refundedAt: now.toISOString(),
              externalRefundConfirmed: true,
            },
          },
        });
        return {
          saleId: sale.id,
          orderNo: sale.orderNo,
          status: "REFUNDED",
          restocked: parsed.data.restock,
          amount: sale.netTotal.toFixed(2),
          externalRefundConfirmed: true,
        };
      });
      return res
        .status(200)
        .json({
          message:
            "Refund recorded based on confirmed customer repayment. No payment provider transfer was initiated by the ERP.",
          refund: result,
        });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected error";
      if (message.startsWith("POS_REFUND: "))
        return res.status(409).json({ message: message.slice(12) });
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return res.status(409).json({ message: "Refund already recorded." });
      console.error("POS refund failed", error);
      return res.status(500).json({ message: "Failed to record POS refund." });
    }
  },
);
export default router;

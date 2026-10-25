/** @format */

import { Prisma, type PaymentMethod } from "@prisma/client";

/**
 * Opt-in POS accounting inside the EXISTING serializable sale transaction.
 * Disabled by default; no partial sale/accounting commits when enabled.
 * Do not enable until account mappings and isolated DB tests are complete.
 */
type SaleInput = {
  id: string;
  orderNo: string;
  soldAt: Date;
  businessDate: string;
  payments: Array<{ method: PaymentMethod; amount: number }>;
  netTotal: number;
  cogsTotal: number;
  createdById: string;
};

const paymentMappingKeys: Record<PaymentMethod, string> = {
  CASH: "POS_PAYMENT_CASH",
  CARD: "POS_PAYMENT_CARD",
  BANK_TRANSFER: "POS_PAYMENT_BANK_TRANSFER",
  ONLINE: "POS_PAYMENT_ONLINE",
  OTHER: "POS_PAYMENT_OTHER",
};

export async function recordPosSaleFinanceJournal(
  tx: Prisma.TransactionClient,
  sale: SaleInput,
) {
  if (process.env.FINANCE_POS_AUTO_POST_ENABLED !== "true") return;
  if (process.env.FINANCE_POSTING_ENABLED !== "true") {
    throw new Error("POS_FINANCE_POSTING_DISABLED");
  }
  const paymentKeys = sale.payments.map((payment) => paymentMappingKeys[payment.method]);
  const requiredKeys = [
    ...new Set([...paymentKeys, "POS_SALES_REVENUE", "POS_COGS", "POS_FINISHED_GOODS_INVENTORY"]),
  ];
  const mappings = await tx.financeAccountMapping.findMany({
    where: { key: { in: requiredKeys }, isActive: true },
    include: { account: true },
  });
  if (mappings.length !== requiredKeys.length) {
    throw new Error("POS_FINANCE_ACCOUNT_MAPPING_MISSING");
  }
  const byKey = new Map(mappings.map((mapping) => [mapping.key, mapping.account]));
  const paymentAccounts = paymentKeys.map((key) => byKey.get(key)!);
  const revenue = byKey.get("POS_SALES_REVENUE")!;
  const cogs = byKey.get("POS_COGS")!;
  const inventory = byKey.get("POS_FINISHED_GOODS_INVENTORY")!;
  if (mappings.some((mapping) => !mapping.account.isActive || !mapping.account.allowPosting)) {
    throw new Error("POS_FINANCE_ACCOUNTS_NOT_POSTABLE");
  }
  if (
    paymentAccounts.some((account) => account.type !== "ASSET") ||
    revenue.type !== "REVENUE" || cogs.type !== "EXPENSE" || inventory.type !== "ASSET"
  ) {
    throw new Error("POS_FINANCE_ACCOUNT_TYPES_INVALID");
  }
  if (new Set([revenue.id, cogs.id, inventory.id, ...paymentAccounts.map((a) => a.id)]).size !==
      new Set([revenue.id, cogs.id, inventory.id]).size + new Set(paymentAccounts.map((a) => a.id)).size) {
    throw new Error("POS_FINANCE_ACCOUNT_MAPPING_DUPLICATED");
  }
  const allocatedCents = sale.payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  if (!sale.payments.length || allocatedCents !== Math.round(sale.netTotal * 100)) {
    throw new Error("POS_FINANCE_PAYMENT_TOTAL_MISMATCH");
  }
  const net = new Prisma.Decimal(sale.netTotal.toFixed(2));
  const cost = new Prisma.Decimal(sale.cogsTotal.toFixed(2));
  if (net.lte(0) || cost.lt(0)) throw new Error("POS_FINANCE_INVALID_AMOUNTS");
  const accountingDate = new Date(`${sale.businessDate}T00:00:00.000Z`);
  if (Number.isNaN(accountingDate.getTime()))
    throw new Error("POS_FINANCE_INVALID_DATE");

  // Lock the period using the same protocol as journal posting / period closing.
  const periods = await tx.$queryRaw<
    Array<{ id: string; status: string; fiscalYearId: string }>
  >`
    SELECT id, status, fiscalYearId FROM FinancePeriod
    WHERE startsOn <= ${accountingDate} AND endsOn >= ${accountingDate} FOR UPDATE`;
  if (periods.length !== 1 || periods[0].status !== "OPEN") {
    throw new Error("POS_FINANCE_PERIOD_NOT_OPEN");
  }

  const zero = new Prisma.Decimal(0);
  const lines = [
    ...sale.payments.map((entry, index) => ({
      accountId: paymentAccounts[index].id,
      debit: new Prisma.Decimal(entry.amount.toFixed(2)), credit: zero,
    })),
    { accountId: revenue.id, debit: zero, credit: net },
    ...(cost.gt(0)
      ? [
          { accountId: cogs.id, debit: cost, credit: zero },
          { accountId: inventory.id, debit: zero, credit: cost },
        ]
      : []),
  ];
  await tx.financeJournal.create({
    data: {
      journalNo: `POS-${sale.id}`,
      fiscalYearId: periods[0].fiscalYearId,
      periodId: periods[0].id,
      accountingDate,
      description: `POS sale ${sale.orderNo}`,
      status: "POSTED",
      sourceType: "POS_SALE",
      sourceId: sale.id,
      sourceEvent: "COMPLETED",
      idempotencyKey: `pos:sale:${sale.id}`,
      createdById: sale.createdById,
      postedById: sale.createdById,
      postedAt: sale.soldAt,
      lines: {
        create: lines.map((line, index) => ({ lineNo: index + 1, ...line })),
      },
    },
  });
}

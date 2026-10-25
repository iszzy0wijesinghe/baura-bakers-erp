/** @format */

import { Router } from "express";
import { Prisma, type FinanceAccountType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { requirePermission } from "../../middleware/auth.middleware";

const router = Router();
const read = requirePermission("erp.finance.read");
const manage = requirePermission("erp.finance.manage");

const expected: Record<string, FinanceAccountType> = {
  POS_PAYMENT_CASH: "ASSET",
  POS_PAYMENT_CARD: "ASSET",
  POS_PAYMENT_BANK_TRANSFER: "ASSET",
  POS_PAYMENT_ONLINE: "ASSET",
  POS_PAYMENT_OTHER: "ASSET",
  POS_SALES_REVENUE: "REVENUE",
  POS_COGS: "EXPENSE",
  POS_FINISHED_GOODS_INVENTORY: "ASSET",
};

router.get("/account-mappings", read, async (_req, res) => {
  try {
    const mappings = await prisma.financeAccountMapping.findMany({
      include: {
        account: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            isActive: true,
            allowPosting: true,
          },
        },
      },
      orderBy: { key: "asc" },
    });
    res.json({ expected, mappings });
  } catch (error) {
    console.error("Finance mapping read failed", error);
    res.status(500).json({ message: "Unable to read accounting mappings" });
  }
});

router.put("/account-mappings/:key", manage, async (req, res) => {
  const rawKey = req.params.key;

  if (typeof rawKey !== "string") {
    return res.status(400).json({
      message: "Invalid accounting mapping key",
    });
  }

  const key: string = rawKey;
  if (!(key in expected))
    return res.status(400).json({ message: "Unsupported mapping key" });
  const accountId: unknown = req.body?.accountId;
  if (typeof accountId !== "string" || !/^[0-9a-f-]{36}$/i.test(accountId)) {
    return res.status(400).json({ message: "Valid accountId is required" });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.financeAccount.findUnique({
        where: { id: accountId },
      });
      if (
        !account ||
        !account.isActive ||
        !account.allowPosting ||
        account.type !== expected[key]
      ) {
        throw new Error("INVALID_ACCOUNT");
      }
      // Keep mapping and audit change in one transaction.
      const previous = await tx.financeAccountMapping.findUnique({
        where: { key },
      });
      const mapping = await tx.financeAccountMapping.upsert({
        where: { key },
        create: { key, accountId },
        update: { accountId, isActive: true },
        include: { account: true },
      });
      await tx.auditLog.create({
        data: {
          userId: req.user?.id ?? null,
          action: "FINANCE_ACCOUNT_MAPPING_UPDATED",
          entityType: "FinanceAccountMapping",
          entityId: mapping.id,
          beforeJson: previous
            ? { accountId: previous.accountId, isActive: previous.isActive }
            : Prisma.JsonNull,
          afterJson: { key, accountId, isActive: true },
          ipAddress: req.ip ?? null,
        },
      });
      return mapping;
    });
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ACCOUNT") {
      return res
        .status(400)
        .json({
          message: "Account must be active, postable, and of the correct type",
        });
    }
    console.error("Finance mapping update failed", error);
    res.status(500).json({ message: "Unable to update accounting mapping" });
  }
});

export default router;

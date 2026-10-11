import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import {
  authMiddleware,
  requireRoles
} from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

router.use(
  requireRoles(
    "ADMIN",
    "MANAGER"
  )
);

const createCarterSchema = z.object({
  purchasedAt: z.string().min(1, "Purchased date is required"),
  supplierName: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const addCarterItemSchema = z.object({
  ingredientId: z.string().uuid("Valid ingredient is required"),
  loadedQty: z.coerce.number().positive("Loaded quantity must be positive"),
  pricePerPackage: z.coerce.number().positive("Price must be positive"),
  expenses: z.array(z.object({ category: z.enum(["TRANSPORT", "DELIVERY", "PACKAGING", "HANDLING", "OTHER"]), description: z.string().max(500).optional(), amount: z.coerce.number().positive().max(999999999) })).max(20).default([])
});

function getDisplayName(ingredient: {
  brand: string | null;
  name: string;
  packageQty: unknown;
  packageUnit: string;
}) {
  const brand = ingredient.brand ? `${ingredient.brand} ` : "";
  return `${brand}${ingredient.name} ${ingredient.packageQty}${ingredient.packageUnit.toLowerCase()}`;
}

async function generateCarterNo() {
  const count = await prisma.purchaseCarter.count();
  return `CTR-${String(count + 1).padStart(5, "0")}`;
}

router.get("/", async (_req, res) => {
  const carters = await prisma.purchaseCarter.findMany({
    orderBy: { purchasedAt: "desc" },
    include: {
      items: {
        include: {
          ingredient: true,
          stockLots: true
        }
      },
      expenses: true
    }
  });

  return res.json({
    carters: carters.map((carter) => ({
      ...carter,
      itemCount: carter.items.length,
      totalCost: carter.items.reduce(
        (sum, item) => sum + (item.invalidatedAt ? 0 : Number(item.totalPrice)),
        0
      ) + carter.expenses.filter(e => e.treatment === "OPERATING").reduce((sum, e) => sum + Number(e.amount), 0)
    }))
  });
});

router.post("/", async (req, res) => {
  const parsed = createCarterSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid Carter data",
      errors: parsed.error.flatten()
    });
  }

  const carterNo = await generateCarterNo();

  const carter = await prisma.purchaseCarter.create({
    data: {
      carterNo,
      purchasedAt: new Date(parsed.data.purchasedAt),
      supplierName: parsed.data.supplierName || null,
      notes: parsed.data.notes || null,
      createdById: req.user?.id
    }
  });

  return res.status(201).json({ carter });
});

router.get("/:id", async (req, res) => {
  const carter = await prisma.purchaseCarter.findUnique({
    where: { id: req.params.id },
    include: {
      expenses: { include: { allocations: true }, orderBy: { createdAt: "desc" } },
      items: {
        include: {
          ingredient: true,
          stockLots: true,
          expenses: true,
          expenseAllocations: true
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!carter) {
    return res.status(404).json({ message: "Carter not found" });
  }

  return res.json({
    carter: {
      ...carter,
      items: carter.items.map((item) => ({
        ...item,
        ingredientDisplayName: getDisplayName(item.ingredient)
      })),
      totalCost: carter.items.reduce(
        (sum, item) => sum + (item.invalidatedAt ? 0 : Number(item.totalPrice)),
        0
      ) + carter.expenses.filter(e => e.treatment === "OPERATING").reduce((sum, e) => sum + Number(e.amount), 0)
    }
  });
});

router.post("/:id/items", async (req, res) => {
  const parsed = addCarterItemSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid Carter item data",
      errors: parsed.error.flatten()
    });
  }

  const carter = await prisma.purchaseCarter.findUnique({
    where: { id: req.params.id }
  });

  if (!carter) {
    return res.status(404).json({ message: "Carter not found" });
  }

  const ingredient = await prisma.ingredient.findUnique({
    where: { id: parsed.data.ingredientId }
  });

  if (!ingredient || !ingredient.isActive) {
    return res.status(404).json({ message: "Active ingredient not found" });
  }

  const baseQty = new Prisma.Decimal(ingredient.baseQty);
  const loadedQty = new Prisma.Decimal(parsed.data.loadedQty);
  const pricePerPackage = new Prisma.Decimal(parsed.data.pricePerPackage);
  const totalBaseQty = baseQty.mul(loadedQty);
  const purchasePrice = pricePerPackage.mul(loadedQty).toDecimalPlaces(2);
  const expenses = parsed.data.expenses.map(e => ({ ...e, amount: new Prisma.Decimal(e.amount).toDecimalPlaces(2) }));
  if (expenses.some(e => new Prisma.Decimal(e.amount).dp() > 2)) return res.status(400).json({ message: "Expense amounts must use two decimal places" });
  const expenseTotal = expenses.reduce((sum, e) => sum.plus(e.amount), new Prisma.Decimal(0));
  const totalPrice = purchasePrice.plus(expenseTotal);
  if (baseQty.lte(0) || loadedQty.dp() > 3 || totalBaseQty.dp() > 3 || pricePerPackage.dp() > 2 || totalPrice.gt("9999999999.99")) {
    return res.status(400).json({ message: "Invalid package configuration, quantity or price precision" });
  }
  const unitCostBase = totalPrice.div(totalBaseQty).toDecimalPlaces(6);

  const result = await prisma.$transaction(async (tx) => {
    const carterItem = await tx.purchaseCarterItem.create({
      data: {
        carterId: carter.id,
        ingredientId: ingredient.id,
        loadedQty: parsed.data.loadedQty,
        pricePerPackage,
        totalBaseQty,
        totalPrice,
        unitCostBase
      }
    });

    for (const expense of expenses) {
      const created = await tx.carterPurchaseExpense.create({ data: {
        carterId: carter.id, itemId: carterItem.id, category: expense.category,
        treatment: "INVENTORY", description: expense.description || null,
        amount: expense.amount, createdById: req.user?.id || null
      }});
      await tx.carterExpenseAllocation.create({ data: {
        expenseId: created.id, itemId: carterItem.id, amount: expense.amount
      }});
    }
    const stockLot = await tx.ingredientStockLot.create({
      data: {
        carterItemId: carterItem.id,
        ingredientId: ingredient.id,
        receivedBaseQty: totalBaseQty,
        remainingBaseQty: totalBaseQty,
        baseUnit: ingredient.baseUnit,
        unitCostBase,
        receivedAt: carter.purchasedAt
      }
    });

    await tx.stockMovement.create({
      data: {
        ingredientId: ingredient.id,
        stockLotId: stockLot.id,
        movementType: "PURCHASE",
        refType: "CARTER_ITEM",
        refId: carterItem.id,
        qtyDelta: totalBaseQty,
        unitCostBase,
        costAmount: totalPrice,
        note: `Purchased through ${carter.carterNo}`
      }
    });

    return { carterItem, stockLot };
  });

  return res.status(201).json({
    message: "Carter item added and stock lot created",
    item: result.carterItem,
    stockLot: result.stockLot
  });
});

// Clear only the remaining stock associated with one Carter item.
// Historical purchases and consumption records are deliberately preserved.
const clearStockSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  confirmation: z.literal("CLEAR STOCK")
});

router.post("/:id/items/:itemId/clear-stock", async (req, res) => {
  const parsed = clearStockSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "A reason and CLEAR STOCK confirmation are required" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.purchaseCarterItem.findFirst({
        where: { id: req.params.itemId, carterId: req.params.id },
        include: { stockLots: true }
      });
      if (!item) return null;
      if (!item.stockLots.length) throw new Error("Carter item has no stock lots");

      let removed = new Prisma.Decimal(0);
      let value = new Prisma.Decimal(0);
      for (const lot of item.stockLots) {
        const qty = new Prisma.Decimal(lot.remainingBaseQty);
        if (qty.lte(0)) continue;
        const changed = await tx.ingredientStockLot.updateMany({
          where: { id: lot.id, remainingBaseQty: qty },
          data: { remainingBaseQty: 0 }
        });
        if (changed.count !== 1) throw new Error("Stock changed during adjustment; retry");
        const cost = qty.mul(lot.unitCostBase);
        await tx.stockMovement.create({
          data: {
            ingredientId: lot.ingredientId,
            stockLotId: lot.id,
            movementType: "ADJUSTMENT",
            refType: "CARTER_ITEM_STOCK_CLEAR",
            refId: item.id,
            qtyDelta: qty.neg(),
            unitCostBase: lot.unitCostBase,
            costAmount: cost.neg().toDecimalPlaces(2),
            note: `Carter item stock cleared by ${req.user?.id || "unknown"}: ${parsed.data.reason}`
          }
        });
        removed = removed.plus(qty);
        value = value.plus(cost);
      }
      return {
        itemId: item.id,
        removedQuantity: removed.toString(),
        removedValue: value.toDecimalPlaces(2).toString(),
        unit: item.stockLots[0].baseUnit,
        alreadyEmpty: removed.isZero()
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    if (!result) return res.status(404).json({ message: "Carter item not found" });
    return res.json({ message: result.alreadyEmpty ? "Stock already empty" : "Item stock cleared", ...result });
  } catch (error) {
    console.error("Carter item stock clear failed", error);
    return res.status(409).json({ message: error instanceof Error ? error.message : "Stock adjustment failed" });
  }
});


// Invalidate a purchase entry only when its lots have never been consumed or adjusted.
// Preserve the item and original purchase movement for auditability.
const invalidateSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  confirmation: z.literal("INVALIDATE ITEM")
});

router.post("/:id/items/:itemId/invalidate", async (req, res) => {
  const parsed = invalidateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Reason and INVALIDATE ITEM confirmation required" });
  try {
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.purchaseCarterItem.findFirst({
        where: { id: req.params.itemId, carterId: req.params.id },
        include: { stockLots: true }
      });
      if (!item) return { status: 404, message: "Carter item not found" };
      if (item.invalidatedAt) return { status: 409, message: "Carter item already invalidated" };
      if (await tx.carterExpenseAllocation.count({ where: { itemId: item.id } })) return { status: 409, message: "Item has allocated expenses; invalidation requires accounting review" };
      if (item.stockLots.length === 0) return { status: 409, message: "Item has no stock lots; manual review required" };
      for (const lot of item.stockLots) {
        const [production, fifo, movements] = await Promise.all([
          tx.productionConsumption.count({ where: { stockLotId: lot.id } }),
          tx.saleItemFifoConsumption.count({ where: { stockLotId: lot.id } }),
          tx.stockMovement.findMany({ where: { stockLotId: lot.id }, select: { movementType: true, refType: true, refId: true } })
        ]);
        if (production || fifo || movements.some(m => m.movementType !== "PURCHASE") ||
          movements.some(m => m.refType !== "CARTER_ITEM" || m.refId !== item.id) ||
          new Prisma.Decimal(lot.remainingBaseQty).cmp(lot.receivedBaseQty) !== 0) {
          return { status: 409, message: "Item has consumption or stock adjustments. Use a controlled correction; invalidation is blocked." };
        }
      }
      for (const lot of item.stockLots) {
        const qty = new Prisma.Decimal(lot.remainingBaseQty);
        const changed = await tx.ingredientStockLot.updateMany({
          where: { id: lot.id, remainingBaseQty: qty },
          data: { remainingBaseQty: 0 }
        });
        if (changed.count !== 1) throw new Error("Concurrent stock update; retry");
        await tx.stockMovement.create({ data: {
          ingredientId: lot.ingredientId, stockLotId: lot.id,
          movementType: "ADJUSTMENT", refType: "CARTER_ITEM_INVALIDATION", refId: item.id,
          qtyDelta: qty.neg(), unitCostBase: lot.unitCostBase,
          costAmount: qty.mul(lot.unitCostBase).neg().toDecimalPlaces(2),
          note: `Invalidated by ${req.user?.id || "unknown"}: ${parsed.data.reason}`
        }});
      }
      await tx.purchaseCarterItem.update({ where: { id: item.id }, data: {
        invalidatedAt: new Date(), invalidReason: parsed.data.reason,
        invalidatedById: req.user?.id || null
      }});
      return { status: 200, message: "Carter item invalidated; its remaining stock was reversed" };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    return res.status(result.status).json({ message: result.message });
  } catch (error) {
    console.error("Carter item invalidation failed", error);
    return res.status(409).json({ message: "Invalidation failed. Check stock history and retry." });
  }
});


const expenseSchema = z.object({
  category: z.enum(["TRANSPORT", "DELIVERY", "PACKAGING", "HANDLING", "OTHER"]),
  treatment: z.enum(["INVENTORY", "OPERATING"]).default("INVENTORY"),
  description: z.string().trim().max(500).optional(),
  amount: z.coerce.number().positive().max(999999999)
});

// Revalue only untouched stock lots. Existing production and sale costs are immutable.
async function applyExpenseToItem(tx: Prisma.TransactionClient, itemId: string, amount: Prisma.Decimal) {
  const item = await tx.purchaseCarterItem.findUnique({
    where: { id: itemId }, include: { stockLots: true }
  });
  if (!item || item.invalidatedAt || !item.stockLots.length) throw new Error("Item is unavailable for inventory revaluation");
  if (item.stockLots.length !== 1) throw new Error("Multi-lot purchase requires manual valuation review");
  const lotIds = item.stockLots.map(lot => lot.id);
  const [productionCount, saleCount, otherMovements] = await Promise.all([
    tx.productionConsumption.count({ where: { stockLotId: { in: lotIds } } }),
    tx.saleItemFifoConsumption.count({ where: { stockLotId: { in: lotIds } } }),
    tx.stockMovement.count({ where: { stockLotId: { in: lotIds }, NOT: [{ movementType: "PURCHASE" }, { refType: "CARTER_EXPENSE_REVALUE" }] } })
  ]);
  if (productionCount || saleCount || otherMovements || item.stockLots.some(lot => !lot.remainingBaseQty.equals(lot.receivedBaseQty))) {
    throw new Error("Stock has been consumed or adjusted. Inventory expenses cannot be added retroactively; record an operating expense instead.");
  }
  const newTotal = new Prisma.Decimal(item.totalPrice).plus(amount);
  const newUnitCost = newTotal.div(item.totalBaseQty).toDecimalPlaces(6);
  for (const lot of item.stockLots) {
    const changed = await tx.ingredientStockLot.updateMany({
      where: { id: lot.id, remainingBaseQty: lot.receivedBaseQty, unitCostBase: lot.unitCostBase },
      data: { unitCostBase: newUnitCost }
    });
    if (changed.count !== 1) throw new Error("Stock was modified concurrently; retry");
    // The original purchase movement remains an immutable record of receipt.
    // A zero-quantity adjustment captures the additional inventory valuation.
    await tx.stockMovement.create({ data: {
      ingredientId: lot.ingredientId, stockLotId: lot.id,
      movementType: "ADJUSTMENT", refType: "CARTER_EXPENSE_REVALUE", refId: itemId,
      qtyDelta: 0, unitCostBase: newUnitCost, costAmount: amount,
      note: "Additional purchase expense capitalized to untouched stock"
    }});
  }
  await tx.purchaseCarterItem.update({ where: { id: itemId }, data: {
    totalPrice: newTotal, unitCostBase: newUnitCost
  }});
}

router.post("/:id/items/:itemId/expenses", async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid expense", errors: parsed.error.flatten() });
  const amount = new Prisma.Decimal(parsed.data.amount).toDecimalPlaces(2);
  if (new Prisma.Decimal(parsed.data.amount).dp() > 2) return res.status(400).json({ message: "Amount must have at most two decimal places" });
  try {
    const result = await prisma.$transaction(async tx => {
      const item = await tx.purchaseCarterItem.findFirst({ where: { id: req.params.itemId, carterId: req.params.id } });
      if (!item || item.invalidatedAt) return null;
      if (parsed.data.treatment === "INVENTORY") await applyExpenseToItem(tx, item.id, amount);
      const expense = await tx.carterPurchaseExpense.create({ data: {
        carterId: req.params.id, itemId: item.id, category: parsed.data.category,
        treatment: parsed.data.treatment, description: parsed.data.description || null,
        amount, createdById: req.user?.id || null
      }});
      if (parsed.data.treatment === "INVENTORY") await tx.carterExpenseAllocation.create({ data: {
        expenseId: expense.id, itemId: item.id, amount
      }});
      return expense;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    if (!result) return res.status(404).json({ message: "Active Carter item not found" });
    return res.status(201).json({ expense: result });
  } catch (error) {
    return res.status(409).json({ message: error instanceof Error ? error.message : "Expense could not be added" });
  }
});

router.post("/:id/expenses", async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid expense", errors: parsed.error.flatten() });
  if (new Prisma.Decimal(parsed.data.amount).dp() > 2) return res.status(400).json({ message: "Amount must have at most two decimal places" });
  const amount = new Prisma.Decimal(parsed.data.amount);
  try {
    const expense = await prisma.$transaction(async tx => {
      const carter = await tx.purchaseCarter.findUnique({ where: { id: req.params.id }, include: { items: true } });
      if (!carter) return null;
      const activeItems = carter.items.filter(item => !item.invalidatedAt);
      if (parsed.data.treatment === "INVENTORY" && !activeItems.length) throw new Error("Add at least one valid item before allocating inventory expenses");
      const allocations: { itemId: string; amount: Prisma.Decimal }[] = [];
      if (parsed.data.treatment === "INVENTORY") {
        const base = activeItems.reduce((sum, item) => sum.plus(item.totalPrice), new Prisma.Decimal(0));
        if (base.lte(0)) throw new Error("Carter purchase total must be positive");
        let allocated = new Prisma.Decimal(0);
        activeItems.forEach((item, index) => {
          const share = index === activeItems.length - 1
            ? amount.minus(allocated)
            : amount.mul(item.totalPrice).div(base).toDecimalPlaces(2);
          allocations.push({ itemId: item.id, amount: share });
          allocated = allocated.plus(share);
        });
        for (const allocation of allocations) {
          if (allocation.amount.gt(0)) await applyExpenseToItem(tx, allocation.itemId, allocation.amount);
        }
      }
      const created = await tx.carterPurchaseExpense.create({ data: {
        carterId: carter.id, category: parsed.data.category,
        treatment: parsed.data.treatment, description: parsed.data.description || null,
        amount, createdById: req.user?.id || null
      }});
      for (const allocation of allocations) {
        if (allocation.amount.gt(0)) await tx.carterExpenseAllocation.create({ data: {
          expenseId: created.id, itemId: allocation.itemId, amount: allocation.amount
        }});
      }
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    if (!expense) return res.status(404).json({ message: "Carter not found" });
    return res.status(201).json({ expense });
  } catch (error) {
    return res.status(409).json({ message: error instanceof Error ? error.message : "Expense could not be added" });
  }
});

export default router;
import { Router } from "express";
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
  pricePerPackage: z.coerce.number().positive("Price must be positive")
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
      }
    }
  });

  return res.json({
    carters: carters.map((carter) => ({
      ...carter,
      itemCount: carter.items.length,
      totalCost: carter.items.reduce(
        (sum, item) => sum + Number(item.totalPrice),
        0
      )
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
      items: {
        include: {
          ingredient: true,
          stockLots: true
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
        (sum, item) => sum + Number(item.totalPrice),
        0
      )
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

  const totalBaseQty = Number(ingredient.baseQty) * parsed.data.loadedQty;
  const totalPrice = parsed.data.pricePerPackage * parsed.data.loadedQty;
  const unitCostBase = totalPrice / totalBaseQty;

  const result = await prisma.$transaction(async (tx) => {
    const carterItem = await tx.purchaseCarterItem.create({
      data: {
        carterId: carter.id,
        ingredientId: ingredient.id,
        loadedQty: parsed.data.loadedQty,
        pricePerPackage: parsed.data.pricePerPackage,
        totalBaseQty,
        totalPrice,
        unitCostBase
      }
    });

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

export default router;
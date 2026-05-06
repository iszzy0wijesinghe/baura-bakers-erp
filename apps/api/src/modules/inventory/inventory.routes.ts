import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

function getDisplayName(ingredient: {
  brand: string | null;
  name: string;
  packageQty: unknown;
  packageUnit: string;
}) {
  const brand = ingredient.brand ? `${ingredient.brand} ` : "";
  return `${brand}${ingredient.name} ${ingredient.packageQty}${ingredient.packageUnit.toLowerCase()}`;
}

router.get("/", async (_req, res) => {
  const ingredients = await prisma.ingredient.findMany({
    where: {
      isActive: true
    },
    orderBy: [{ brand: "asc" }, { name: "asc" }],
    include: {
      stockLots: {
        where: {
          remainingBaseQty: {
            gt: 0
          }
        },
        orderBy: {
          receivedAt: "asc"
        }
      }
    }
  });

  const inventory = ingredients.map((ingredient) => {
    const qtyOnHand = ingredient.stockLots.reduce(
      (sum, lot) => sum + Number(lot.remainingBaseQty),
      0
    );

    const stockValue = ingredient.stockLots.reduce(
      (sum, lot) =>
        sum + Number(lot.remainingBaseQty) * Number(lot.unitCostBase),
      0
    );

    const lowStockAlertQty =
      ingredient.lowStockAlertQty !== null
        ? Number(ingredient.lowStockAlertQty)
        : null;

    const isOutOfStock = qtyOnHand <= 0;

    const isLowStock =
      !isOutOfStock &&
      lowStockAlertQty !== null &&
      qtyOnHand <= lowStockAlertQty;

    let stockPriority = 3;

    if (isOutOfStock) {
      stockPriority = 1;
    } else if (isLowStock) {
      stockPriority = 2;
    }

    return {
      ingredientId: ingredient.id,
      displayName: getDisplayName(ingredient),
      baseUnit: ingredient.baseUnit,
      qtyOnHand,
      stockValue,
      lowStockAlertQty,
      isOutOfStock,
      isLowStock,
      stockPriority,
      stockLotCount: ingredient.stockLots.length,
      oldestLotDate: ingredient.stockLots[0]?.receivedAt || null,
      latestLotDate:
        ingredient.stockLots[ingredient.stockLots.length - 1]?.receivedAt ||
        null
    };
  });

  inventory.sort((a, b) => {
    if (a.stockPriority !== b.stockPriority) {
      return a.stockPriority - b.stockPriority;
    }

    if (a.isLowStock && b.isLowStock) {
      return a.qtyOnHand - b.qtyOnHand;
    }

    return a.displayName.localeCompare(b.displayName);
  });

  const stats = {
    totalActiveIngredients: inventory.length,
    outOfStockItems: inventory.filter((item) => item.isOutOfStock).length,
    lowStockItems: inventory.filter((item) => item.isLowStock).length,
    healthyStockItems: inventory.filter(
      (item) => !item.isOutOfStock && !item.isLowStock
    ).length,
    totalStockValue: inventory.reduce(
      (sum, item) => sum + Number(item.stockValue || 0),
      0
    )
  };

  return res.json({
    inventory,
    stats
  });
});

export default router;
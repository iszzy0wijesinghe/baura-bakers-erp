import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getRouteParam } from "../../lib/http";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

type StockStatus =
  | "IN_STOCK"
  | "LOW_STOCK"
  | "OUT_OF_STOCK"
  | "EXPIRED_ONLY";

type DecimalValue = Prisma.Decimal | number | string;

type StockLot = {
  productSizeId: string | null;
  remainingQty: DecimalValue;
  unitCost: DecimalValue;
  expiryDate: Date | null;
};

type StockCalculation = {
  availableQty: number;
  expiredQty: number;
  totalOnHand: number;
  weightedAverageCost: number;
  sellableValue: number;
  expiredValue: number;
  stockValue: number;
  lotCount: number;
  status: StockStatus;
};

type BakeryStockItem = StockCalculation & {
  productId: string;
  name: string;
  variantName: string | null;
  sellPrice: DecimalValue | null;
  finishedStockAlertQty: DecimalValue | null;
  productSizeId: string | null;
  productSizeLabel: string | null;
  officialSiteSizeId: number | null;
  displayName: string;
  isLegacyStock: boolean;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

function getProductDisplayName(product: {
  name: string;
  variantName: string | null;
}): string {
  return product.variantName
    ? `${product.name} - ${product.variantName}`
    : product.name;
}

function isExpired(
  expiryDate: Date | null,
  now: Date = new Date()
): boolean {
  return Boolean(
    expiryDate && expiryDate.getTime() < now.getTime()
  );
}

function calculateStock(
  lots: StockLot[],
  threshold: number | null,
  now: Date
): StockCalculation {
  let availableQty = 0;
  let expiredQty = 0;
  let totalOnHand = 0;
  let sellableValue = 0;
  let expiredValue = 0;

  for (const lot of lots) {
    const quantity = Number(lot.remainingQty);
    const unitCost = Number(lot.unitCost);
    const value = quantity * unitCost;

    totalOnHand += quantity;

    if (isExpired(lot.expiryDate, now)) {
      expiredQty += quantity;
      expiredValue += value;
    } else {
      availableQty += quantity;
      sellableValue += value;
    }
  }

  let status: StockStatus;

  if (availableQty <= 0) {
    status = expiredQty > 0
      ? "EXPIRED_ONLY"
      : "OUT_OF_STOCK";
  } else if (
    threshold !== null &&
    availableQty <= threshold
  ) {
    status = "LOW_STOCK";
  } else {
    status = "IN_STOCK";
  }

  return {
    availableQty: round3(availableQty),
    expiredQty: round3(expiredQty),
    totalOnHand: round3(totalOnHand),
    weightedAverageCost:
      availableQty > 0
        ? round6(sellableValue / availableQty)
        : 0,
    sellableValue: round2(sellableValue),
    expiredValue: round2(expiredValue),
    stockValue: round2(sellableValue),
    lotCount: lots.length,
    status
  };
}

function sortLots<
  T extends {
    expiryDate: Date | null;
    producedAt: Date;
  }
>(lots: T[]): T[] {
  return [...lots].sort((first, second) => {
    if (first.expiryDate && second.expiryDate) {
      const difference =
        first.expiryDate.getTime() -
        second.expiryDate.getTime();

      if (difference !== 0) {
        return difference;
      }
    } else if (first.expiryDate) {
      return -1;
    } else if (second.expiryDate) {
      return 1;
    }

    return (
      first.producedAt.getTime() -
      second.producedAt.getTime()
    );
  });
}

/**
 * GET /bakery-stock
 *
 * Returns size-specific finished-goods inventory.
 *
 * Products with sizes:
 * - One row per configured size.
 * - Historical unassigned stock appears separately.
 *
 * Products without sizes:
 * - One product-level stock row.
 */
router.get("/", async (_req, res) => {
  try {
    const now = new Date();

    const products = await prisma.product.findMany({
      where: {
        isActive: true
      },
      orderBy: [
        {
          name: "asc"
        },
        {
          variantName: "asc"
        }
      ],
      include: {
        sizes: {
          orderBy: [
            {
              sortOrder: "asc"
            },
            {
              label: "asc"
            }
          ]
        },
        finishedGoodsLots: {
          where: {
            remainingQty: {
              gt: 0
            }
          },
          orderBy: {
            producedAt: "asc"
          }
        }
      }
    });

    const items: BakeryStockItem[] = [];

    for (const product of products) {
      const displayName = getProductDisplayName(product);

      const threshold =
        product.finishedStockAlertQty !== null
          ? Number(product.finishedStockAlertQty)
          : null;

      const base = {
        productId: product.id,
        name: product.name,
        variantName: product.variantName,
        sellPrice: product.sellPrice,
        finishedStockAlertQty:
          product.finishedStockAlertQty
      };

      if (product.sizes.length === 0) {
        const stock = calculateStock(
          product.finishedGoodsLots,
          threshold,
          now
        );

        const item: BakeryStockItem = {
          ...base,
          productSizeId: null,
          productSizeLabel: null,
          officialSiteSizeId: null,
          displayName,
          isLegacyStock: false,
          ...stock
        };

        items.push(item);
        continue;
      }

      for (const size of product.sizes) {
        const sizeLots = product.finishedGoodsLots.filter(
          (lot) => lot.productSizeId === size.id
        );

        const stock = calculateStock(
          sizeLots,
          threshold,
          now
        );

        const item: BakeryStockItem = {
          ...base,
          productSizeId: size.id,
          productSizeLabel: size.label,
          officialSiteSizeId: size.officialSiteSizeId,
          sellPrice: size.price,
          displayName: `${displayName} - ${size.label}`,
          isLegacyStock: false,
          ...stock
        };

        items.push(item);
      }

      const legacyLots = product.finishedGoodsLots.filter(
        (lot) => lot.productSizeId === null
      );

      if (legacyLots.length > 0) {
        const legacyStock = calculateStock(
          legacyLots,
          threshold,
          now
        );

        const legacyItem: BakeryStockItem = {
          ...base,
          productSizeId: null,
          productSizeLabel: "Unassigned / Legacy",
          officialSiteSizeId: null,
          displayName: `${displayName} - Unassigned / Legacy`,
          isLegacyStock: true,
          ...legacyStock
        };

        items.push(legacyItem);
      }
    }

    const summary = {
      activeProducts: products.length,
      stockVariants: items.length,
      productsInStock: items.filter(
        (item) => item.availableQty > 0
      ).length,
      lowStockProducts: items.filter(
        (item) => item.status === "LOW_STOCK"
      ).length,
      outOfStockProducts: items.filter(
        (item) =>
          item.status === "OUT_OF_STOCK" ||
          item.status === "EXPIRED_ONLY"
      ).length,
      totalAvailableUnits: round3(
        items.reduce(
          (total, item) => total + item.availableQty,
          0
        )
      ),
      totalExpiredUnits: round3(
        items.reduce(
          (total, item) => total + item.expiredQty,
          0
        )
      ),
      totalStockValue: round2(
        items.reduce(
          (total, item) => total + item.stockValue,
          0
        )
      ),
      totalExpiredValue: round2(
        items.reduce(
          (total, item) => total + item.expiredValue,
          0
        )
      )
    };

    return res.json({
      summary,
      items
    });
  } catch (error) {
    return res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to load Bakery Stock"
    });
  }
});

/**
 * GET /bakery-stock/:productId
 *
 * Optional query parameters:
 *
 * ?productSizeId=<uuid>
 * ?productSizeId=legacy
 *
 * Without a size filter:
 * Returns all stock lots and movements for the product.
 *
 * With a size filter:
 * Returns only the selected size's stock and movements.
 *
 * With "legacy":
 * Returns historical unassigned stock.
 */
router.get("/:productId", async (req, res) => {
  try {
    const productId = getRouteParam(
      req.params.productId,
      "Product id"
    );

    const rawSizeId = req.query.productSizeId;

    if (
      rawSizeId !== undefined &&
      typeof rawSizeId !== "string"
    ) {
      return res.status(400).json({
        message: "Invalid product size filter"
      });
    }

    const requestedSizeId = rawSizeId?.trim() || null;
    const filterLegacy = requestedSizeId === "legacy";

    const now = new Date();

    const product = await prisma.product.findUnique({
      where: {
        id: productId
      },
      include: {
        sizes: {
          orderBy: [
            {
              sortOrder: "asc"
            },
            {
              label: "asc"
            }
          ]
        },
        finishedGoodsLots: {
          where: {
            remainingQty: {
              gt: 0
            }
          },
          include: {
            productSize: {
              select: {
                id: true,
                label: true,
                officialSiteSizeId: true
              }
            },
            productionBatch: {
              select: {
                batchNo: true,
                productionDate: true,
                rejectedQty: true
              }
            }
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    if (
      requestedSizeId &&
      !filterLegacy &&
      !product.sizes.some(
        (size) => size.id === requestedSizeId
      )
    ) {
      return res.status(400).json({
        message:
          "The selected size does not belong to this product"
      });
    }

    const selectedSize =
      requestedSizeId && !filterLegacy
        ? product.sizes.find(
            (size) => size.id === requestedSizeId
          ) ?? null
        : null;

    const movementFilter: Prisma.FinishedGoodsMovementWhereInput = {
      productId
    };

    if (requestedSizeId) {
      movementFilter.productSizeId = filterLegacy
        ? null
        : requestedSizeId;
    }

    const movements =
      await prisma.finishedGoodsMovement.findMany({
        where: movementFilter,
        orderBy: {
          occurredAt: "desc"
        },
        take: 100,
        include: {
          productSize: {
            select: {
              id: true,
              label: true
            }
          }
        }
      });

    const filteredLots = product.finishedGoodsLots.filter(
      (lot) => {
        if (!requestedSizeId) {
          return true;
        }

        return filterLegacy
          ? lot.productSizeId === null
          : lot.productSizeId === requestedSizeId;
      }
    );

    const lots = sortLots(filteredLots).map((lot) => ({
      id: lot.id,
      productionBatchId: lot.productionBatchId,
      batchNo: lot.productionBatch.batchNo,
      productSizeId: lot.productSizeId,
      productSizeLabel: lot.productSize?.label ?? null,
      producedQty: lot.producedQty,
      remainingQty: lot.remainingQty,
      unitCost: lot.unitCost,
      producedAt: lot.producedAt,
      expiryDate: lot.expiryDate,
      rejectedQty: lot.productionBatch.rejectedQty,
      isExpired: isExpired(lot.expiryDate, now),
      stockValue: round2(
        Number(lot.remainingQty) *
          Number(lot.unitCost)
      )
    }));

    const threshold =
      product.finishedStockAlertQty !== null
        ? Number(product.finishedStockAlertQty)
        : null;

    const stock = calculateStock(
      filteredLots,
      threshold,
      now
    );

    return res.json({
      product: {
        id: product.id,
        displayName: getProductDisplayName(product),
        sellPrice: selectedSize?.price ?? product.sellPrice,
        finishedStockAlertQty:
          product.finishedStockAlertQty,
        productSizeId: selectedSize?.id ?? null,
        productSizeLabel: filterLegacy
          ? "Unassigned / Legacy"
          : selectedSize?.label ?? null,
        sizes: product.sizes.map((size) => ({
          id: size.id,
          label: size.label,
          officialSiteSizeId: size.officialSiteSizeId,
          price: size.price
        }))
      },
      stock,
      lots,
      movements: movements.map((movement) => ({
        id: movement.id,
        stockLotId: movement.stockLotId,
        productSizeId: movement.productSizeId,
        productSizeLabel:
          movement.productSize?.label ?? null,
        movementType: movement.movementType,
        refType: movement.refType,
        refId: movement.refId,
        qtyDelta: movement.qtyDelta,
        unitCost: movement.unitCost,
        costAmount: movement.costAmount,
        note: movement.note,
        occurredAt: movement.occurredAt
      }))
    });
  } catch (error) {
    return res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to load Bakery Stock details"
    });
  }
});

export default router;
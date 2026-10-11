import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import {
  authMiddleware,
  requirePermission
} from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

type StockLot = {
  productSizeId: string | null;
  remainingQty: Prisma.Decimal;
  expiryDate: Date | null;
};

type StockAvailability = {
  availableQty: number;
  inStock: boolean;
  isLowStock: boolean;
};

const productSelect = {
  id: true,
  officialSiteProductId: true,
  name: true,
  variantName: true,
  imageUrl: true,
  sellPrice: true,
  finishedStockAlertQty: true,
  officialSiteSyncedAt: true,
  sizes: {
    where: {
      isActive: true
    },
    orderBy: [
      { sortOrder: "asc" },
      { label: "asc" }
    ],
    select: {
      id: true,
      label: true,
      serves: true,
      price: true,
      officialSiteSizeId: true
    }
  },
  finishedGoodsLots: {
    where: {
      remainingQty: {
        gt: 0
      }
    },
    select: {
      productSizeId: true,
      remainingQty: true,
      expiryDate: true
    }
  }
} satisfies Prisma.ProductSelect;

type CatalogueProductRecord = Prisma.ProductGetPayload<{
  select: typeof productSelect;
}>;

function decimalToNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

function getDisplayName(product: {
  name: string;
  variantName: string | null;
}): string {
  return product.variantName
    ? `${product.name} - ${product.variantName}`
    : product.name;
}

function isLotSellable(
  expiryDate: Date | null,
  now: Date
): boolean {
  return (
    expiryDate === null ||
    expiryDate.getTime() >= now.getTime()
  );
}

function calculateAvailability(
  lots: StockLot[],
  lowStockThreshold: number | null,
  now: Date,
  productSizeId: string | null
): StockAvailability {
  const availableQty = round3(
    lots.reduce((total, lot) => {
      if (lot.productSizeId !== productSizeId) {
        return total;
      }

      if (!isLotSellable(lot.expiryDate, now)) {
        return total;
      }

      return total + decimalToNumber(lot.remainingQty);
    }, 0)
  );

  return {
    availableQty,
    inStock: availableQty > 0,
    isLowStock:
      lowStockThreshold !== null &&
      availableQty <= lowStockThreshold
  };
}

function buildCatalogueProduct(
  product: CatalogueProductRecord,
  now: Date
) {
  const lowStockThreshold =
    product.finishedStockAlertQty === null
      ? null
      : decimalToNumber(product.finishedStockAlertQty);

  const hasSizes = product.sizes.length > 0;

  const sizes = product.sizes.map((size) => {
    const stock = calculateAvailability(
      product.finishedGoodsLots,
      lowStockThreshold,
      now,
      size.id
    );

    return {
      id: size.id,
      label: size.label,
      serves: size.serves,
      price: decimalToNumber(size.price),
      officialSiteSizeId: size.officialSiteSizeId,
      ...stock
    };
  });

  const standardStock = calculateAvailability(
    product.finishedGoodsLots,
    lowStockThreshold,
    now,
    null
  );

  const totalSizedAvailableQty = sizes.reduce(
    (total, size) => total + size.availableQty,
    0
  );

  const availableQty = hasSizes
    ? round3(totalSizedAvailableQty)
    : standardStock.availableQty;

  const isLowStock = hasSizes
    ? sizes.some((size) => size.isLowStock)
    : standardStock.isLowStock;

  return {
    id: product.id,
    officialSiteProductId: product.officialSiteProductId,
    name: product.name,
    variantName: product.variantName,
    displayName: getDisplayName(product),
    imageUrl: product.imageUrl,
    sellPrice: decimalToNumber(product.sellPrice),
    sizes,
    availableQty,
    inStock: availableQty > 0,
    lowStockThreshold,
    isLowStock,
    hasSizes,
    legacyAvailableQty: hasSizes
      ? standardStock.availableQty
      : 0,
    officialSiteSyncedAt: product.officialSiteSyncedAt
  };
}

/*
|--------------------------------------------------------------------------
| POS CATALOGUE
|--------------------------------------------------------------------------
|
| GET /pos-catalogue/products
|
| Returns active products with size-specific stock availability.
|
| For products with sizes:
| - Each size has its own selling price.
| - Each size has its own available quantity.
| - Expired lots are excluded.
| - Unassigned historical stock is excluded from sellable size stock.
|
| Product-level availableQty is only a catalogue summary.
| Checkout must validate stock for the selected size.
|--------------------------------------------------------------------------
*/

router.get(
  "/products",
  requirePermission("erp.pos.access"),
  async (_req, res) => {
    try {
      const now = new Date();

      const products = await prisma.product.findMany({
        where: {
          isActive: true
        },
        orderBy: [
          { name: "asc" },
          { variantName: "asc" }
        ],
        select: productSelect
      });

      const catalogue = products.map((product) =>
        buildCatalogueProduct(product, now)
      );

      return res.json({
        products: catalogue,
        count: catalogue.length,
        generatedAt: now.toISOString()
      });
    } catch (error) {
      return res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to load POS catalogue"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| SINGLE POS PRODUCT
|--------------------------------------------------------------------------
|
| GET /pos-catalogue/products/:id
|
| Uses the same inventory and pricing logic as the catalogue.
|--------------------------------------------------------------------------
*/

router.get(
  "/products/:id",
  requirePermission("erp.pos.access"),
  async (req, res) => {
    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]
        : req.params.id;

      if (!id) {
        return res.status(400).json({
          message: "Product ID is required"
        });
      }

      const now = new Date();

      const product = await prisma.product.findFirst({
        where: {
          id,
          isActive: true
        },
        select: productSelect
      });

      if (!product) {
        return res.status(404).json({
          message: "POS product not found"
        });
      }

      return res.json({
        product: buildCatalogueProduct(product, now)
      });
    } catch (error) {
      return res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to load POS product"
      });
    }
  }
);

export default router;
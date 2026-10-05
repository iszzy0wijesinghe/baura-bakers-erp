import { Router } from "express";

import { prisma } from "../../lib/prisma";

import {
  authMiddleware,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

function decimalToNumber(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  return Number(value);
}

/*
|--------------------------------------------------------------------------
| POS CATALOGUE
|--------------------------------------------------------------------------
|
| Returns products that can be shown in the standalone POS.
|
| Important:
|
| - product price comes from ERP Product.sellPrice
| - product image comes from synchronized ERP product data
| - finished stock is calculated from FinishedGoodsLot
| - only active products are returned
| - browser does not determine authoritative stock
| - browser does not determine authoritative price
|--------------------------------------------------------------------------
*/

router.get(
  "/products",

  requirePermission(
    "erp.pos.access",
  ),

  async (_req, res) => {
    try {
      const products =
        await prisma.product.findMany({
          where: {
            isActive: true,
          },

          orderBy: [
            {
              name: "asc",
            },
            {
              variantName: "asc",
            },
          ],

          select: {
            id: true,

            officialSiteProductId:
              true,

            name: true,

            variantName: true,

            imageUrl: true,

            sellPrice: true,

            finishedStockAlertQty:
              true,

            officialSiteSyncedAt:
              true,

            finishedGoodsLots: {
              where: {
                remainingQty: {
                  gt: 0,
                },
              },

              select: {
                remainingQty:
                  true,
              },
            },
          },
        });

      const catalogue =
        products.map(
          (product) => {
            const availableQty =
              product.finishedGoodsLots.reduce(
                (
                  total,
                  lot,
                ) =>
                  total +
                  decimalToNumber(
                    lot.remainingQty,
                  ),
                0,
              );

            const lowStockThreshold =
              product.finishedStockAlertQty ===
              null
                ? null
                : decimalToNumber(
                    product.finishedStockAlertQty,
                  );

            const isLowStock =
              lowStockThreshold !==
                null &&
              availableQty <=
                lowStockThreshold;

            return {
              id:
                product.id,

              officialSiteProductId:
                product.officialSiteProductId,

              name:
                product.name,

              variantName:
                product.variantName,

              displayName:
                product.variantName
                  ? `${product.name} - ${product.variantName}`
                  : product.name,

              imageUrl:
                product.imageUrl,

              sellPrice:
                decimalToNumber(
                  product.sellPrice,
                ),

              availableQty,

              inStock:
                availableQty > 0,

              lowStockThreshold,

              isLowStock,

              officialSiteSyncedAt:
                product.officialSiteSyncedAt,
            };
          },
        );

      return res.json({
        products:
          catalogue,

        count:
          catalogue.length,

        generatedAt:
          new Date().toISOString(),
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to load POS catalogue",
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| SINGLE POS PRODUCT
|--------------------------------------------------------------------------
*/

router.get(
  "/products/:id",

  requirePermission(
    "erp.pos.access",
  ),

  async (req, res) => {
    try {
      const id =
        Array.isArray(
          req.params.id,
        )
          ? req.params.id[0]
          : req.params.id;

      if (!id) {
        return res
          .status(400)
          .json({
            message:
              "Product ID is required",
          });
      }

      const product =
        await prisma.product.findFirst({
          where: {
            id,
            isActive: true,
          },

          select: {
            id: true,

            officialSiteProductId:
              true,

            name: true,

            variantName: true,

            imageUrl: true,

            sellPrice: true,

            finishedStockAlertQty:
              true,

            officialSiteSyncedAt:
              true,

            finishedGoodsLots: {
              where: {
                remainingQty: {
                  gt: 0,
                },
              },

              orderBy: [
                {
                  producedAt:
                    "asc",
                },
                {
                  createdAt:
                    "asc",
                },
              ],

              select: {
                id: true,

                remainingQty:
                  true,

                unitCost:
                  true,

                producedAt:
                  true,

                expiryDate:
                  true,
              },
            },
          },
        });

      if (!product) {
        return res
          .status(404)
          .json({
            message:
              "POS product not found",
          });
      }

      const availableQty =
        product.finishedGoodsLots.reduce(
          (
            total,
            lot,
          ) =>
            total +
            decimalToNumber(
              lot.remainingQty,
            ),
          0,
        );

      const lowStockThreshold =
        product.finishedStockAlertQty ===
        null
          ? null
          : decimalToNumber(
              product.finishedStockAlertQty,
            );

      return res.json({
        product: {
          id:
            product.id,

          officialSiteProductId:
            product.officialSiteProductId,

          name:
            product.name,

          variantName:
            product.variantName,

          displayName:
            product.variantName
              ? `${product.name} - ${product.variantName}`
              : product.name,

          imageUrl:
            product.imageUrl,

          sellPrice:
            decimalToNumber(
              product.sellPrice,
            ),

          availableQty,

          inStock:
            availableQty > 0,

          lowStockThreshold,

          isLowStock:
            lowStockThreshold !==
              null &&
            availableQty <=
              lowStockThreshold,

          officialSiteSyncedAt:
            product.officialSiteSyncedAt,
        },
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to load POS product",
        });
    }
  },
);

export default router;
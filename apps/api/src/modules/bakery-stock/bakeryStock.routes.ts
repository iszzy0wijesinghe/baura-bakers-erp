import {
  Router
} from "express";

import {
  prisma
} from "../../lib/prisma";

import {
  getRouteParam
} from "../../lib/http";

import {
  authMiddleware
} from "../../middleware/auth.middleware";

const router =
  Router();

router.use(
  authMiddleware
);

function round2(
  value: number
) {
  return Number(
    value.toFixed(2)
  );
}

function round3(
  value: number
) {
  return Number(
    value.toFixed(3)
  );
}

function round6(
  value: number
) {
  return Number(
    value.toFixed(6)
  );
}

function getProductDisplayName(
  product: {
    name: string;

    variantName:
      | string
      | null;
  }
) {
  return product.variantName
    ? `${product.name} - ${product.variantName}`
    : product.name;
}

function isExpired(
  expiryDate:
    | Date
    | null,
  now = new Date()
) {
  return Boolean(
    expiryDate &&
      expiryDate.getTime() <
        now.getTime()
  );
}

router.get(
  "/",
  async (_req, res) => {
    try {
      const now =
        new Date();

      const products =
        await prisma.product.findMany({
          where: {
            isActive: true
          },

          orderBy: [
            {
              name: "asc"
            },
            {
              variantName:
                "asc"
            }
          ],

          include: {
            finishedGoodsLots: {
              where: {
                remainingQty: {
                  gt: 0
                }
              },

              orderBy: {
                producedAt:
                  "asc"
              }
            }
          }
        });

      const items =
        products.map(
          (product) => {
            let availableQty =
              0;

            let expiredQty =
              0;

            let totalOnHand =
              0;

            let sellableValue =
              0;

            for (
              const lot of
              product.finishedGoodsLots
            ) {
              const quantity =
                Number(
                  lot.remainingQty
                );

              const unitCost =
                Number(
                  lot.unitCost
                );

              const value =
                quantity *
                unitCost;

              totalOnHand +=
                quantity;

              if (
                isExpired(
                  lot.expiryDate,
                  now
                )
              ) {
                expiredQty +=
                  quantity;
              } else {
                availableQty +=
                  quantity;

                sellableValue +=
                  value;
              }
            }

            availableQty =
              round3(
                availableQty
              );

            expiredQty =
              round3(
                expiredQty
              );

            totalOnHand =
              round3(
                totalOnHand
              );

            sellableValue =
              round2(
                sellableValue
              );

            const threshold =
              product.finishedStockAlertQty !==
              null
                ? Number(
                    product.finishedStockAlertQty
                  )
                : null;

            let status:
              | "IN_STOCK"
              | "LOW_STOCK"
              | "OUT_OF_STOCK"
              | "EXPIRED_ONLY";

            if (
              availableQty <=
              0
            ) {
              status =
                expiredQty > 0
                  ? "EXPIRED_ONLY"
                  : "OUT_OF_STOCK";
            } else if (
              threshold !==
                null &&
              availableQty <=
                threshold
            ) {
              status =
                "LOW_STOCK";
            } else {
              status =
                "IN_STOCK";
            }

            return {
              productId:
                product.id,

              name:
                product.name,

              variantName:
                product.variantName,

              displayName:
                getProductDisplayName(
                  product
                ),

              sellPrice:
                product.sellPrice,

              availableQty,

              expiredQty,

              totalOnHand,

              weightedAverageCost:
                availableQty >
                0
                  ? round6(
                      sellableValue /
                        availableQty
                    )
                  : 0,

              sellableValue,

              stockValue:
                sellableValue,

              lotCount:
                product.finishedGoodsLots
                  .length,

              finishedStockAlertQty:
                product.finishedStockAlertQty,

              status
            };
          }
        );

      return res.json({
        summary: {
          activeProducts:
            items.length,

          productsInStock:
            items.filter(
              (item) =>
                item.availableQty >
                0
            ).length,

          lowStockProducts:
            items.filter(
              (item) =>
                item.status ===
                "LOW_STOCK"
            ).length,

          outOfStockProducts:
            items.filter(
              (item) =>
                item.status ===
                  "OUT_OF_STOCK" ||
                item.status ===
                  "EXPIRED_ONLY"
            ).length,

          totalAvailableUnits:
            round3(
              items.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.availableQty,
                0
              )
            ),

          totalStockValue:
            round2(
              items.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.stockValue,
                0
              )
            )
        },

        items
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to load Bakery Stock"
        });
    }
  }
);

router.get(
  "/:productId",
  async (req, res) => {
    try {
      const productId =
        getRouteParam(
          req.params
            .productId,
          "Product id"
        );

      const now =
        new Date();

      const product =
        await prisma.product.findUnique({
          where: {
            id:
              productId
          },

          include: {
            finishedGoodsLots: {
              where: {
                remainingQty: {
                  gt: 0
                }
              },

              include: {
                productionBatch: {
                  select: {
                    batchNo:
                      true,

                    productionDate:
                      true,

                    rejectedQty:
                      true
                  }
                }
              }
            },

            finishedGoodsMovements: {
              orderBy: {
                occurredAt:
                  "desc"
              },

              take: 100
            }
          }
        });

      if (!product) {
        return res
          .status(404)
          .json({
            message:
              "Product not found"
          });
      }

      const lots =
        [
          ...product.finishedGoodsLots
        ]
          .sort(
            (
              first,
              second
            ) => {
              if (
                first.expiryDate &&
                second.expiryDate
              ) {
                const difference =
                  first.expiryDate.getTime() -
                  second.expiryDate.getTime();

                if (
                  difference !==
                  0
                ) {
                  return difference;
                }
              } else if (
                first.expiryDate
              ) {
                return -1;
              } else if (
                second.expiryDate
              ) {
                return 1;
              }

              return (
                first.producedAt.getTime() -
                second.producedAt.getTime()
              );
            }
          )
          .map(
            (lot) => ({
              id:
                lot.id,

              productionBatchId:
                lot.productionBatchId,

              batchNo:
                lot.productionBatch
                  .batchNo,

              producedQty:
                lot.producedQty,

              remainingQty:
                lot.remainingQty,

              unitCost:
                lot.unitCost,

              producedAt:
                lot.producedAt,

              expiryDate:
                lot.expiryDate,

              rejectedQty:
                lot.productionBatch
                  .rejectedQty,

              isExpired:
                isExpired(
                  lot.expiryDate,
                  now
                ),

              stockValue:
                round2(
                  Number(
                    lot.remainingQty
                  ) *
                    Number(
                      lot.unitCost
                    )
                )
            })
          );

      return res.json({
        product: {
          id:
            product.id,

          displayName:
            getProductDisplayName(
              product
            ),

          sellPrice:
            product.sellPrice,

          finishedStockAlertQty:
            product.finishedStockAlertQty
        },

        lots,

        movements:
          product.finishedGoodsMovements.map(
            (movement) => ({
              id:
                movement.id,

              stockLotId:
                movement.stockLotId,

              movementType:
                movement.movementType,

              refType:
                movement.refType,

              refId:
                movement.refId,

              qtyDelta:
                movement.qtyDelta,

              unitCost:
                movement.unitCost,

              costAmount:
                movement.costAmount,

              note:
                movement.note,

              occurredAt:
                movement.occurredAt
            })
          )
      });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to load Bakery Stock details"
        });
    }
  }
);

export default router;
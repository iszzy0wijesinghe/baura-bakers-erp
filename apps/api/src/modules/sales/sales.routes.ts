import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";

import {
  nextDocumentNumber
} from "../../lib/documentSequence";

import {
  runSerializableTransaction
} from "../../lib/transaction";

import {
  authMiddleware,
  requireRoles
} from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

const paymentMethods = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "ONLINE",
  "OTHER"
] as const;

const createSaleSchema =
  z.object({
    salesChannelId: z
      .string()
      .uuid()
      .optional()
      .nullable(),

    paymentMethod: z
      .enum(paymentMethods)
      .default("CASH"),

    discountTotal: z.coerce
      .number()
      .min(0)
      .default(0),

    items: z
      .array(
        z.object({
          productId: z
            .string()
            .uuid(
              "Valid product is required"
            ),

          qty: z.coerce
            .number()
            .positive(
              "Quantity must be greater than 0"
            )
        })
      )
      .min(
        1,
        "At least one sale item is required"
      )
  });

function round2(value: number) {
  return Number(
    value.toFixed(2)
  );
}

function round3(value: number) {
  return Number(
    value.toFixed(3)
  );
}

function getProductDisplayName(
  product: {
    name: string;
    variantName: string | null;
  }
) {
  return product.variantName
    ? `${product.name} - ${product.variantName}`
    : product.name;
}

function isExpired(
  expiryDate: Date | null,
  at = new Date()
) {
  return Boolean(
    expiryDate &&
      expiryDate.getTime() <
        at.getTime()
  );
}

function sortFinishedLots<
  T extends {
    expiryDate: Date | null;
    producedAt: Date;
  }
>(lots: T[]) {
  return [...lots].sort(
    (a, b) => {
      if (
        a.expiryDate &&
        b.expiryDate
      ) {
        const expiryDiff =
          a.expiryDate.getTime() -
          b.expiryDate.getTime();

        if (
          expiryDiff !== 0
        ) {
          return expiryDiff;
        }
      } else if (
        a.expiryDate
      ) {
        return -1;
      } else if (
        b.expiryDate
      ) {
        return 1;
      }

      return (
        a.producedAt.getTime() -
        b.producedAt.getTime()
      );
    }
  );
}

router.get(
  "/channels",
  async (_req, res) => {
    const channels =
      await prisma.salesChannel.findMany(
        {
          where: {
            isActive: true
          },

          orderBy: {
            name: "asc"
          }
        }
      );

    return res.json({
      channels
    });
  }
);

router.get(
  "/products",
  async (_req, res) => {
    const now =
      new Date();

    const products =
      await prisma.product.findMany(
        {
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
            finishedGoodsLots:
              {
                where: {
                  remainingQty:
                    {
                      gt: 0
                    }
                }
              }
          }
        }
      );

    return res.json({
      products:
        products.map(
          (product) => {
            const availableQty =
              round3(
                product.finishedGoodsLots
                  .filter(
                    (lot) =>
                      !isExpired(
                        lot.expiryDate,
                        now
                      )
                  )
                  .reduce(
                    (sum, lot) =>
                      sum +
                      Number(
                        lot.remainingQty
                      ),
                    0
                  )
              );

            const threshold =
              product.finishedStockAlertQty
                ? Number(
                    product.finishedStockAlertQty
                  )
                : null;

            return {
              id: product.id,

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

              isInStock:
                availableQty >
                0,

              isLowStock:
                threshold !==
                  null &&
                availableQty >
                  0 &&
                availableQty <=
                  threshold,

              finishedStockAlertQty:
                product.finishedStockAlertQty
            };
          }
        )
    });
  }
);

router.get(
  "/",
  async (_req, res) => {
    const sales =
      await prisma.salesOrder.findMany(
        {
          orderBy: {
            soldAt:
              "desc"
          },

          take: 100,

          include: {
            salesChannel:
              true,

            items: {
              include: {
                product:
                  true
              }
            }
          }
        }
      );

    return res.json({
      sales:
        sales.map(
          (sale) => ({
            id: sale.id,

            orderNo:
              sale.orderNo,

            salesChannel:
              sale.salesChannel
                ?.name ||
              "Direct",

            paymentMethod:
              sale.paymentMethod,

            grossTotal:
              sale.grossTotal,

            discountTotal:
              sale.discountTotal,

            netTotal:
              sale.netTotal,

            cogsTotal:
              sale.cogsTotal,

            profitTotal:
              sale.profitTotal,

            status:
              sale.status,

            soldAt:
              sale.soldAt,

            itemCount:
              sale.items
                .length,

            items:
              sale.items.map(
                (item) => ({
                  id:
                    item.id,

                  productId:
                    item.productId,

                  productDisplayName:
                    getProductDisplayName(
                      item.product
                    ),

                  qty:
                    item.qty,

                  unitSellPrice:
                    item.unitSellPrice,

                  lineTotal:
                    item.lineTotal,

                  discountTotal:
                    item.discountTotal,

                  netTotal:
                    item.netTotal,

                  cogsTotal:
                    item.cogsTotal,

                  profitTotal:
                    item.profitTotal
                })
              )
          })
        )
    });
  }
);

router.get(
  "/:id",
  async (req, res) => {
    const sale =
      await prisma.salesOrder.findUnique(
        {
          where: {
            id:
              req.params.id
          },

          include: {
            salesChannel:
              true,

            items: {
              include: {
                product:
                  true,

                finishedGoodsConsumptions:
                  {
                    include:
                      {
                        finishedGoodsLot:
                          {
                            include:
                              {
                                productionBatch:
                                  {
                                    select:
                                      {
                                        batchNo:
                                          true
                                      }
                                  }
                              }
                          }
                      },

                    orderBy:
                      {
                        createdAt:
                          "asc"
                      }
                  }
              },

              orderBy: {
                createdAt:
                  "asc"
              }
            }
          }
        }
      );

    if (!sale) {
      return res
        .status(404)
        .json({
          message:
            "Sale not found"
        });
    }

    return res.json({
      sale: {
        id: sale.id,

        orderNo:
          sale.orderNo,

        salesChannel:
          sale.salesChannel
            ?.name ||
          "Direct",

        paymentMethod:
          sale.paymentMethod,

        grossTotal:
          sale.grossTotal,

        discountTotal:
          sale.discountTotal,

        netTotal:
          sale.netTotal,

        cogsTotal:
          sale.cogsTotal,

        profitTotal:
          sale.profitTotal,

        status:
          sale.status,

        soldAt:
          sale.soldAt,

        items:
          sale.items.map(
            (item) => ({
              id:
                item.id,

              productId:
                item.productId,

              productDisplayName:
                getProductDisplayName(
                  item.product
                ),

              qty:
                item.qty,

              unitSellPrice:
                item.unitSellPrice,

              lineTotal:
                item.lineTotal,

              discountTotal:
                item.discountTotal,

              netTotal:
                item.netTotal,

              cogsTotal:
                item.cogsTotal,

              profitTotal:
                item.profitTotal,

              finishedGoodsConsumptions:
                item.finishedGoodsConsumptions.map(
                  (
                    consumption
                  ) => ({
                    id:
                      consumption.id,

                    finishedGoodsLotId:
                      consumption.finishedGoodsLotId,

                    batchNo:
                      consumption
                        .finishedGoodsLot
                        .productionBatch
                        .batchNo,

                    consumedQty:
                      consumption.consumedQty,

                    unitCost:
                      consumption.unitCost,

                    costAmount:
                      consumption.costAmount
                  })
                )
            })
          )
      }
    });
  }
);

router.post(
  "/",

  requireRoles(
    "ADMIN",
    "MANAGER",
    "SALES_STAFF"
  ),

  async (req, res) => {
    const parsed =
      createSaleSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      return res
        .status(400)
        .json({
          message:
            "Invalid sale data",

          errors:
            parsed.error.flatten()
        });
    }

    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required"
        });
    }

    try {
      const soldAt =
        new Date();

      const aggregatedItems =
        new Map<
          string,
          number
        >();

      for (
        const item of
        parsed.data.items
      ) {
        aggregatedItems.set(
          item.productId,

          round3(
            (
              aggregatedItems.get(
                item.productId
              ) || 0
            ) +
              item.qty
          )
        );
      }

      const normalizedItems =
        [
          ...aggregatedItems.entries()
        ].map(
          ([
            productId,
            qty
          ]) => ({
            productId,
            qty
          })
        );

      const createdSale =
        await runSerializableTransaction(
          async (tx) => {
            if (
              parsed.data
                .salesChannelId
            ) {
              const channel =
                await tx.salesChannel.findFirst(
                  {
                    where: {
                      id:
                        parsed.data
                          .salesChannelId,

                      isActive:
                        true
                    }
                  }
                );

              if (!channel) {
                throw new Error(
                  "Active sales channel not found"
                );
              }
            }

            const productIds =
              normalizedItems.map(
                (item) =>
                  item.productId
              );

            const products =
              await tx.product.findMany(
                {
                  where: {
                    id: {
                      in:
                        productIds
                    },

                    isActive:
                      true
                  },

                  include: {
                    finishedGoodsLots:
                      {
                        where:
                          {
                            remainingQty:
                              {
                                gt: 0
                              }
                          }
                      }
                  }
                }
              );

            const productMap =
              new Map(
                products.map(
                  (product) => [
                    product.id,
                    product
                  ]
                )
              );

            const missingProduct =
              productIds.find(
                (
                  productId
                ) =>
                  !productMap.has(
                    productId
                  )
              );

            if (
              missingProduct
            ) {
              throw new Error(
                "One or more active products were not found"
              );
            }

            const lotRemainingMap =
              new Map<
                string,
                number
              >();

            for (
              const product of
              products
            ) {
              for (
                const lot of
                product.finishedGoodsLots
              ) {
                lotRemainingMap.set(
                  lot.id,

                  Number(
                    lot.remainingQty
                  )
                );
              }
            }

            type PlannedAllocation =
              {
                finishedGoodsLotId:
                  string;

                consumedQty:
                  number;

                unitCost:
                  number;

                costAmount:
                  number;
              };

            type PlannedItem = {
              productId: string;
              qty: number;

              unitSellPrice:
                number;

              lineTotal:
                number;

              discountTotal:
                number;

              netTotal:
                number;

              cogsTotal:
                number;

              profitTotal:
                number;

              allocations:
                PlannedAllocation[];
            };

            const plannedItems:
              PlannedItem[] = [];

            for (
              const requestedItem of
              normalizedItems
            ) {
              const product =
                productMap.get(
                  requestedItem.productId
                );

              if (!product) {
                throw new Error(
                  "Product not found"
                );
              }

              const eligibleLots =
                sortFinishedLots(
                  product.finishedGoodsLots.filter(
                    (lot) =>
                      !isExpired(
                        lot.expiryDate,
                        soldAt
                      )
                  )
                );

              let remainingNeed =
                requestedItem.qty;

              const allocations:
                PlannedAllocation[] =
                [];

              for (
                const lot of
                eligibleLots
              ) {
                if (
                  remainingNeed <=
                  0
                ) {
                  break;
                }

                const available =
                  lotRemainingMap.get(
                    lot.id
                  ) || 0;

                if (
                  available <= 0
                ) {
                  continue;
                }

                const take =
                  round3(
                    Math.min(
                      remainingNeed,
                      available
                    )
                  );

                const unitCost =
                  Number(
                    lot.unitCost
                  );

                const costAmount =
                  round2(
                    take *
                      unitCost
                  );

                allocations.push(
                  {
                    finishedGoodsLotId:
                      lot.id,

                    consumedQty:
                      take,

                    unitCost,

                    costAmount
                  }
                );

                lotRemainingMap.set(
                  lot.id,

                  round3(
                    available -
                      take
                  )
                );

                remainingNeed =
                  round3(
                    remainingNeed -
                      take
                  );
              }

              if (
                remainingNeed >
                0
              ) {
                const availableQty =
                  round3(
                    requestedItem.qty -
                      remainingNeed
                  );

                throw new Error(
                  `${getProductDisplayName(
                    product
                  )} has only ${availableQty} sellable item(s) in Bakery Stock.`
                );
              }

              const unitSellPrice =
                Number(
                  product.sellPrice
                );

              const lineTotal =
                round2(
                  requestedItem.qty *
                    unitSellPrice
                );

              const cogsTotal =
                round2(
                  allocations.reduce(
                    (
                      sum,
                      allocation
                    ) =>
                      sum +
                      allocation.costAmount,

                    0
                  )
                );

              plannedItems.push(
                {
                  productId:
                    product.id,

                  qty:
                    requestedItem.qty,

                  unitSellPrice,

                  lineTotal,

                  discountTotal:
                    0,

                  netTotal:
                    lineTotal,

                  cogsTotal,

                  profitTotal:
                    round2(
                      lineTotal -
                        cogsTotal
                    ),

                  allocations
                }
              );
            }

            const grossTotal =
              round2(
                plannedItems.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    item.lineTotal,

                  0
                )
              );

            const discountTotal =
              round2(
                Math.min(
                  parsed.data
                    .discountTotal ||
                    0,

                  grossTotal
                )
              );

            let allocatedDiscount =
              0;

            plannedItems.forEach(
              (
                item,
                index
              ) => {
                const remainingDiscount =
                  round2(
                    Math.max(
                      discountTotal -
                        allocatedDiscount,

                      0
                    )
                  );

                const proportionalDiscount =
                  grossTotal > 0
                    ? round2(
                        (
                          discountTotal *
                          item.lineTotal
                        ) /
                          grossTotal
                      )
                    : 0;

                const itemDiscount =
                  index ===
                  plannedItems.length -
                    1
                    ? remainingDiscount
                    : Math.min(
                        proportionalDiscount,
                        remainingDiscount
                      );

                item.discountTotal =
                  Math.max(
                    0,

                    Math.min(
                      itemDiscount,

                      item.lineTotal
                    )
                  );

                item.netTotal =
                  round2(
                    item.lineTotal -
                      item.discountTotal
                  );

                item.profitTotal =
                  round2(
                    item.netTotal -
                      item.cogsTotal
                  );

                allocatedDiscount =
                  round2(
                    allocatedDiscount +
                      item.discountTotal
                  );
              }
            );

            const netTotal =
              round2(
                grossTotal -
                  discountTotal
              );

            const cogsTotal =
              round2(
                plannedItems.reduce(
                  (
                    sum,
                    item
                  ) =>
                    sum +
                    item.cogsTotal,

                  0
                )
              );

            const profitTotal =
              round2(
                netTotal -
                  cogsTotal
              );

            const orderNo =
              await nextDocumentNumber(
                tx,
                "SALE",
                "SAL",
                soldAt
              );

            const sale =
              await tx.salesOrder.create(
                {
                  data: {
                    orderNo,

                    salesChannelId:
                      parsed.data
                        .salesChannelId ||
                      null,

                    paymentMethod:
                      parsed.data
                        .paymentMethod,

                    saleType:
                      "POS",

                    grossTotal,

                    discountTotal,

                    netTotal,

                    cogsTotal,

                    profitTotal,

                    status:
                      "COMPLETED",

                    createdById:
                      req.user!.id,

                    soldAt
                  }
                }
              );

            for (
              const plannedItem of
              plannedItems
            ) {
              const saleItem =
                await tx.saleItem.create(
                  {
                    data: {
                      salesOrderId:
                        sale.id,

                      productId:
                        plannedItem.productId,

                      qty:
                        plannedItem.qty,

                      unitSellPrice:
                        plannedItem.unitSellPrice,

                      lineTotal:
                        plannedItem.lineTotal,

                      discountTotal:
                        plannedItem.discountTotal,

                      netTotal:
                        plannedItem.netTotal,

                      cogsTotal:
                        plannedItem.cogsTotal,

                      profitTotal:
                        plannedItem.profitTotal
                    }
                  }
                );

              for (
                const allocation of
                plannedItem.allocations
              ) {
                const updated =
                  await tx.finishedGoodsLot.updateMany(
                    {
                      where: {
                        id:
                          allocation.finishedGoodsLotId,

                        remainingQty:
                          {
                            gte:
                              allocation.consumedQty
                          }
                      },

                      data: {
                        remainingQty:
                          {
                            decrement:
                              allocation.consumedQty
                          }
                      }
                    }
                  );

                if (
                  updated.count !==
                  1
                ) {
                  throw new Error(
                    "Bakery Stock changed while completing the sale. Please retry."
                  );
                }

                await tx.saleFinishedGoodsConsumption.create(
                  {
                    data: {
                      saleItemId:
                        saleItem.id,

                      finishedGoodsLotId:
                        allocation.finishedGoodsLotId,

                      productId:
                        plannedItem.productId,

                      consumedQty:
                        allocation.consumedQty,

                      unitCost:
                        allocation.unitCost,

                      costAmount:
                        allocation.costAmount
                    }
                  }
                );

                await tx.finishedGoodsMovement.create(
                  {
                    data: {
                      productId:
                        plannedItem.productId,

                      stockLotId:
                        allocation.finishedGoodsLotId,

                      movementType:
                        "SALE",

                      refType:
                        "SALE_ITEM",

                      refId:
                        saleItem.id,

                      qtyDelta:
                        -allocation.consumedQty,

                      unitCost:
                        allocation.unitCost,

                      costAmount:
                        allocation.costAmount,

                      note:
                        `Sold through ${orderNo}`,

                      occurredAt:
                        soldAt
                    }
                  }
                );
              }
            }

            await tx.auditLog.create(
              {
                data: {
                  userId:
                    req.user!.id,

                  action:
                    "CREATE",

                  entityType:
                    "SalesOrder",

                  entityId:
                    sale.id,

                  afterJson: {
                    orderNo,

                    grossTotal,

                    discountTotal,

                    netTotal,

                    cogsTotal,

                    profitTotal,

                    paymentMethod:
                      parsed.data
                        .paymentMethod
                  }
                }
              }
            );

            return sale;
          }
        );

      const saleWithDetails =
        await prisma.salesOrder.findUnique(
          {
            where: {
              id:
                createdSale.id
            },

            include: {
              salesChannel:
                true,

              items: {
                include: {
                  product:
                    true
                }
              }
            }
          }
        );

      return res
        .status(201)
        .json({
          message:
            "Sale completed successfully",

          sale:
            saleWithDetails
        });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to complete sale"
        });
    }
  }
);

export default router;
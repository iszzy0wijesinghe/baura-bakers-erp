import {
  Router,
} from "express";

import {
  z,
} from "zod";

import {
  prisma,
} from "../../lib/prisma";

import {
  nextDocumentNumber,
} from "../../lib/documentSequence";

import {
  runSerializableTransaction,
} from "../../lib/transaction";

import {
  authMiddleware,
  hasAnyRole,
  requireRoles,
} from "../../middleware/auth.middleware";

const router =
  Router();

router.use(
  authMiddleware,
);

const paymentMethods = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "ONLINE",
  "OTHER",
] as const;

const createSaleSchema =
  z.object({
    salesChannelId: z
      .string()
      .uuid()
      .optional()
      .nullable(),

    paymentMethod: z
      .enum(
        paymentMethods,
      )
      .default(
        "CASH",
      ),

    discountTotal: z.coerce
      .number()
      .finite()
      .min(0)
      .default(0),

    approvalId: z
      .string()
      .uuid()
      .optional()
      .nullable(),

    items: z
      .array(
        z.object({
          productId: z
            .string()
            .uuid(
              "Valid product is required",
            ),

          qty: z.coerce
            .number()
            .finite()
            .positive(
              "Quantity must be greater than 0",
            ),
        }),
      )
      .min(
        1,
        "At least one sale item is required",
      ),
  });

function round2(
  value: number,
) {
  return Number(
    value.toFixed(2),
  );
}

function round3(
  value: number,
) {
  return Number(
    value.toFixed(3),
  );
}

function getProductDisplayName(
  product: {
    name: string;
    variantName:
      | string
      | null;
  },
) {
  return product.variantName
    ? `${product.name} - ${product.variantName}`
    : product.name;
}

function isExpired(
  expiryDate:
    | Date
    | null,
  at = new Date(),
) {
  return Boolean(
    expiryDate &&
      expiryDate.getTime() <
        at.getTime(),
  );
}

function sortFinishedLots<
  T extends {
    expiryDate:
      | Date
      | null;
    producedAt: Date;
  },
>(
  lots: T[],
) {
  return [
    ...lots,
  ].sort(
    (
      a,
      b,
    ) => {
      if (
        a.expiryDate &&
        b.expiryDate
      ) {
        const expiryDiff =
          a.expiryDate.getTime() -
          b.expiryDate.getTime();

        if (
          expiryDiff !==
          0
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
    },
  );
}

/*
 * POS SALES CHANNELS
 */
router.get(
  "/channels",

  requireRoles(
    "ADMIN",
    "MANAGER",
    "CASHIER",
    "SALES_STAFF",
  ),

  async (
    _req,
    res,
  ) => {
    const channels =
      await prisma.salesChannel.findMany(
        {
          where: {
            isActive:
              true,
          },

          orderBy: {
            name:
              "asc",
          },
        },
      );

    return res.json({
      channels,
    });
  },
);

/*
 * POS PRODUCT CATALOGUE
 *
 * COGS and profit are intentionally
 * not exposed to the POS catalogue.
 */
router.get(
  "/products",

  requireRoles(
    "ADMIN",
    "MANAGER",
    "CASHIER",
    "SALES_STAFF",
  ),

  async (
    _req,
    res,
  ) => {
    const now =
      new Date();

    const products =
      await prisma.product.findMany(
        {
          where: {
            isActive:
              true,
          },

          orderBy: [
            {
              name:
                "asc",
            },
            {
              variantName:
                "asc",
            },
          ],

          include: {
            finishedGoodsLots:
              {
                where: {
                  remainingQty:
                    {
                      gt: 0,
                    },
                },
              },
          },
        },
      );

    return res.json({
      products:
        products.map(
          (
            product,
          ) => {
            const availableQty =
              round3(
                product.finishedGoodsLots
                  .filter(
                    (
                      lot,
                    ) =>
                      !isExpired(
                        lot.expiryDate,
                        now,
                      ),
                  )
                  .reduce(
                    (
                      sum,
                      lot,
                    ) =>
                      sum +
                      Number(
                        lot.remainingQty,
                      ),
                    0,
                  ),
              );

            const threshold =
              product.finishedStockAlertQty !==
              null
                ? Number(
                    product.finishedStockAlertQty,
                  )
                : null;

            return {
              id:
                product.id,

              name:
                product.name,

              variantName:
                product.variantName,

              displayName:
                getProductDisplayName(
                  product,
                ),

              imageUrl:
                product.imageUrl,

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
                product.finishedStockAlertQty,
            };
          },
        ),
    });
  },
);

/*
 * MANAGEMENT SALES HISTORY
 *
 * This endpoint contains financial
 * information and is therefore not
 * available to ordinary POS users.
 */
router.get(
  "/",

  requireRoles(
    "ADMIN",
    "MANAGER",
    "ACCOUNT_STAFF",
  ),

  async (
    _req,
    res,
  ) => {
    const sales =
      await prisma.salesOrder.findMany(
        {
          orderBy: {
            soldAt:
              "desc",
          },

          take:
            100,

          include: {
            salesChannel:
              true,

            items: {
              include: {
                product:
                  true,
              },
            },
          },
        },
      );

    return res.json({
      sales:
        sales.map(
          (
            sale,
          ) => ({
            id:
              sale.id,

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
              sale.items.length,

            items:
              sale.items.map(
                (
                  item,
                ) => ({
                  id:
                    item.id,

                  productId:
                    item.productId,

                  productDisplayName:
                    getProductDisplayName(
                      item.product,
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
                }),
              ),
          }),
        ),
    });
  },
);

/*
 * MANAGEMENT SALE DETAIL
 */
router.get(
  "/:id",

  requireRoles(
    "ADMIN",
    "MANAGER",
    "ACCOUNT_STAFF",
  ),

  async (
    req,
    res,
  ) => {
    const saleId =
      Array.isArray(
        req.params.id,
      )
        ? req.params.id[0]
        : req.params.id;

    if (!saleId) {
      return res
        .status(400)
        .json({
          message:
            "Sale ID is required",
        });
    }

    const sale =
      await prisma.salesOrder.findUnique(
        {
          where: {
            id:
              saleId,
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
                                          true,
                                      },
                                  },
                              },
                          },
                      },

                    orderBy:
                      {
                        createdAt:
                          "asc",
                      },
                  },
              },

              orderBy: {
                createdAt:
                  "asc",
              },
            },
          },
        },
      );

    if (!sale) {
      return res
        .status(404)
        .json({
          message:
            "Sale not found",
        });
    }

    return res.json({
      sale: {
        id:
          sale.id,

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
            (
              item,
            ) => ({
              id:
                item.id,

              productId:
                item.productId,

              productDisplayName:
                getProductDisplayName(
                  item.product,
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
                    consumption,
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
                      consumption.costAmount,
                  }),
                ),
            }),
          ),
      },
    });
  },
);

/*
 * COMPLETE POS SALE
 *
 * ADMIN / MANAGER:
 * May directly apply manual
 * discounts.
 *
 * CASHIER / SALES_STAFF:
 * A manual discount requires a
 * manager-approved authorization.
 *
 * Approval validation, inventory
 * consumption, approval consumption
 * and sale creation all occur inside
 * the same serializable transaction.
 */
router.post(
  "/",

  requireRoles(
    "ADMIN",
    "MANAGER",
    "CASHIER",
    "SALES_STAFF",
  ),

  async (
    req,
    res,
  ) => {
    const parsed =
      createSaleSchema.safeParse(
        req.body,
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
            parsed.error.flatten(),
        });
    }

    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required",
        });
    }

    const requestedDiscount =
      round2(
        parsed.data
          .discountTotal ||
          0,
      );

    const approvalId =
      parsed.data
        .approvalId ??
      null;

    const canApplyManualDiscount =
      hasAnyRole(
        req,
        "ADMIN",
        "MANAGER",
      );

    /*
     * Cashier / sales staff must
     * provide a manager approval ID.
     */
    if (
      requestedDiscount >
        0 &&
      !canApplyManualDiscount &&
      !approvalId
    ) {
      return res
        .status(403)
        .json({
          message:
            "Manager approval is required for manual discounts.",

          code:
            "MANAGER_APPROVAL_REQUIRED",

          approvalType:
            "MANUAL_DISCOUNT",
        });
    }

    /*
     * An approval must not be attached
     * to a sale that has no manual
     * discount.
     */
    if (
      requestedDiscount <=
        0 &&
      approvalId
    ) {
      return res
        .status(400)
        .json({
          message:
            "Approval ID cannot be used without a manual discount.",

          code:
            "INVALID_APPROVAL_USAGE",
        });
    }

    try {
      const soldAt =
        new Date();

      /*
       * Merge duplicate products.
       */
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
                item.productId,
              ) ||
              0
            ) +
              item.qty,
          ),
        );
      }

      const normalizedItems =
        [
          ...aggregatedItems.entries(),
        ].map(
          ([
            productId,
            qty,
          ]) => ({
            productId,
            qty,
          }),
        );

      const createdSale =
        await runSerializableTransaction(
          async (
            tx,
          ) => {
            let validatedApprovalId:
              | string
              | null =
                null;

            /*
             * Validate cashier manual
             * discount approval.
             */
            if (
              requestedDiscount >
                0 &&
              !canApplyManualDiscount
            ) {
              if (
                !approvalId
              ) {
                throw new Error(
                  "Manager approval is required for manual discounts.",
                );
              }

              const approval =
                await tx.posApproval.findUnique(
                  {
                    where: {
                      id:
                        approvalId,
                    },

                    select: {
                      id:
                        true,

                      type:
                        true,

                      status:
                        true,

                      requestedById:
                        true,

                      approvedById:
                        true,

                      saleId:
                        true,

                      amount:
                        true,

                      expiresAt:
                        true,

                      approvedAt:
                        true,

                      usedAt:
                        true,
                    },
                  },
                );

              if (!approval) {
                throw new Error(
                  "Manager approval request was not found.",
                );
              }

              if (
                approval.type !==
                "MANUAL_DISCOUNT"
              ) {
                throw new Error(
                  "This approval cannot be used for a manual discount.",
                );
              }

              if (
                approval.requestedById !==
                req.user!.id
              ) {
                throw new Error(
                  "This manager approval belongs to another POS user.",
                );
              }

              if (
                approval.status ===
                "PENDING"
              ) {
                throw new Error(
                  "Manager approval is still pending.",
                );
              }

              if (
                approval.status ===
                "REJECTED"
              ) {
                throw new Error(
                  "Manager approval was rejected.",
                );
              }

              if (
                approval.status ===
                "EXPIRED"
              ) {
                throw new Error(
                  "Manager approval has expired.",
                );
              }

              if (
                approval.status ===
                "USED"
              ) {
                throw new Error(
                  "Manager approval has already been used.",
                );
              }

              if (
                approval.status !==
                "APPROVED"
              ) {
                throw new Error(
                  "Manager approval is not valid.",
                );
              }

              if (
                !approval.approvedById ||
                !approval.approvedAt
              ) {
                throw new Error(
                  "Manager approval is incomplete.",
                );
              }

              if (
                approval.usedAt
              ) {
                throw new Error(
                  "Manager approval has already been used.",
                );
              }

              if (
                approval.saleId
              ) {
                throw new Error(
                  "Manager approval is already linked to a sale.",
                );
              }

              if (
                approval.expiresAt.getTime() <=
                soldAt.getTime()
              ) {
                throw new Error(
                  "Manager approval has expired.",
                );
              }

              const approvedAmount =
                approval.amount ===
                null
                  ? null
                  : round2(
                      Number(
                        approval.amount,
                      ),
                    );

              if (
                approvedAmount ===
                null ||
                approvedAmount !==
                  requestedDiscount
              ) {
                throw new Error(
                  "The approved discount amount does not match the requested discount.",
                );
              }

              validatedApprovalId =
                approval.id;
            }

            /*
             * Validate sales channel.
             */
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
                        true,
                    },

                    select: {
                      id:
                        true,
                    },
                  },
                );

              if (!channel) {
                throw new Error(
                  "Active sales channel not found",
                );
              }
            }

            const productIds =
              normalizedItems.map(
                (
                  item,
                ) =>
                  item.productId,
              );

            /*
             * Load authoritative prices
             * and stock from database.
             */
            const products =
              await tx.product.findMany(
                {
                  where: {
                    id: {
                      in:
                        productIds,
                    },

                    isActive:
                      true,
                  },

                  include: {
                    finishedGoodsLots:
                      {
                        where:
                          {
                            remainingQty:
                              {
                                gt: 0,
                              },
                          },
                      },
                  },
                },
              );

            const productMap =
              new Map(
                products.map(
                  (
                    product,
                  ) => [
                    product.id,
                    product,
                  ],
                ),
              );

            const missingProduct =
              productIds.find(
                (
                  productId,
                ) =>
                  !productMap.has(
                    productId,
                  ),
              );

            if (
              missingProduct
            ) {
              throw new Error(
                "One or more active products were not found",
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
                    lot.remainingQty,
                  ),
                );
              }
            }

            type PlannedAllocation = {
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
              productId:
                string;

              qty:
                number;

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
              PlannedItem[] =
                [];

            /*
             * Plan FEFO inventory
             * consumption.
             */
            for (
              const requestedItem of
              normalizedItems
            ) {
              const product =
                productMap.get(
                  requestedItem.productId,
                );

              if (!product) {
                throw new Error(
                  "Product not found",
                );
              }

              const eligibleLots =
                sortFinishedLots(
                  product.finishedGoodsLots.filter(
                    (
                      lot,
                    ) =>
                      !isExpired(
                        lot.expiryDate,
                        soldAt,
                      ),
                  ),
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
                    lot.id,
                  ) ||
                  0;

                if (
                  available <=
                  0
                ) {
                  continue;
                }

                const take =
                  round3(
                    Math.min(
                      remainingNeed,
                      available,
                    ),
                  );

                const unitCost =
                  Number(
                    lot.unitCost,
                  );

                const costAmount =
                  round2(
                    take *
                      unitCost,
                  );

                allocations.push(
                  {
                    finishedGoodsLotId:
                      lot.id,

                    consumedQty:
                      take,

                    unitCost,

                    costAmount,
                  },
                );

                lotRemainingMap.set(
                  lot.id,

                  round3(
                    available -
                      take,
                  ),
                );

                remainingNeed =
                  round3(
                    remainingNeed -
                      take,
                  );
              }

              if (
                remainingNeed >
                0
              ) {
                const availableQty =
                  round3(
                    requestedItem.qty -
                      remainingNeed,
                  );

                throw new Error(
                  `${getProductDisplayName(
                    product,
                  )} has only ${availableQty} sellable item(s) in Bakery Stock.`,
                );
              }

              const unitSellPrice =
                Number(
                  product.sellPrice,
                );

              const lineTotal =
                round2(
                  requestedItem.qty *
                    unitSellPrice,
                );

              const cogsTotal =
                round2(
                  allocations.reduce(
                    (
                      sum,
                      allocation,
                    ) =>
                      sum +
                      allocation.costAmount,
                    0,
                  ),
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
                        cogsTotal,
                    ),

                  allocations,
                },
              );
            }

            const grossTotal =
              round2(
                plannedItems.reduce(
                  (
                    sum,
                    item,
                  ) =>
                    sum +
                    item.lineTotal,
                  0,
                ),
              );

            /*
             * Never silently clamp a
             * manager-approved discount.
             *
             * Approval is tied to the
             * exact requested amount.
             */
            if (
              requestedDiscount >
              grossTotal
            ) {
              throw new Error(
                "Manual discount cannot exceed the sale gross total.",
              );
            }

            const discountTotal =
              requestedDiscount;

            /*
             * Distribute order discount
             * proportionally.
             */
            let allocatedDiscount =
              0;

            plannedItems.forEach(
              (
                item,
                index,
              ) => {
                const remainingDiscount =
                  round2(
                    Math.max(
                      discountTotal -
                        allocatedDiscount,
                      0,
                    ),
                  );

                const proportionalDiscount =
                  grossTotal >
                  0
                    ? round2(
                        (
                          discountTotal *
                          item.lineTotal
                        ) /
                          grossTotal,
                      )
                    : 0;

                const itemDiscount =
                  index ===
                  plannedItems.length -
                    1
                    ? remainingDiscount
                    : Math.min(
                        proportionalDiscount,
                        remainingDiscount,
                      );

                item.discountTotal =
                  round2(
                    Math.max(
                      0,
                      Math.min(
                        itemDiscount,
                        item.lineTotal,
                      ),
                    ),
                  );

                item.netTotal =
                  round2(
                    item.lineTotal -
                      item.discountTotal,
                  );

                item.profitTotal =
                  round2(
                    item.netTotal -
                      item.cogsTotal,
                  );

                allocatedDiscount =
                  round2(
                    allocatedDiscount +
                      item.discountTotal,
                  );
              },
            );

            const netTotal =
              round2(
                grossTotal -
                  discountTotal,
              );

            const cogsTotal =
              round2(
                plannedItems.reduce(
                  (
                    sum,
                    item,
                  ) =>
                    sum +
                    item.cogsTotal,
                  0,
                ),
              );

            const profitTotal =
              round2(
                netTotal -
                  cogsTotal,
              );

            const orderNo =
              await nextDocumentNumber(
                tx,
                "SALE",
                "SAL",
                soldAt,
              );

            /*
             * Create sale header.
             */
            const sale =
              await tx.salesOrder.create(
                {
                  data: {
                    orderNo,

                    salesChannelId:
                      parsed.data
                        .salesChannelId ??
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

                    soldAt,
                  },
                },
              );

            /*
             * Create sale items and
             * consume finished-goods
             * lots.
             */
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
                        plannedItem.profitTotal,
                    },
                  },
                );

              for (
                const allocation of
                plannedItem.allocations
              ) {
                /*
                 * Conditional decrement
                 * prevents negative stock
                 * if another terminal
                 * consumes this lot.
                 */
                const updated =
                  await tx.finishedGoodsLot.updateMany(
                    {
                      where: {
                        id:
                          allocation.finishedGoodsLotId,

                        remainingQty:
                          {
                            gte:
                              allocation.consumedQty,
                          },
                      },

                      data: {
                        remainingQty:
                          {
                            decrement:
                              allocation.consumedQty,
                          },
                      },
                    },
                  );

                if (
                  updated.count !==
                  1
                ) {
                  throw new Error(
                    "Bakery Stock changed while completing the sale. Please retry.",
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
                        allocation.costAmount,
                    },
                  },
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
                        soldAt,
                    },
                  },
                );
              }
            }

            /*
             * Consume manager approval.
             *
             * This remains inside the
             * same transaction as stock
             * and sale creation.
             *
             * updateMany provides the
             * compare-and-set protection
             * needed against concurrent
             * reuse.
             */
            if (
              validatedApprovalId
            ) {
              const consumedApproval =
                await tx.posApproval.updateMany(
                  {
                    where: {
                      id:
                        validatedApprovalId,

                      type:
                        "MANUAL_DISCOUNT",

                      status:
                        "APPROVED",

                      requestedById:
                        req.user!.id,

                      usedAt:
                        null,

                      saleId:
                        null,

                      expiresAt: {
                        gt:
                          soldAt,
                      },
                    },

                    data: {
                      status:
                        "USED",

                      usedAt:
                        soldAt,

                      saleId:
                        sale.id,
                    },
                  },
                );

              if (
                consumedApproval.count !==
                1
              ) {
                throw new Error(
                  "Manager approval was already used, expired, or changed. Please request a new approval.",
                );
              }

              await tx.auditLog.create(
                {
                  data: {
                    userId:
                      req.user!.id,

                    action:
                      "USE",

                    entityType:
                      "PosApproval",

                    entityId:
                      validatedApprovalId,

                    afterJson: {
                      approvalType:
                        "MANUAL_DISCOUNT",

                      saleId:
                        sale.id,

                      orderNo,

                      discountTotal,

                      usedById:
                        req.user!.id,

                      usedAt:
                        soldAt,
                    },
                  },
                },
              );
            }

            /*
             * Audit completed sale.
             */
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
                        .paymentMethod,

                    manualDiscount:
                      discountTotal >
                      0,

                    managerApprovalId:
                      validatedApprovalId,

                    cashierUserId:
                      req.user!.id,
                  },
                },
              },
            );

            return sale;
          },
        );

      /*
       * Load receipt information after
       * the transaction has committed.
       */
      const saleWithDetails =
        await prisma.salesOrder.findUnique(
          {
            where: {
              id:
                createdSale.id,
            },

            include: {
              salesChannel:
                true,

              items: {
                include: {
                  product:
                    true,
                },
              },
            },
          },
        );

      if (!saleWithDetails) {
        return res
          .status(500)
          .json({
            message:
              "Sale completed but receipt data could not be loaded.",
          });
      }

      /*
       * Ordinary cashier accounts must
       * not receive COGS/profit data.
       */
      const canViewFinancialData =
        hasAnyRole(
          req,
          "ADMIN",
          "MANAGER",
          "ACCOUNT_STAFF",
        );

      if (
        !canViewFinancialData
      ) {
        return res
          .status(201)
          .json({
            message:
              "Sale completed successfully",

            sale: {
              id:
                saleWithDetails.id,

              orderNo:
                saleWithDetails.orderNo,

              salesChannel:
                saleWithDetails.salesChannel
                  ?.name ||
                "Direct",

              paymentMethod:
                saleWithDetails.paymentMethod,

              grossTotal:
                saleWithDetails.grossTotal,

              discountTotal:
                saleWithDetails.discountTotal,

              netTotal:
                saleWithDetails.netTotal,

              status:
                saleWithDetails.status,

              soldAt:
                saleWithDetails.soldAt,

              items:
                saleWithDetails.items.map(
                  (
                    item,
                  ) => ({
                    id:
                      item.id,

                    productId:
                      item.productId,

                    productDisplayName:
                      getProductDisplayName(
                        item.product,
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
                  }),
                ),
            },
          });
      }

      /*
       * Management response may contain
       * the complete financial data.
       */
      return res
        .status(201)
        .json({
          message:
            "Sale completed successfully",

          sale:
            saleWithDetails,
        });
    } catch (
      error
    ) {
      return res
        .status(400)
        .json({
          message:
            error instanceof
            Error
              ? error.message
              : "Failed to complete sale",
        });
    }
  },
);

export default router;
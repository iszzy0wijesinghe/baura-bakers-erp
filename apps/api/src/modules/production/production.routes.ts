import { Router } from "express";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { nextDocumentNumber } from "../../lib/documentSequence";
import { runSerializableTransaction } from "../../lib/transaction";
import { getRouteParam } from "../../lib/http";

import {
  authMiddleware,
  requireRoles
} from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

const productionSchema = z.object({
  productId: z
    .string()
    .uuid("Valid product is required"),

  plannedQty: z.coerce
    .number()
    .positive("Planned quantity must be positive"),

  producedQty: z.coerce
    .number()
    .positive("Good quantity must be greater than 0"),

  rejectedQty: z.coerce
    .number()
    .min(
      0,
      "Rejected quantity cannot be negative"
    )
    .default(0),

  productionDate: z
    .string()
    .trim()
    .optional()
    .nullable(),

  expiryDate: z
    .string()
    .trim()
    .optional()
    .nullable(),

  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
});

const previewSchema = z.object({
  productId: z
    .string()
    .uuid("Valid product is required"),

  producedQty: z.coerce
    .number()
    .positive("Good quantity must be greater than 0"),

  rejectedQty: z.coerce
    .number()
    .min(0)
    .default(0)
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

function round6(value: number) {
  return Number(
    value.toFixed(6)
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

function getIngredientDisplayName(
  ingredient: {
    brand: string | null;
    name: string;
    packageQty: unknown;
    packageUnit: string;
  }
) {
  const brand =
    ingredient.brand
      ? `${ingredient.brand} `
      : "";

  return `${brand}${ingredient.name} ${ingredient.packageQty}${ingredient.packageUnit.toLowerCase()}`;
}

function parseOptionalDate(
  value:
    | string
    | null
    | undefined,
  fieldName: string
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      `${fieldName} is invalid`
    );
  }

  return date;
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

function sortIngredientLots<
  T extends {
    expiryDate: Date | null;
    receivedAt: Date;
  }
>(lots: T[]) {
  return [...lots].sort(
    (a, b) => {
      if (
        a.expiryDate &&
        b.expiryDate
      ) {
        const expiryDifference =
          a.expiryDate.getTime() -
          b.expiryDate.getTime();

        if (
          expiryDifference !== 0
        ) {
          return expiryDifference;
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
        a.receivedAt.getTime() -
        b.receivedAt.getTime()
      );
    }
  );
}

async function loadProductForPlanning(
  productId: string
) {
  return prisma.product.findFirst({
    where: {
      id: productId,
      isActive: true
    },

    include: {
      recipeItems: {
        include: {
          ingredient: {
            include: {
              stockLots: {
                where: {
                  remainingBaseQty: {
                    gt: 0
                  }
                }
              }
            }
          }
        },

        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });
}

async function calculateMaterialPlan(
  product: Awaited<
    ReturnType<
      typeof loadProductForPlanning
    >
  >,
  attemptedQty: number,
  at = new Date()
) {
  if (!product) {
    throw new Error(
      "Active product not found"
    );
  }

  if (
    product.recipeItems.length ===
    0
  ) {
    throw new Error(
      `${getProductDisplayName(
        product
      )} does not have a recipe`
    );
  }

  type Allocation = {
    stockLotId: string;
    ingredientId: string;
    consumedBaseQty: number;
    unitCostBase: number;
    costAmount: number;
  };

  type Requirement = {
    ingredientId: string;
    ingredientDisplayName: string;
    baseUnit: string;
    requiredBaseQty: number;
    availableBaseQty: number;
    shortageBaseQty: number;
    estimatedCost: number;
    isAvailable: boolean;
  };

  const allocations:
    Allocation[] = [];

  const requirements:
    Requirement[] = [];

  let totalEstimatedCost =
    0;

  let canPost =
    true;

  for (
    const recipeItem of
    product.recipeItems
  ) {
    const requiredBaseQty =
      round3(
        Number(
          recipeItem.requiredBaseQty
        ) *
          attemptedQty
      );

    const eligibleLots =
      sortIngredientLots(
        recipeItem.ingredient.stockLots.filter(
          (lot) =>
            Number(
              lot.remainingBaseQty
            ) >
              0 &&
            !isExpired(
              lot.expiryDate,
              at
            )
        )
      );

    const availableBaseQty =
      round3(
        eligibleLots.reduce(
          (
            total,
            lot
          ) =>
            total +
            Number(
              lot.remainingBaseQty
            ),
          0
        )
      );

    let remainingNeed =
      requiredBaseQty;

    let ingredientEstimatedCost =
      0;

    for (
      const lot of
      eligibleLots
    ) {
      if (
        remainingNeed <= 0
      ) {
        break;
      }

      const available =
        Number(
          lot.remainingBaseQty
        );

      const consumedQty =
        round3(
          Math.min(
            remainingNeed,
            available
          )
        );

      const unitCostBase =
        Number(
          lot.unitCostBase
        );

      const costAmount =
        round2(
          consumedQty *
            unitCostBase
        );

      allocations.push({
        stockLotId:
          lot.id,

        ingredientId:
          recipeItem.ingredientId,

        consumedBaseQty:
          consumedQty,

        unitCostBase,

        costAmount
      });

      ingredientEstimatedCost =
        round2(
          ingredientEstimatedCost +
            costAmount
        );

      remainingNeed =
        round3(
          remainingNeed -
            consumedQty
        );
    }

    const shortageBaseQty =
      round3(
        Math.max(
          remainingNeed,
          0
        )
      );

    const isAvailable =
      shortageBaseQty <= 0;

    if (!isAvailable) {
      canPost = false;
    }

    totalEstimatedCost =
      round2(
        totalEstimatedCost +
          ingredientEstimatedCost
      );

    requirements.push({
      ingredientId:
        recipeItem.ingredientId,

      ingredientDisplayName:
        getIngredientDisplayName(
          recipeItem.ingredient
        ),

      baseUnit:
        recipeItem.baseUnit,

      requiredBaseQty,

      availableBaseQty,

      shortageBaseQty,

      estimatedCost:
        ingredientEstimatedCost,

      isAvailable
    });
  }

  return {
    allocations,
    requirements,
    canPost,
    totalEstimatedCost
  };
}

/*
 * --------------------------------------------------------------------------
 * PRODUCT OPTIONS FOR PRODUCTION
 * --------------------------------------------------------------------------
 */

router.get(
  "/products",
  async (_req, res) => {
    try {
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
              variantName: "asc"
            }
          ],

          include: {
            _count: {
              select: {
                recipeItems: true
              }
            }
          }
        });

      return res.json({
        products:
          products.map(
            (product) => ({
              id:
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

              recipeItemCount:
                product._count
                  .recipeItems,

              canProduce:
                product._count
                  .recipeItems >
                0
            })
          )
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to load production products"
        });
    }
  }
);

/*
 * --------------------------------------------------------------------------
 * PRODUCTION PREVIEW
 * --------------------------------------------------------------------------
 */

router.post(
  "/preview",
  async (req, res) => {
    const parsed =
      previewSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      return res
        .status(400)
        .json({
          message:
            "Invalid production preview data",

          errors:
            parsed.error.flatten()
        });
    }

    try {
      const product =
        await loadProductForPlanning(
          parsed.data.productId
        );

      const attemptedQty =
        round3(
          parsed.data.producedQty +
            parsed.data.rejectedQty
        );

      const plan =
        await calculateMaterialPlan(
          product,
          attemptedQty
        );

      return res.json({
        preview: {
          productId:
            parsed.data.productId,

          displayName:
            product
              ? getProductDisplayName(
                  product
                )
              : "",

          attemptedQty,

          producedQty:
            parsed.data.producedQty,

          rejectedQty:
            parsed.data.rejectedQty,

          canPost:
            plan.canPost,

          totalEstimatedCost:
            plan.totalEstimatedCost,

          estimatedUnitCost:
            plan.canPost &&
            parsed.data
              .producedQty >
              0
              ? round6(
                  plan.totalEstimatedCost /
                    parsed.data
                      .producedQty
                )
              : null,

          requirements:
            plan.requirements
        }
      });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to calculate production preview"
        });
    }
  }
);

/*
 * --------------------------------------------------------------------------
 * LIST PRODUCTION BATCHES
 * --------------------------------------------------------------------------
 */

router.get(
  "/",
  async (_req, res) => {
    try {
      const batches =
        await prisma.productionBatch.findMany({
          orderBy: [
            {
              productionDate:
                "desc"
            },
            {
              createdAt:
                "desc"
            }
          ],

          take: 200,

          include: {
            product: true,

            createdBy: {
              select: {
                firstName: true,
                lastName: true
              }
            },

            postedBy: {
              select: {
                firstName: true,
                lastName: true
              }
            },

            finishedGoodsLot:
              true
          }
        });

      return res.json({
        batches:
          batches.map(
            (batch) => ({
              id:
                batch.id,

              batchNo:
                batch.batchNo,

              productId:
                batch.productId,

              productDisplayName:
                getProductDisplayName(
                  batch.product
                ),

              plannedQty:
                batch.plannedQty,

              producedQty:
                batch.producedQty,

              rejectedQty:
                batch.rejectedQty,

              status:
                batch.status,

              productionDate:
                batch.productionDate,

              expiryDate:
                batch.expiryDate,

              ingredientCostTotal:
                batch.ingredientCostTotal,

              unitCost:
                batch.unitCost,

              notes:
                batch.notes,

              createdByName:
                `${batch.createdBy.firstName} ${batch.createdBy.lastName}`,

              postedByName:
                batch.postedBy
                  ? `${batch.postedBy.firstName} ${batch.postedBy.lastName}`
                  : null,

              postedAt:
                batch.postedAt,

              bakeryStockRemaining:
                batch.finishedGoodsLot
                  ?.remainingQty ??
                null,

              createdAt:
                batch.createdAt
            })
          )
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to load production batches"
        });
    }
  }
);

/*
 * --------------------------------------------------------------------------
 * GET PRODUCTION BATCH
 * --------------------------------------------------------------------------
 */

router.get(
  "/:id",
  async (req, res) => {
    try {
      const batchId =
        getRouteParam(
          req.params.id,
          "Production batch id"
        );

      const batch =
        await prisma.productionBatch.findUnique({
          where: {
            id:
              batchId
          },

          include: {
            product:
              true,

            createdBy: {
              select: {
                firstName: true,
                lastName: true
              }
            },

            postedBy: {
              select: {
                firstName: true,
                lastName: true
              }
            },

            consumptions: {
              include: {
                ingredient:
                  true,

                stockLot:
                  true
              },

              orderBy: {
                createdAt:
                  "asc"
              }
            },

            finishedGoodsLot:
              true
          }
        });

      if (!batch) {
        return res
          .status(404)
          .json({
            message:
              "Production batch not found"
          });
      }

      return res.json({
        batch: {
          id:
            batch.id,

          batchNo:
            batch.batchNo,

          productId:
            batch.productId,

          productDisplayName:
            getProductDisplayName(
              batch.product
            ),

          plannedQty:
            batch.plannedQty,

          producedQty:
            batch.producedQty,

          rejectedQty:
            batch.rejectedQty,

          status:
            batch.status,

          productionDate:
            batch.productionDate,

          expiryDate:
            batch.expiryDate,

          ingredientCostTotal:
            batch.ingredientCostTotal,

          unitCost:
            batch.unitCost,

          notes:
            batch.notes,

          createdByName:
            `${batch.createdBy.firstName} ${batch.createdBy.lastName}`,

          postedByName:
            batch.postedBy
              ? `${batch.postedBy.firstName} ${batch.postedBy.lastName}`
              : null,

          postedAt:
            batch.postedAt,

          finishedGoodsLot:
            batch.finishedGoodsLot,

          consumptions:
            batch.consumptions.map(
              (
                consumption
              ) => ({
                id:
                  consumption.id,

                ingredientId:
                  consumption
                    .ingredientId,

                ingredientDisplayName:
                  getIngredientDisplayName(
                    consumption
                      .ingredient
                  ),

                stockLotId:
                  consumption
                    .stockLotId,

                lotNumber:
                  consumption
                    .stockLot
                    .lotNumber,

                consumedBaseQty:
                  consumption
                    .consumedBaseQty,

                unitCostBase:
                  consumption
                    .unitCostBase,

                costAmount:
                  consumption
                    .costAmount
              })
            )
        }
      });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to load production batch"
        });
    }
  }
);

/*
 * --------------------------------------------------------------------------
 * CREATE PRODUCTION DRAFT
 * --------------------------------------------------------------------------
 */

router.post(
  "/",

  requireRoles(
    "ADMIN",
    "MANAGER",
    "PRODUCTION_STAFF"
  ),

  async (req, res) => {
    const parsed =
      productionSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      return res
        .status(400)
        .json({
          message:
            "Invalid production data",

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
      const productionDate =
        parseOptionalDate(
          parsed.data
            .productionDate,
          "Production date"
        ) ??
        new Date();

      const expiryDate =
        parseOptionalDate(
          parsed.data
            .expiryDate,
          "Expiry date"
        );

      if (
        expiryDate &&
        expiryDate <=
          productionDate
      ) {
        throw new Error(
          "Expiry date must be after the production date"
        );
      }

      const product =
        await prisma.product.findFirst({
          where: {
            id:
              parsed.data
                .productId,

            isActive:
              true
          },

          include: {
            _count: {
              select: {
                recipeItems:
                  true
              }
            }
          }
        });

      if (!product) {
        throw new Error(
          "Active product not found"
        );
      }

      if (
        product._count
          .recipeItems ===
        0
      ) {
        throw new Error(
          `${getProductDisplayName(
            product
          )} does not have a recipe`
        );
      }

      const batch =
        await runSerializableTransaction(
          async (tx) => {
            const batchNo =
              await nextDocumentNumber(
                tx,
                "PRODUCTION",
                "PRD",
                productionDate
              );

            const created =
              await tx.productionBatch.create({
                data: {
                  batchNo,

                  productId:
                    parsed.data
                      .productId,

                  plannedQty:
                    round3(
                      parsed.data
                        .plannedQty
                    ),

                  producedQty:
                    round3(
                      parsed.data
                        .producedQty
                    ),

                  rejectedQty:
                    round3(
                      parsed.data
                        .rejectedQty
                    ),

                  status:
                    "DRAFT",

                  productionDate,

                  expiryDate,

                  notes:
                    parsed.data
                      .notes ||
                    null,

                  createdById:
                    req.user!.id
                }
              });

            await tx.auditLog.create({
              data: {
                userId:
                  req.user!.id,

                action:
                  "CREATE",

                entityType:
                  "ProductionBatch",

                entityId:
                  created.id,

                afterJson: {
                  batchNo:
                    created.batchNo,

                  productId:
                    created.productId,

                  plannedQty:
                    String(
                      created.plannedQty
                    ),

                  producedQty:
                    String(
                      created.producedQty
                    ),

                  rejectedQty:
                    String(
                      created.rejectedQty
                    ),

                  status:
                    created.status
                }
              }
            });

            return created;
          }
        );

      /*
       * IMPORTANT:
       *
       * Do not use batch.product here.
       *
       * `batch` is intentionally returned as the plain
       * ProductionBatch record from the transaction.
       * We already loaded and validated `product` above.
       */
      return res
        .status(201)
        .json({
          message:
            "Production draft created",

          batch: {
            ...batch,

            productDisplayName:
              getProductDisplayName(
                product
              )
          }
        });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to create production batch"
        });
    }
  }
);

/*
 * --------------------------------------------------------------------------
 * POST PRODUCTION
 *
 * DRAFT
 *   ↓
 * consume raw ingredient lots
 *   ↓
 * ProductionConsumption
 *   ↓
 * StockMovement(PRODUCTION)
 *   ↓
 * FinishedGoodsLot
 *   ↓
 * FinishedGoodsMovement(PRODUCTION)
 *   ↓
 * Bakery Stock
 * --------------------------------------------------------------------------
 */

router.post(
  "/:id/post",

  requireRoles(
    "ADMIN",
    "MANAGER",
    "PRODUCTION_STAFF"
  ),

  async (req, res) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required"
        });
    }

    try {
      const batchId =
        getRouteParam(
          req.params.id,
          "Production batch id"
        );

      const postedBatch =
        await runSerializableTransaction(
          async (tx) => {
            const batch =
              await tx.productionBatch.findUnique({
                where: {
                  id:
                    batchId
                },

                include: {
                  product: {
                    include: {
                      recipeItems: {
                        include: {
                          ingredient: {
                            include: {
                              stockLots: {
                                where: {
                                  remainingBaseQty: {
                                    gt: 0
                                  }
                                }
                              }
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
                }
              });

            if (!batch) {
              throw new Error(
                "Production batch not found"
              );
            }

            if (
              batch.status !==
              "DRAFT"
            ) {
              throw new Error(
                "Only draft production batches can be posted"
              );
            }

            const producedQty =
              Number(
                batch.producedQty
              );

            const rejectedQty =
              Number(
                batch.rejectedQty
              );

            /*
             * Raw materials are consumed for all attempted units.
             *
             * Example:
             * 9 good + 1 rejected = ingredients consumed for 10.
             *
             * Only the 9 good units enter Bakery Stock.
             */
            const attemptedQty =
              round3(
                producedQty +
                  rejectedQty
              );

            if (
              producedQty <= 0
            ) {
              throw new Error(
                "Good produced quantity must be greater than 0"
              );
            }

            if (
              batch.product
                .recipeItems
                .length ===
              0
            ) {
              throw new Error(
                `${getProductDisplayName(
                  batch.product
                )} does not have a recipe`
              );
            }

            /*
             * We already loaded the product, recipe and stock lots
             * inside the serializable transaction.
             *
             * calculateMaterialPlan does not need to issue another
             * database query here.
             */
            const plan =
              await calculateMaterialPlan(
                batch.product,
                attemptedQty,
                batch.productionDate
              );

            if (
              !plan.canPost
            ) {
              const shortages =
                plan.requirements
                  .filter(
                    (item) =>
                      !item.isAvailable
                  )
                  .map(
                    (item) =>
                      `${item.ingredientDisplayName}: shortage ${item.shortageBaseQty} ${item.baseUnit}`
                  )
                  .join("; ");

              throw new Error(
                `Not enough raw material stock. ${shortages}`
              );
            }

            /*
             * Consume raw ingredient lots.
             */
            for (
              const allocation of
              plan.allocations
            ) {
              const updated =
                await tx.ingredientStockLot.updateMany({
                  where: {
                    id:
                      allocation.stockLotId,

                    remainingBaseQty: {
                      gte:
                        allocation.consumedBaseQty
                    }
                  },

                  data: {
                    remainingBaseQty: {
                      decrement:
                        allocation.consumedBaseQty
                    }
                  }
                });

              if (
                updated.count !==
                1
              ) {
                throw new Error(
                  "Raw material stock changed while posting production. Please retry."
                );
              }

              await tx.productionConsumption.create({
                data: {
                  productionBatchId:
                    batch.id,

                  ingredientId:
                    allocation.ingredientId,

                  stockLotId:
                    allocation.stockLotId,

                  consumedBaseQty:
                    allocation.consumedBaseQty,

                  unitCostBase:
                    allocation.unitCostBase,

                  costAmount:
                    allocation.costAmount
                }
              });

              await tx.stockMovement.create({
                data: {
                  ingredientId:
                    allocation.ingredientId,

                  stockLotId:
                    allocation.stockLotId,

                  movementType:
                    "PRODUCTION",

                  refType:
                    "PRODUCTION_BATCH",

                  refId:
                    batch.id,

                  qtyDelta:
                    -allocation.consumedBaseQty,

                  unitCostBase:
                    allocation.unitCostBase,

                  costAmount:
                    allocation.costAmount,

                  note:
                    `Consumed by ${batch.batchNo}`
                }
              });
            }

            /*
             * The entire attempted production cost is absorbed
             * by the successful/sellable output.
             *
             * Example:
             * ingredient cost for 10 attempts = Rs 1,000
             * good output = 9
             * unit finished-goods cost = 1000 / 9
             */
            const ingredientCostTotal =
              round2(
                plan.totalEstimatedCost
              );

            const unitCost =
              round6(
                ingredientCostTotal /
                  producedQty
              );

            /*
             * Create one finished-goods lot for this production batch.
             */
            const finishedGoodsLot =
              await tx.finishedGoodsLot.create({
                data: {
                  productionBatchId:
                    batch.id,

                  productId:
                    batch.productId,

                  producedQty,

                  remainingQty:
                    producedQty,

                  unitCost,

                  producedAt:
                    batch.productionDate,

                  expiryDate:
                    batch.expiryDate
                }
              });

            /*
             * Finished stock movement.
             */
            await tx.finishedGoodsMovement.create({
              data: {
                productId:
                  batch.productId,

                stockLotId:
                  finishedGoodsLot.id,

                movementType:
                  "PRODUCTION",

                refType:
                  "PRODUCTION_BATCH",

                refId:
                  batch.id,

                qtyDelta:
                  producedQty,

                unitCost,

                costAmount:
                  ingredientCostTotal,

                note:
                  `Produced by ${batch.batchNo}`,

                occurredAt:
                  batch.productionDate
              }
            });

            /*
             * Mark production batch as POSTED only after
             * all stock operations succeeded.
             */
            const updatedBatch =
              await tx.productionBatch.update({
                where: {
                  id:
                    batch.id
                },

                data: {
                  status:
                    "POSTED",

                  ingredientCostTotal,

                  unitCost,

                  postedById:
                    req.user!.id,

                  postedAt:
                    new Date()
                },

                include: {
                  product:
                    true,

                  finishedGoodsLot:
                    true
                }
              });

            await tx.auditLog.create({
              data: {
                userId:
                  req.user!.id,

                action:
                  "POST",

                entityType:
                  "ProductionBatch",

                entityId:
                  batch.id,

                afterJson: {
                  batchNo:
                    batch.batchNo,

                  productId:
                    batch.productId,

                  attemptedQty,

                  producedQty,

                  rejectedQty,

                  ingredientCostTotal,

                  unitCost,

                  finishedGoodsLotId:
                    finishedGoodsLot.id
                }
              }
            });

            return updatedBatch;
          }
        );

      /*
       * postedBatch.product is safe here because the update
       * explicitly used include: { product: true }.
       */
      return res.json({
        message:
          "Production posted and bakery stock updated",

        batch: {
          ...postedBatch,

          productDisplayName:
            getProductDisplayName(
              postedBatch.product
            )
        }
      });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to post production"
        });
    }
  }
);

/*
 * --------------------------------------------------------------------------
 * DELETE PRODUCTION DRAFT
 * --------------------------------------------------------------------------
 */

router.delete(
  "/:id",

  requireRoles(
    "ADMIN",
    "MANAGER",
    "PRODUCTION_STAFF"
  ),

  async (req, res) => {
    if (!req.user) {
      return res
        .status(401)
        .json({
          message:
            "Authentication required"
        });
    }

    try {
      const batchId =
        getRouteParam(
          req.params.id,
          "Production batch id"
        );

      const batch =
        await prisma.productionBatch.findUnique({
          where: {
            id:
              batchId
          }
        });

      if (!batch) {
        return res
          .status(404)
          .json({
            message:
              "Production batch not found"
          });
      }

      if (
        batch.status !==
        "DRAFT"
      ) {
        return res
          .status(400)
          .json({
            message:
              "Only draft production batches can be deleted"
          });
      }

      await prisma.$transaction(
        async (tx) => {
          await tx.auditLog.create({
            data: {
              userId:
                req.user!.id,

              action:
                "DELETE_DRAFT",

              entityType:
                "ProductionBatch",

              entityId:
                batch.id,

              beforeJson: {
                batchNo:
                  batch.batchNo,

                productId:
                  batch.productId,

                plannedQty:
                  String(
                    batch.plannedQty
                  ),

                producedQty:
                  String(
                    batch.producedQty
                  ),

                rejectedQty:
                  String(
                    batch.rejectedQty
                  ),

                status:
                  batch.status
              }
            }
          });

          await tx.productionBatch.delete({
            where: {
              id:
                batch.id
            }
          });
        }
      );

      return res.json({
        message:
          "Production draft deleted"
      });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to delete production draft"
        });
    }
  }
);

export default router;
/** @format */

import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { nextDocumentNumber } from "../../lib/documentSequence";
import { runSerializableTransaction } from "../../lib/transaction";
import { getRouteParam } from "../../lib/http";

import {
  authMiddleware,
  requirePermission,
} from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

const productionSchema = z.object({
  productId: z.string().uuid("Valid product is required"),
  productSizeId: z.string().uuid().nullable().optional(),
  plannedQty: z.coerce.number().positive(),
  producedQty: z.coerce.number().positive(),
  rejectedQty: z.coerce.number().min(0).default(0),
  productionDate: z.string().trim().nullable().optional(),
  expiryDate: z.string().trim().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const previewSchema = z.object({
  productId: z.string().uuid("Valid product is required"),
  productSizeId: z.string().uuid().nullable().optional(),
  producedQty: z.coerce.number().positive(),
  rejectedQty: z.coerce.number().min(0).default(0),
});

function round2(value: number) {
  return Number(value.toFixed(2));
}

function round3(value: number) {
  return Number(value.toFixed(3));
}

function round6(value: number) {
  return Number(value.toFixed(6));
}

function getProductDisplayName(product: {
  name: string;
  variantName: string | null;
}) {
  return product.variantName
    ? `${product.name} - ${product.variantName}`
    : product.name;
}

function getIngredientDisplayName(ingredient: {
  brand: string | null;
  name: string;
  packageQty: unknown;
  packageUnit: string;
}) {
  const brand = ingredient.brand ? `${ingredient.brand} ` : "";

  return `${brand}${ingredient.name} ${ingredient.packageQty}${ingredient.packageUnit.toLowerCase()}`;
}

function parseOptionalDate(
  value: string | null | undefined,
  fieldName: string,
) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} is invalid`);
  }

  return date;
}

function isExpired(expiryDate: Date | null, at = new Date()) {
  return Boolean(expiryDate && expiryDate.getTime() < at.getTime());
}

function sortIngredientLots<
  T extends {
    expiryDate: Date | null;
    receivedAt: Date;
  },
>(lots: T[]) {
  return [...lots].sort((a, b) => {
    if (a.expiryDate && b.expiryDate) {
      const difference =
        a.expiryDate.getTime() - b.expiryDate.getTime();

      if (difference !== 0) return difference;
    } else if (a.expiryDate) {
      return -1;
    } else if (b.expiryDate) {
      return 1;
    }

    return a.receivedAt.getTime() - b.receivedAt.getTime();
  });
}

type DatabaseClient =
  | typeof prisma
  | Prisma.TransactionClient;

async function loadProductForPlanning(
  db: DatabaseClient,
  productId: string,
) {
  return db.product.findFirst({
    where: {
      id: productId,
      isActive: true,
      officialSiteProductId: {
        not: null,
      },
    },
    include: {
      sizes: true,
      recipeItems: {
        include: {
          ingredient: {
            include: {
              stockLots: {
                where: {
                  remainingBaseQty: {
                    gt: 0,
                  },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      recipeExpenses: {
        where: {
          isActive: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

type PlanningProduct = NonNullable<
  Awaited<ReturnType<typeof loadProductForPlanning>>
>;

function resolveProductSize(
  product: PlanningProduct,
  productSizeId: string | null | undefined,
) {
  const sizes = product.sizes;

  if (!productSizeId) {
    if (sizes.length > 0) {
      throw new Error(
        "Please select a product size before production.",
      );
    }

    return null;
  }

  const size = sizes.find(
    (item) => item.id === productSizeId,
  );

  if (!size) {
    throw new Error(
      "Selected product size does not belong to this product.",
    );
  }

  return size;
}

function selectRecipeItems(
  product: PlanningProduct,
  productSizeId: string | null,
) {
  const exactItems = product.recipeItems.filter(
    (item) => item.productSizeId === productSizeId,
  );

  if (exactItems.length > 0) {
    return exactItems;
  }

  if (productSizeId) {
    return product.recipeItems.filter(
      (item) => item.productSizeId === null,
    );
  }

  return exactItems;
}

function selectRecipeExpenses(
  product: PlanningProduct,
  productSizeId: string | null,
) {
  const exactExpenses = product.recipeExpenses.filter(
    (expense) => expense.productSizeId === productSizeId,
  );

  if (exactExpenses.length > 0) {
    return exactExpenses;
  }

  if (productSizeId) {
    return product.recipeExpenses.filter(
      (expense) => expense.productSizeId === null,
    );
  }

  return exactExpenses;
}

type MaterialAllocation = {
  stockLotId: string;
  ingredientId: string;
  consumedBaseQty: number;
  unitCostBase: number;
  costAmount: number;
};

type MaterialRequirement = {
  ingredientId: string;
  ingredientDisplayName: string;
  baseUnit: string;
  requiredBaseQty: number;
  availableBaseQty: number;
  shortageBaseQty: number;
  estimatedCost: number;
  isAvailable: boolean;
};

async function calculateMaterialPlan(
  product: PlanningProduct,
  productSizeId: string | null,
  attemptedQty: number,
  at = new Date(),
) {
  const recipeItems = selectRecipeItems(
    product,
    productSizeId,
  );

  if (recipeItems.length === 0) {
    throw new Error(
      `${getProductDisplayName(product)} does not have a recipe for the selected size.`,
    );
  }

  const allocations: MaterialAllocation[] = [];
  const requirements: MaterialRequirement[] = [];

  let totalEstimatedCost = 0;
  let canPost = true;

  for (const recipeItem of recipeItems) {
    const requiredBaseQty = round3(
      Number(recipeItem.requiredBaseQty) * attemptedQty,
    );

    const eligibleLots = sortIngredientLots(
      recipeItem.ingredient.stockLots.filter(
        (lot) =>
          Number(lot.remainingBaseQty) > 0 &&
          !isExpired(lot.expiryDate, at),
      ),
    );

    const availableBaseQty = round3(
      eligibleLots.reduce(
        (total, lot) =>
          total + Number(lot.remainingBaseQty),
        0,
      ),
    );

    let remainingNeed = requiredBaseQty;
    let ingredientEstimatedCost = 0;

    for (const lot of eligibleLots) {
      if (remainingNeed <= 0) break;

      const available = Number(lot.remainingBaseQty);

      const consumedQty = round3(
        Math.min(remainingNeed, available),
      );

      const unitCostBase = Number(lot.unitCostBase);
      const costAmount = round2(
        consumedQty * unitCostBase,
      );

      allocations.push({
        stockLotId: lot.id,
        ingredientId: recipeItem.ingredientId,
        consumedBaseQty: consumedQty,
        unitCostBase,
        costAmount,
      });

      ingredientEstimatedCost = round2(
        ingredientEstimatedCost + costAmount,
      );

      remainingNeed = round3(
        remainingNeed - consumedQty,
      );
    }

    const shortageBaseQty = round3(
      Math.max(remainingNeed, 0),
    );

    const isAvailable = shortageBaseQty <= 0;

    if (!isAvailable) {
      canPost = false;
    }

    totalEstimatedCost = round2(
      totalEstimatedCost + ingredientEstimatedCost,
    );

    requirements.push({
      ingredientId: recipeItem.ingredientId,
      ingredientDisplayName:
        getIngredientDisplayName(
          recipeItem.ingredient,
        ),
      baseUnit: recipeItem.baseUnit,
      requiredBaseQty,
      availableBaseQty,
      shortageBaseQty,
      estimatedCost: ingredientEstimatedCost,
      isAvailable,
    });
  }

  return {
    allocations,
    requirements,
    canPost,
    totalEstimatedCost,
  };
}

function calculateExpensePlan(
  product: PlanningProduct,
  productSizeId: string | null,
  producedQty: number,
  attemptedQty: number,
) {
  const recipeExpenses = selectRecipeExpenses(
    product,
    productSizeId,
  );

  const expenses = recipeExpenses.map((expense) => {
    const quantity = Number(expense.quantity);
    const rate = Number(expense.rate);

    let effectiveQuantity = quantity;

    switch (expense.calculationMethod) {
      case "PER_BATCH":
        effectiveQuantity = quantity;
        break;

      case "PER_UNIT":
        effectiveQuantity = round3(
          quantity * attemptedQty,
        );
        break;

      case "QUANTITY_BASED":
        effectiveQuantity = quantity;
        break;
    }

    const totalAmount = round2(
      effectiveQuantity * rate,
    );

    return {
      recipeExpenseId: expense.id,
      name: expense.name,
      category: expense.category,
      calculationMethod:
        expense.calculationMethod,
      quantity: effectiveQuantity,
      rate,
      totalAmount,
      description: expense.description,
    };
  });

  const expenseCostTotal = round2(
    expenses.reduce(
      (total, expense) =>
        total + expense.totalAmount,
      0,
    ),
  );

  return {
    expenses,
    expenseCostTotal,
    producedQty,
    attemptedQty,
  };
}

async function buildProductionPlan(
  product: PlanningProduct,
  productSizeId: string | null,
  producedQty: number,
  rejectedQty: number,
  at = new Date(),
) {
  const attemptedQty = round3(
    producedQty + rejectedQty,
  );

  const materials = await calculateMaterialPlan(
    product,
    productSizeId,
    attemptedQty,
    at,
  );

  const expensePlan = calculateExpensePlan(
    product,
    productSizeId,
    producedQty,
    attemptedQty,
  );

  const ingredientCostTotal = round2(
    materials.totalEstimatedCost,
  );

  const expenseCostTotal = round2(
    expensePlan.expenseCostTotal,
  );

  const totalProductionCost = round2(
    ingredientCostTotal + expenseCostTotal,
  );

  const unitCost = round6(
    totalProductionCost / producedQty,
  );

  return {
    attemptedQty,
    producedQty,
    rejectedQty,
    canPost: materials.canPost,
    allocations: materials.allocations,
    requirements: materials.requirements,
    expenses: expensePlan.expenses,
    ingredientCostTotal,
    expenseCostTotal,
    totalProductionCost,
    unitCost,
  };
}

/*
 * PRODUCT OPTIONS
 */

router.get(
  "/products",
  requirePermission("erp.production.read"),
  async (_req, res) => {
    try {
      const products = await prisma.product.findMany({
        where: {
          isActive: true,
          officialSiteProductId: {
            not: null,
          },
        },
        orderBy: [
          { name: "asc" },
          { variantName: "asc" },
        ],
        include: {
          sizes: true,
          recipeItems: {
            select: {
              productSizeId: true,
            },
          },
        },
      });

      return res.json({
        products: products.map((product) => {
          const sharedRecipeCount =
            product.recipeItems.filter(
              (item) =>
                item.productSizeId === null,
            ).length;

          return {
            id: product.id,
            officialSiteProductId:
              product.officialSiteProductId,
            officialSiteSyncedAt:
              product.officialSiteSyncedAt,
            name: product.name,
            variantName: product.variantName,
            displayName:
              getProductDisplayName(product),
            imageUrl: product.imageUrl,
            sellPrice: product.sellPrice,
            isActive: product.isActive,
            recipeItemCount:
              product.recipeItems.length,
            canProduce:
              product.recipeItems.length > 0,
            sizes: product.sizes.map((size) => {
              const exactRecipeCount =
                product.recipeItems.filter(
                  (item) =>
                    item.productSizeId === size.id,
                ).length;

              return {
                id: size.id,
                officialSiteSizeId:
                  size.officialSiteSizeId,
                label: size.label,
                price: size.price,
                recipeItemCount:
                  exactRecipeCount ||
                  sharedRecipeCount,
                hasSpecificRecipe:
                  exactRecipeCount > 0,
                canProduce:
                  exactRecipeCount > 0 ||
                  sharedRecipeCount > 0,
              };
            }),
          };
        }),
      });
    } catch (error) {
      return res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to load production products",
      });
    }
  },
);

/*
 * PRODUCTION PREVIEW
 */

router.post(
  "/preview",
  requirePermission("erp.production.read"),
  async (req, res) => {
    const parsed = previewSchema.safeParse(
      req.body,
    );

    if (!parsed.success) {
      return res.status(400).json({
        message:
          "Invalid production preview data",
        errors: parsed.error.flatten(),
      });
    }

    try {
      const product =
        await loadProductForPlanning(
          prisma,
          parsed.data.productId,
        );

      if (!product) {
        throw new Error(
          "Active official website product not found",
        );
      }

      const size = resolveProductSize(
        product,
        parsed.data.productSizeId,
      );

      const plan = await buildProductionPlan(
        product,
        size?.id ?? null,
        parsed.data.producedQty,
        parsed.data.rejectedQty,
      );

      return res.json({
        preview: {
          productId: product.id,
          productSizeId: size?.id ?? null,
          productSizeLabel:
            size?.label ?? null,
          officialSiteProductId:
            product.officialSiteProductId,
          displayName:
            getProductDisplayName(product),
          imageUrl: product.imageUrl,
          ...plan,
          totalEstimatedCost:
            plan.totalProductionCost,
          estimatedUnitCost:
            plan.canPost
              ? plan.unitCost
              : null,
        },
      });
    } catch (error) {
      return res.status(400).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to calculate production preview",
      });
    }
  },
);

/*
 * LIST PRODUCTION BATCHES
 */

router.get(
  "/",
  requirePermission("erp.production.read"),
  async (_req, res) => {
    try {
      const batches =
        await prisma.productionBatch.findMany({
          orderBy: [
            { productionDate: "desc" },
            { createdAt: "desc" },
          ],
          take: 200,
          include: {
            product: true,
            productSize: true,
            createdBy: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            postedBy: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            finishedGoodsLot: true,
          },
        });

      return res.json({
        batches: batches.map((batch) => ({
          id: batch.id,
          batchNo: batch.batchNo,
          productId: batch.productId,
          productSizeId:
            batch.productSizeId,
          productSizeLabel:
            batch.productSize?.label ?? null,
          officialSiteProductId:
            batch.product.officialSiteProductId,
          productDisplayName:
            getProductDisplayName(
              batch.product,
            ),
          productImageUrl:
            batch.product.imageUrl,
          plannedQty: batch.plannedQty,
          producedQty: batch.producedQty,
          rejectedQty: batch.rejectedQty,
          status: batch.status,
          productionDate:
            batch.productionDate,
          expiryDate: batch.expiryDate,
          ingredientCostTotal:
            batch.ingredientCostTotal,
          expenseCostTotal:
            batch.expenseCostTotal,
          totalProductionCost:
            batch.totalProductionCost,
          unitCost: batch.unitCost,
          notes: batch.notes,
          createdByName:
            `${batch.createdBy.firstName} ${batch.createdBy.lastName}`,
          postedByName: batch.postedBy
            ? `${batch.postedBy.firstName} ${batch.postedBy.lastName}`
            : null,
          postedAt: batch.postedAt,
          bakeryStockRemaining:
            batch.finishedGoodsLot
              ?.remainingQty ?? null,
          createdAt: batch.createdAt,
        })),
      });
    } catch (error) {
      return res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to load production batches",
      });
    }
  },
);

/*
 * GET PRODUCTION BATCH
 */

router.get(
  "/:id",
  requirePermission("erp.production.read"),
  async (req, res) => {
    try {
      const batchId = getRouteParam(
        req.params.id,
        "Production batch id",
      );

      const batch =
        await prisma.productionBatch.findUnique({
          where: {
            id: batchId,
          },
          include: {
            product: true,
            productSize: true,
            createdBy: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            postedBy: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            consumptions: {
              include: {
                ingredient: true,
                stockLot: true,
              },
              orderBy: {
                createdAt: "asc",
              },
            },
            expenses: {
              orderBy: {
                createdAt: "asc",
              },
            },
            finishedGoodsLot: true,
          },
        });

      if (!batch) {
        return res.status(404).json({
          message:
            "Production batch not found",
        });
      }

      return res.json({
        batch: {
          id: batch.id,
          batchNo: batch.batchNo,
          productId: batch.productId,
          productSizeId:
            batch.productSizeId,
          productSizeLabel:
            batch.productSize?.label ?? null,
          officialSiteProductId:
            batch.product.officialSiteProductId,
          productDisplayName:
            getProductDisplayName(
              batch.product,
            ),
          productImageUrl:
            batch.product.imageUrl,
          sellPrice:
            batch.productSize?.price ??
            batch.product.sellPrice,
          plannedQty: batch.plannedQty,
          producedQty: batch.producedQty,
          rejectedQty: batch.rejectedQty,
          status: batch.status,
          productionDate:
            batch.productionDate,
          expiryDate: batch.expiryDate,
          ingredientCostTotal:
            batch.ingredientCostTotal,
          expenseCostTotal:
            batch.expenseCostTotal,
          totalProductionCost:
            batch.totalProductionCost,
          unitCost: batch.unitCost,
          notes: batch.notes,
          createdByName:
            `${batch.createdBy.firstName} ${batch.createdBy.lastName}`,
          postedByName: batch.postedBy
            ? `${batch.postedBy.firstName} ${batch.postedBy.lastName}`
            : null,
          postedAt: batch.postedAt,
          finishedGoodsLot:
            batch.finishedGoodsLot,
          consumptions:
            batch.consumptions.map(
              (consumption) => ({
                id: consumption.id,
                ingredientId:
                  consumption.ingredientId,
                ingredientDisplayName:
                  getIngredientDisplayName(
                    consumption.ingredient,
                  ),
                stockLotId:
                  consumption.stockLotId,
                lotNumber:
                  consumption.stockLot.lotNumber,
                consumedBaseQty:
                  consumption.consumedBaseQty,
                unitCostBase:
                  consumption.unitCostBase,
                costAmount:
                  consumption.costAmount,
              }),
            ),
          expenses: batch.expenses.map(
            (expense) => ({
              id: expense.id,
              recipeExpenseId:
                expense.recipeExpenseId,
              name: expense.name,
              category: expense.category,
              calculationMethod:
                expense.calculationMethod,
              quantity: expense.quantity,
              rate: expense.rate,
              totalAmount:
                expense.totalAmount,
            }),
          ),
        },
      });
    } catch (error) {
      return res.status(400).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to load production batch",
      });
    }
  },
);

/*
 * CREATE PRODUCTION DRAFT
 */

router.post(
  "/",
  requirePermission("erp.production.create"),
  async (req, res) => {
    const parsed = productionSchema.safeParse(
      req.body,
    );

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid production data",
        errors: parsed.error.flatten(),
      });
    }

    if (!req.user) {
      return res.status(401).json({
        message:
          "Authentication required",
      });
    }

    try {
      const productionDate =
        parseOptionalDate(
          parsed.data.productionDate,
          "Production date",
        ) ?? new Date();

      const expiryDate =
        parseOptionalDate(
          parsed.data.expiryDate,
          "Expiry date",
        );

      if (
        expiryDate &&
        expiryDate <= productionDate
      ) {
        throw new Error(
          "Expiry date must be after the production date",
        );
      }

      const product =
        await loadProductForPlanning(
          prisma,
          parsed.data.productId,
        );

      if (!product) {
        throw new Error(
          "Active official website product not found",
        );
      }

      const size = resolveProductSize(
        product,
        parsed.data.productSizeId,
      );

      const recipeItems = selectRecipeItems(
        product,
        size?.id ?? null,
      );

      if (recipeItems.length === 0) {
        throw new Error(
          `${getProductDisplayName(product)} does not have a recipe for the selected size.`,
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
                productionDate,
              );

            const created =
              await tx.productionBatch.create({
                data: {
                  batchNo,
                  productId: product.id,
                  productSizeId:
                    size?.id ?? null,
                  plannedQty: round3(
                    parsed.data.plannedQty,
                  ),
                  producedQty: round3(
                    parsed.data.producedQty,
                  ),
                  rejectedQty: round3(
                    parsed.data.rejectedQty,
                  ),
                  status: "DRAFT",
                  productionDate,
                  expiryDate,
                  notes:
                    parsed.data.notes || null,
                  createdById:
                    req.user!.id,
                },
              });

            await tx.auditLog.create({
              data: {
                userId: req.user!.id,
                action: "CREATE",
                entityType:
                  "ProductionBatch",
                entityId: created.id,
                afterJson: {
                  batchNo:
                    created.batchNo,
                  productId:
                    created.productId,
                  productSizeId:
                    created.productSizeId,
                  officialSiteProductId:
                    product.officialSiteProductId,
                  plannedQty: String(
                    created.plannedQty,
                  ),
                  producedQty: String(
                    created.producedQty,
                  ),
                  rejectedQty: String(
                    created.rejectedQty,
                  ),
                  status:
                    created.status,
                },
              },
            });

            return created;
          },
        );

      return res.status(201).json({
        message:
          "Production draft created",
        batch: {
          ...batch,
          officialSiteProductId:
            product.officialSiteProductId,
          productDisplayName:
            getProductDisplayName(product),
          productSizeLabel:
            size?.label ?? null,
          productImageUrl:
            product.imageUrl,
        },
      });
    } catch (error) {
      return res.status(400).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to create production batch",
      });
    }
  },
);

/*
 * POST PRODUCTION
 */

router.post(
  "/:id/post",
  requirePermission("erp.production.post"),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        message:
          "Authentication required",
      });
    }

    try {
      const batchId = getRouteParam(
        req.params.id,
        "Production batch id",
      );

      const postedBatch =
        await runSerializableTransaction(
          async (tx) => {
            const batch =
              await tx.productionBatch.findUnique({
                where: {
                  id: batchId,
                },
              });

            if (!batch) {
              throw new Error(
                "Production batch not found",
              );
            }

            if (
              batch.status !== "DRAFT"
            ) {
              throw new Error(
                "Only draft production batches can be posted",
              );
            }

            const product =
              await loadProductForPlanning(
                tx,
                batch.productId,
              );

            if (!product) {
              throw new Error(
                "This product is no longer active in the official website catalogue.",
              );
            }

            const size =
              resolveProductSize(
                product,
                batch.productSizeId,
              );

            const producedQty = Number(
              batch.producedQty,
            );

            const rejectedQty = Number(
              batch.rejectedQty,
            );

            if (producedQty <= 0) {
              throw new Error(
                "Good produced quantity must be greater than zero.",
              );
            }

            const plan =
              await buildProductionPlan(
                product,
                size?.id ?? null,
                producedQty,
                rejectedQty,
                batch.productionDate,
              );

            if (!plan.canPost) {
              const shortages =
                plan.requirements
                  .filter(
                    (item) =>
                      !item.isAvailable,
                  )
                  .map(
                    (item) =>
                      `${item.ingredientDisplayName}: shortage ${item.shortageBaseQty} ${item.baseUnit}`,
                  )
                  .join("; ");

              throw new Error(
                `Not enough raw material stock. ${shortages}`,
              );
            }

            for (
              const allocation of
              plan.allocations
            ) {
              const updated =
                await tx.ingredientStockLot.updateMany({
                  where: {
                    id: allocation.stockLotId,
                    remainingBaseQty: {
                      gte: allocation.consumedBaseQty,
                    },
                  },
                  data: {
                    remainingBaseQty: {
                      decrement:
                        allocation.consumedBaseQty,
                    },
                  },
                });

              if (updated.count !== 1) {
                throw new Error(
                  "Raw material stock changed while posting production. Please retry.",
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
                    allocation.costAmount,
                },
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
                  refId: batch.id,
                  qtyDelta:
                    -allocation.consumedBaseQty,
                  unitCostBase:
                    allocation.unitCostBase,
                  costAmount:
                    allocation.costAmount,
                  note:
                    `Consumed by ${batch.batchNo}`,
                },
              });
            }

            for (
              const expense of
              plan.expenses
            ) {
              await tx.productionExpense.create({
                data: {
                  productionBatchId:
                    batch.id,
                  recipeExpenseId:
                    expense.recipeExpenseId,
                  name: expense.name,
                  category:
                    expense.category,
                  calculationMethod:
                    expense.calculationMethod,
                  quantity:
                    expense.quantity,
                  rate: expense.rate,
                  totalAmount:
                    expense.totalAmount,
                },
              });
            }

            const finishedGoodsLot =
              await tx.finishedGoodsLot.create({
                data: {
                  productionBatchId:
                    batch.id,
                  productId:
                    batch.productId,
                  productSizeId:
                    size?.id ?? null,
                  producedQty,
                  remainingQty:
                    producedQty,
                  unitCost:
                    plan.unitCost,
                  producedAt:
                    batch.productionDate,
                  expiryDate:
                    batch.expiryDate,
                },
              });

            await tx.finishedGoodsMovement.create({
              data: {
                productId:
                  batch.productId,
                productSizeId:
                  size?.id ?? null,
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
                unitCost:
                  plan.unitCost,
                costAmount:
                  plan.totalProductionCost,
                note:
                  `Produced by ${batch.batchNo}`,
                occurredAt:
                  batch.productionDate,
              },
            });

            const updatedBatch =
              await tx.productionBatch.update({
                where: {
                  id: batch.id,
                },
                data: {
                  status: "POSTED",
                  ingredientCostTotal:
                    plan.ingredientCostTotal,
                  expenseCostTotal:
                    plan.expenseCostTotal,
                  totalProductionCost:
                    plan.totalProductionCost,
                  unitCost:
                    plan.unitCost,
                  postedById:
                    req.user!.id,
                  postedAt:
                    new Date(),
                },
                include: {
                  product: true,
                  productSize: true,
                  finishedGoodsLot: true,
                },
              });

            await tx.auditLog.create({
              data: {
                userId:
                  req.user!.id,
                action: "POST",
                entityType:
                  "ProductionBatch",
                entityId:
                  batch.id,
                afterJson: {
                  batchNo:
                    batch.batchNo,
                  productId:
                    batch.productId,
                  productSizeId:
                    batch.productSizeId,
                  officialSiteProductId:
                    product.officialSiteProductId,
                  attemptedQty:
                    plan.attemptedQty,
                  producedQty,
                  rejectedQty,
                  ingredientCostTotal:
                    plan.ingredientCostTotal,
                  expenseCostTotal:
                    plan.expenseCostTotal,
                  totalProductionCost:
                    plan.totalProductionCost,
                  unitCost:
                    plan.unitCost,
                  finishedGoodsLotId:
                    finishedGoodsLot.id,
                },
              },
            });

            return updatedBatch;
          },
        );

      return res.json({
        message:
          "Production posted and bakery stock updated",
        batch: {
          ...postedBatch,
          officialSiteProductId:
            postedBatch.product
              .officialSiteProductId,
          productDisplayName:
            getProductDisplayName(
              postedBatch.product,
            ),
          productSizeLabel:
            postedBatch.productSize
              ?.label ?? null,
          productImageUrl:
            postedBatch.product.imageUrl,
        },
      });
    } catch (error) {
      return res.status(400).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to post production",
      });
    }
  },
);

/*
 * DELETE PRODUCTION DRAFT
 */

router.delete(
  "/:id",
  requirePermission("erp.production.delete"),
  async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        message:
          "Authentication required",
      });
    }

    try {
      const batchId = getRouteParam(
        req.params.id,
        "Production batch id",
      );

      const batch =
        await prisma.productionBatch.findUnique({
          where: {
            id: batchId,
          },
        });

      if (!batch) {
        return res.status(404).json({
          message:
            "Production batch not found",
        });
      }

      if (batch.status !== "DRAFT") {
        return res.status(400).json({
          message:
            "Only draft production batches can be deleted",
        });
      }

      await runSerializableTransaction(
        async (tx) => {
          const deleted =
            await tx.productionBatch.deleteMany({
              where: {
                id: batch.id,
                status: "DRAFT",
              },
            });

          if (deleted.count !== 1) {
            throw new Error(
              "Production batch changed before deletion.",
            );
          }

          await tx.auditLog.create({
            data: {
              userId: req.user!.id,
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
                productSizeId:
                  batch.productSizeId,
                plannedQty:
                  String(
                    batch.plannedQty,
                  ),
                producedQty:
                  String(
                    batch.producedQty,
                  ),
                rejectedQty:
                  String(
                    batch.rejectedQty,
                  ),
                status:
                  batch.status,
              },
            },
          });
        },
      );

      return res.json({
        message:
          "Production draft deleted",
      });
    } catch (error) {
      return res.status(400).json({
        message:
          error instanceof Error
            ? error.message
            : "Failed to delete production draft",
      });
    }
  },
);

export default router;
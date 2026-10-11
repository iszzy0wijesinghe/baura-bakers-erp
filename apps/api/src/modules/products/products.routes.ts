import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { getRouteParam } from "../../lib/http";
import { prisma } from "../../lib/prisma";
import { authMiddleware } from "../../middleware/auth.middleware";
import { syncOfficialSiteProducts } from "./productSync.service";

const router = Router();

router.use(authMiddleware);

const optionalImageUrl = z.preprocess(
  (value) => {
    if (value === "" || value === undefined || value === null) {
      return null;
    }

    return value;
  },
  z.string().url().max(1200).nullable()
);

const recipeItemSchema = z.object({
  ingredientId: z.string().uuid(),
  productSizeId: z.string().uuid().nullable().optional(),
  requiredBaseQty: z.coerce.number().positive(),
  baseUnit: z.enum(["G", "ML", "UNIT"]),
  imageUrl: optionalImageUrl
});

const costPreviewQuerySchema = z.object({
  productSizeId: z.string().uuid().optional(),
  productionQty: z.coerce.number().int().positive().max(100000).default(1)
});

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function getIngredientDisplayName(ingredient: {
  brand: string | null;
  name: string;
  packageQty: Prisma.Decimal;
  packageUnit: string;
}) {
  const brand = ingredient.brand ? `${ingredient.brand} ` : "";

  return `${brand}${ingredient.name} ${ingredient.packageQty}${ingredient.packageUnit.toLowerCase()}`;
}

function getProductDisplayName(product: {
  name: string;
  variantName: string | null;
}) {
  return product.variantName
    ? `${product.name} - ${product.variantName}`
    : product.name;
}

function mapProductSize(size: {
  id: string;
  productId: string;
  officialSiteSizeId: number;
  label: string;
  serves: string | null;
  price: Prisma.Decimal;
  sortOrder: number;
  isActive: boolean;
  officialSiteUpdatedAt: Date | null;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...size,
    name: size.label,
    price: Number(size.price)
  };
}

function mapProduct(
  product: {
    id: string;
    officialSiteProductId: number | null;
    officialSiteSyncedAt: Date | null;
    name: string;
    variantName: string | null;
    imageUrl: string | null;
    sellPrice: Prisma.Decimal;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  sizes: Awaited<ReturnType<typeof getProductSizes>> = [],
  recipeItemCount = 0
) {
  const mappedSizes = sizes.map(mapProductSize);
  const activeSizes = mappedSizes.filter((size) => size.isActive);

  return {
    ...product,
    displayName: getProductDisplayName(product),
    sellPrice: Number(product.sellPrice),
    isOfficialSiteProduct: product.officialSiteProductId !== null,
    sizes: mappedSizes,
    activeSizes,
    hasMultipleSizes: activeSizes.length > 1,
    recipeItemCount
  };
}

function mapRecipeItem(
  item: Awaited<ReturnType<typeof getRecipeItems>>[number]
) {
  return {
    id: item.id,
    productId: item.productId,
    productSizeId: item.productSizeId,
    ingredientId: item.ingredientId,
    imageUrl: item.imageUrl,
    ingredientImageUrl: item.ingredient.imageUrl,
    displayImageUrl: item.imageUrl || item.ingredient.imageUrl || null,
    ingredientDisplayName: getIngredientDisplayName(item.ingredient),
    requiredBaseQty: Number(item.requiredBaseQty),
    baseUnit: item.baseUnit,
    ingredient: {
      id: item.ingredient.id,
      brand: item.ingredient.brand,
      name: item.ingredient.name,
      imageUrl: item.ingredient.imageUrl,
      packageQty: Number(item.ingredient.packageQty),
      packageUnit: item.ingredient.packageUnit,
      baseQty: Number(item.ingredient.baseQty),
      baseUnit: item.ingredient.baseUnit
    },
    createdAt: item.createdAt
  };
}

function isUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function findOfficialProduct(productId: string) {
  return prisma.product.findFirst({
    where: {
      id: productId,
      officialSiteProductId: {
        not: null
      }
    }
  });
}

async function getProductSizes(productId: string) {
  return prisma.productSize.findMany({
    where: {
      productId
    },
    orderBy: [
      { isActive: "desc" },
      { sortOrder: "asc" },
      { label: "asc" }
    ]
  });
}

async function getRecipeItems(productId: string) {
  return prisma.productRecipeItem.findMany({
    where: {
      productId
    },
    include: {
      ingredient: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

async function validateSize(
  productId: string,
  productSizeId: string | null | undefined
) {
  if (!productSizeId) {
    return true;
  }

  const size = await prisma.productSize.findFirst({
    where: {
      id: productSizeId,
      productId,
      isActive: true
    },
    select: {
      id: true
    }
  });

  return Boolean(size);
}

async function ingredientExistsInRecipe(
  productId: string,
  ingredientId: string,
  productSizeId: string | null,
  excludeItemId?: string
) {
  const existing = await prisma.productRecipeItem.findFirst({
    where: {
      productId,
      ingredientId,
      productSizeId,
      ...(excludeItemId
        ? {
            id: {
              not: excludeItemId
            }
          }
        : {})
    },
    select: {
      id: true
    }
  });

  return Boolean(existing);
}

router.post("/sync-official-site", async (_req, res) => {
  try {
    const sync = await syncOfficialSiteProducts();

    return res.json({
      message: "Official Baura product catalogue synchronized successfully.",
      sync
    });
  } catch (error) {
    console.error("Official product synchronization failed:", error);

    return res.status(502).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to synchronize official products"
    });
  }
});

router.get("/", async (_req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        officialSiteProductId: {
          not: null
        }
      },
      orderBy: [
        { isActive: "desc" },
        { name: "asc" },
        { variantName: "asc" }
      ]
    });

    if (products.length === 0) {
      return res.json({
        products: []
      });
    }

    const productIds = products.map((product) => product.id);

    const [sizes, recipeCounts] = await Promise.all([
      prisma.productSize.findMany({
        where: {
          productId: {
            in: productIds
          }
        },
        orderBy: [
          { isActive: "desc" },
          { sortOrder: "asc" },
          { label: "asc" }
        ]
      }),
      prisma.productRecipeItem.groupBy({
        by: ["productId"],
        where: {
          productId: {
            in: productIds
          }
        },
        _count: {
          _all: true
        }
      })
    ]);

    const sizesByProduct = new Map<
      string,
      typeof sizes
    >();

    const recipeCountByProduct = new Map<string, number>();

    for (const size of sizes) {
      const existing = sizesByProduct.get(size.productId) ?? [];

      existing.push(size);

      sizesByProduct.set(size.productId, existing);
    }

    for (const count of recipeCounts) {
      recipeCountByProduct.set(
        count.productId,
        count._count._all
      );
    }

    return res.json({
      products: products.map((product) =>
        mapProduct(
          product,
          sizesByProduct.get(product.id) ?? [],
          recipeCountByProduct.get(product.id) ?? 0
        )
      )
    });
  } catch (error) {
    console.error("Failed to load products:", error);

    return res.status(500).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to load products"
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = getRouteParam(req.params.id, "Product id");

    const product = await findOfficialProduct(id);

    if (!product) {
      return res.status(404).json({
        message: "Official product not found"
      });
    }

    const [sizes, recipeItems] = await Promise.all([
      getProductSizes(product.id),
      getRecipeItems(product.id)
    ]);

    return res.json({
      product: {
        ...mapProduct(product, sizes, recipeItems.length),
        recipeItems: recipeItems.map(mapRecipeItem)
      }
    });
  } catch (error) {
    console.error("Failed to load product:", error);

    return res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to load product"
    });
  }
});

router.get("/:id/recipe", async (req, res) => {
  try {
    const productId = getRouteParam(req.params.id, "Product id");

    const product = await findOfficialProduct(productId);

    if (!product) {
      return res.status(404).json({
        message: "Official product not found"
      });
    }

    const requestedSizeId =
      typeof req.query.productSizeId === "string"
        ? req.query.productSizeId
        : null;

    if (
      requestedSizeId &&
      !(await validateSize(product.id, requestedSizeId))
    ) {
      return res.status(400).json({
        message: "Invalid product size"
      });
    }

    const recipeItems = await prisma.productRecipeItem.findMany({
      where: {
        productId: product.id,
        productSizeId: requestedSizeId
      },
      include: {
        ingredient: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return res.json({
      productId: product.id,
      productSizeId: requestedSizeId,
      recipeItems: recipeItems.map(mapRecipeItem)
    });
  } catch (error) {
    console.error("Failed to load recipe:", error);

    return res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to load recipe"
    });
  }
});

router.post("/:id/recipe-items", async (req, res) => {
  const parsed = recipeItemSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid recipe item data",
      errors: parsed.error.flatten()
    });
  }

  try {
    const productId = getRouteParam(req.params.id, "Product id");

    const product = await findOfficialProduct(productId);

    if (!product) {
      return res.status(404).json({
        message: "Official product not found"
      });
    }

    if (!product.isActive) {
      return res.status(409).json({
        message: "Cannot modify an inactive official product"
      });
    }

    const data = parsed.data;
    const productSizeId = data.productSizeId ?? null;

    if (!(await validateSize(product.id, productSizeId))) {
      return res.status(400).json({
        message: "Invalid product size"
      });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: {
        id: data.ingredientId
      }
    });

    if (!ingredient || !ingredient.isActive) {
      return res.status(404).json({
        message: "Active ingredient not found"
      });
    }

    if (ingredient.baseUnit !== data.baseUnit) {
      return res.status(400).json({
        message: `Unit mismatch. Ingredient uses ${ingredient.baseUnit}.`
      });
    }

    const duplicate = await ingredientExistsInRecipe(
      product.id,
      ingredient.id,
      productSizeId
    );

    if (duplicate) {
      return res.status(409).json({
        message: "This ingredient already exists in the selected recipe"
      });
    }

    const recipeItem = await prisma.productRecipeItem.create({
      data: {
        productId: product.id,
        productSizeId,
        ingredientId: ingredient.id,
        imageUrl: data.imageUrl,
        requiredBaseQty: data.requiredBaseQty,
        baseUnit: data.baseUnit
      },
      include: {
        ingredient: true
      }
    });

    return res.status(201).json({
      recipeItem: mapRecipeItem(recipeItem)
    });
  } catch (error) {
    if (isUniqueError(error)) {
      return res.status(409).json({
        message: "This ingredient already exists in the selected recipe"
      });
    }

    console.error("Failed to add recipe item:", error);

    return res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to add recipe item"
    });
  }
});

router.put("/:id/recipe-items/:recipeItemId", async (req, res) => {
  const parsed = recipeItemSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid recipe item data",
      errors: parsed.error.flatten()
    });
  }

  try {
    const productId = getRouteParam(req.params.id, "Product id");
    const recipeItemId = getRouteParam(
      req.params.recipeItemId,
      "Recipe item id"
    );

    const product = await findOfficialProduct(productId);

    if (!product) {
      return res.status(404).json({
        message: "Official product not found"
      });
    }

    if (!product.isActive) {
      return res.status(409).json({
        message: "Cannot modify an inactive official product"
      });
    }

    const existing = await prisma.productRecipeItem.findFirst({
      where: {
        id: recipeItemId,
        productId: product.id
      }
    });

    if (!existing) {
      return res.status(404).json({
        message: "Recipe item not found"
      });
    }

    const data = parsed.data;
    const productSizeId = data.productSizeId ?? existing.productSizeId;

    if (!(await validateSize(product.id, productSizeId))) {
      return res.status(400).json({
        message: "Invalid product size"
      });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: {
        id: data.ingredientId
      }
    });

    if (!ingredient || !ingredient.isActive) {
      return res.status(404).json({
        message: "Active ingredient not found"
      });
    }

    if (ingredient.baseUnit !== data.baseUnit) {
      return res.status(400).json({
        message: `Unit mismatch. Ingredient uses ${ingredient.baseUnit}.`
      });
    }

    const duplicate = await ingredientExistsInRecipe(
      product.id,
      ingredient.id,
      productSizeId,
      existing.id
    );

    if (duplicate) {
      return res.status(409).json({
        message: "This ingredient already exists in the selected recipe"
      });
    }

    const recipeItem = await prisma.productRecipeItem.update({
      where: {
        id: existing.id
      },
      data: {
        productSizeId,
        ingredientId: ingredient.id,
        imageUrl: data.imageUrl,
        requiredBaseQty: data.requiredBaseQty,
        baseUnit: data.baseUnit
      },
      include: {
        ingredient: true
      }
    });

    return res.json({
      recipeItem: mapRecipeItem(recipeItem)
    });
  } catch (error) {
    if (isUniqueError(error)) {
      return res.status(409).json({
        message: "This ingredient already exists in the selected recipe"
      });
    }

    console.error("Failed to update recipe item:", error);

    return res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to update recipe item"
    });
  }
});

router.delete("/:id/recipe-items/:recipeItemId", async (req, res) => {
  try {
    const productId = getRouteParam(req.params.id, "Product id");
    const recipeItemId = getRouteParam(
      req.params.recipeItemId,
      "Recipe item id"
    );

    const product = await findOfficialProduct(productId);

    if (!product) {
      return res.status(404).json({
        message: "Official product not found"
      });
    }

    if (!product.isActive) {
      return res.status(409).json({
        message: "Cannot modify an inactive official product"
      });
    }

    const deleted = await prisma.productRecipeItem.deleteMany({
      where: {
        id: recipeItemId,
        productId: product.id
      }
    });

    if (deleted.count === 0) {
      return res.status(404).json({
        message: "Recipe item not found"
      });
    }

    return res.json({
      message: "Recipe item removed"
    });
  } catch (error) {
    console.error("Failed to remove recipe item:", error);

    return res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to remove recipe item"
    });
  }
});

router.get("/:id/cost-preview", async (req, res) => {
  const parsed = costPreviewQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid cost preview query",
      errors: parsed.error.flatten()
    });
  }

  try {
    const productId = getRouteParam(req.params.id, "Product id");
    const { productSizeId, productionQty } = parsed.data;
    const now = new Date();

    const product = await findOfficialProduct(productId);

    if (!product) {
      return res.status(404).json({
        message: "Official product not found"
      });
    }

    const sizes = await getProductSizes(product.id);

    const selectedSize = productSizeId
      ? sizes.find(
          (size) => size.id === productSizeId && size.isActive
        )
      : null;

    if (productSizeId && !selectedSize) {
      return res.status(404).json({
        message: "Active product size not found"
      });
    }

    const [recipeItems, expenses] = await Promise.all([
      prisma.productRecipeItem.findMany({
        where: {
          productId: product.id,
          productSizeId: productSizeId ?? null
        },
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
      }),
      prisma.productRecipeExpense.findMany({
        where: {
          productId: product.id,
          isActive: true,
          OR: [
            { productSizeId: null },
            ...(productSizeId ? [{ productSizeId }] : [])
          ]
        },
        orderBy: {
          createdAt: "asc"
        }
      })
    ]);

    let ingredientCostTotal = 0;

    const lines = recipeItems.map((item) => {
      const requiredPerUnit = Number(item.requiredBaseQty);
      const requiredQty = requiredPerUnit * productionQty;

      let remainingNeed = requiredQty;
      let ingredientCost = 0;

      const eligibleLots = item.ingredient.stockLots
        .filter(
          (lot) =>
            !lot.expiryDate ||
            lot.expiryDate.getTime() >= now.getTime()
        )
        .sort((first, second) => {
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

          return first.receivedAt.getTime() - second.receivedAt.getTime();
        });

      for (const lot of eligibleLots) {
        if (remainingNeed <= 0) {
          break;
        }

        const availableQty = Number(lot.remainingBaseQty);
        const takeQty = Math.min(remainingNeed, availableQty);

        ingredientCost += takeQty * Number(lot.unitCostBase);
        remainingNeed -= takeQty;
      }

      ingredientCostTotal += ingredientCost;

      return {
        recipeItemId: item.id,
        ingredientId: item.ingredientId,
        ingredientDisplayName: getIngredientDisplayName(item.ingredient),
        requiredBaseQty: requiredPerUnit,
        totalRequiredBaseQty: requiredQty,
        baseUnit: item.baseUnit,
        estimatedCost: roundMoney(ingredientCost),
        availableBaseQty: Number(
          (requiredQty - Math.max(remainingNeed, 0)).toFixed(3)
        ),
        shortageBaseQty: Number(
          Math.max(remainingNeed, 0).toFixed(3)
        ),
        isAvailable: remainingNeed <= 0
      };
    });

    let expenseCostTotal = 0;

    const expenseLines = expenses.map((expense) => {
      const quantity = Number(expense.quantity);
      const rate = Number(expense.rate);

      let totalAmount = rate;

      if (expense.calculationMethod === "PER_UNIT") {
        totalAmount = rate * productionQty;
      } else if (expense.calculationMethod === "QUANTITY_BASED") {
        totalAmount = quantity * rate;
      }

      totalAmount = roundMoney(totalAmount);
      expenseCostTotal += totalAmount;

      return {
        id: expense.id,
        name: expense.name,
        category: expense.category,
        calculationMethod: expense.calculationMethod,
        productSizeId: expense.productSizeId,
        quantity,
        rate,
        totalAmount,
        unitAmount: roundMoney(totalAmount / productionQty)
      };
    });

    const sellPrice = selectedSize
      ? Number(selectedSize.price)
      : Number(product.sellPrice);

    const roundedIngredientCost = roundMoney(ingredientCostTotal);
    const roundedExpenseCost = roundMoney(expenseCostTotal);
    const totalProductionCost = roundMoney(
      roundedIngredientCost + roundedExpenseCost
    );

    const unitCost = roundMoney(totalProductionCost / productionQty);
    const estimatedProfit = roundMoney(sellPrice - unitCost);

    return res.json({
      costPreview: {
        productId: product.id,
        productSizeId: selectedSize?.id ?? null,
        sizeLabel: selectedSize?.label ?? null,
        productionQty,
        sellPrice,
        ingredientCostTotal: roundedIngredientCost,
        expenseCostTotal: roundedExpenseCost,
        totalProductionCost,
        unitCost,
        currentCost: unitCost,
        estimatedProfit,
        profitMarginPercent:
          sellPrice > 0
            ? roundMoney((estimatedProfit / sellPrice) * 100)
            : 0,
        canProduce:
          recipeItems.length > 0 &&
          lines.every((line) => line.isAvailable),
        lines,
        expenseLines
      }
    });
  } catch (error) {
    console.error("Failed to calculate cost preview:", error);

    return res.status(400).json({
      message:
        error instanceof Error
          ? error.message
          : "Failed to calculate cost preview"
    });
  }
});

export default router;
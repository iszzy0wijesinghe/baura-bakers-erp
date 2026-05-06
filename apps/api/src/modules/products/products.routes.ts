import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  variantName: z.string().trim().optional().nullable(),
  sellPrice: z.coerce.number().min(0, "Sell price cannot be negative")
});

const recipeItemSchema = z.object({
  ingredientId: z.string().uuid("Valid ingredient is required"),
  requiredBaseQty: z.coerce
    .number()
    .positive("Required quantity must be positive"),
  baseUnit: z.enum(["G", "ML", "UNIT"])
});

function getIngredientDisplayName(ingredient: {
  brand: string | null;
  name: string;
  packageQty: unknown;
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

function mapProduct(product: {
  id: string;
  name: string;
  variantName: string | null;
  sellPrice: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count?: { recipeItems: number };
}) {
  return {
    id: product.id,
    name: product.name,
    variantName: product.variantName,
    displayName: getProductDisplayName(product),
    sellPrice: product.sellPrice,
    isActive: product.isActive,
    recipeItemCount: product._count?.recipeItems || 0,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function mapRecipeItem(recipeItem: {
  id: string;
  productId: string;
  ingredientId: string;
  requiredBaseQty: unknown;
  baseUnit: string;
  createdAt: Date;
  ingredient: {
    brand: string | null;
    name: string;
    packageQty: unknown;
    packageUnit: string;
    baseQty: unknown;
    baseUnit: string;
  };
}) {
  return {
    id: recipeItem.id,
    productId: recipeItem.productId,
    ingredientId: recipeItem.ingredientId,
    ingredientDisplayName: getIngredientDisplayName(recipeItem.ingredient),
    requiredBaseQty: recipeItem.requiredBaseQty,
    baseUnit: recipeItem.baseUnit,
    ingredient: {
      brand: recipeItem.ingredient.brand,
      name: recipeItem.ingredient.name,
      packageQty: recipeItem.ingredient.packageQty,
      packageUnit: recipeItem.ingredient.packageUnit,
      baseQty: recipeItem.ingredient.baseQty,
      baseUnit: recipeItem.ingredient.baseUnit
    },
    createdAt: recipeItem.createdAt
  };
}

function isPrismaNotFoundError(err: unknown) {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025"
  );
}

async function findDuplicateProduct(
  name: string,
  variantName: string | null,
  excludeId?: string
) {
  return prisma.product.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive"
      },
      variantName: variantName
        ? {
            equals: variantName,
            mode: "insensitive"
          }
        : null,
      ...(excludeId ? { id: { not: excludeId } } : {})
    }
  });
}

router.get("/", async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { recipeItems: true }
      }
    }
  });

  return res.json({
    products: products.map(mapProduct)
  });
});

router.post("/", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid product data",
      errors: parsed.error.flatten()
    });
  }

  const name = parsed.data.name;
  const variantName = parsed.data.variantName?.trim() || null;

  const duplicate = await findDuplicateProduct(name, variantName);

  if (duplicate) {
    return res.status(409).json({
      message: "Product already exists"
    });
  }

  const product = await prisma.product.create({
    data: {
      name,
      variantName,
      sellPrice: parsed.data.sellPrice
    },
    include: {
      _count: {
        select: { recipeItems: true }
      }
    }
  });

  return res.status(201).json({
    product: mapProduct(product)
  });
});

router.get("/:id", async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: {
      _count: {
        select: { recipeItems: true }
      },
      recipeItems: {
        include: {
          ingredient: true
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  return res.json({
    product: {
      ...mapProduct(product),
      recipeItems: product.recipeItems.map(mapRecipeItem)
    }
  });
});

router.put("/:id", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid product data",
      errors: parsed.error.flatten()
    });
  }

  const name = parsed.data.name;
  const variantName = parsed.data.variantName?.trim() || null;

  const duplicate = await findDuplicateProduct(name, variantName, req.params.id);

  if (duplicate) {
    return res.status(409).json({
      message: "Product already exists"
    });
  }

  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        name,
        variantName,
        sellPrice: parsed.data.sellPrice
      },
      include: {
        _count: {
          select: { recipeItems: true }
        }
      }
    });

    return res.json({
      product: mapProduct(product)
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      return res.status(404).json({ message: "Product not found" });
    }

    throw err;
  }
});

router.patch("/:id/activate", async (req, res) => {
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: true },
      include: {
        _count: {
          select: { recipeItems: true }
        }
      }
    });

    return res.json({
      product: mapProduct(product)
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      return res.status(404).json({ message: "Product not found" });
    }

    throw err;
  }
});

router.patch("/:id/deactivate", async (req, res) => {
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false },
      include: {
        _count: {
          select: { recipeItems: true }
        }
      }
    });

    return res.json({
      product: mapProduct(product)
    });
  } catch (err) {
    if (isPrismaNotFoundError(err)) {
      return res.status(404).json({ message: "Product not found" });
    }

    throw err;
  }
});

router.get("/:id/recipe", async (req, res) => {
  const recipeItems = await prisma.productRecipeItem.findMany({
    where: { productId: req.params.id },
    include: { ingredient: true },
    orderBy: { createdAt: "desc" }
  });

  return res.json({
    recipeItems: recipeItems.map(mapRecipeItem)
  });
});

router.post("/:id/recipe-items", async (req, res) => {
  const parsed = recipeItemSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid recipe item data",
      errors: parsed.error.flatten()
    });
  }

  const product = await prisma.product.findUnique({
    where: { id: req.params.id }
  });

  if (!product) {
    return res.status(404).json({ message: "Product not found" });
  }

  const ingredient = await prisma.ingredient.findUnique({
    where: { id: parsed.data.ingredientId }
  });

  if (!ingredient || !ingredient.isActive) {
    return res.status(404).json({ message: "Active ingredient not found" });
  }

  if (ingredient.baseUnit !== parsed.data.baseUnit) {
    return res.status(400).json({
      message: `Unit mismatch. This ingredient uses ${ingredient.baseUnit}.`
    });
  }

  try {
    const recipeItem = await prisma.productRecipeItem.create({
      data: {
        productId: product.id,
        ingredientId: ingredient.id,
        requiredBaseQty: parsed.data.requiredBaseQty,
        baseUnit: parsed.data.baseUnit
      },
      include: { ingredient: true }
    });

    return res.status(201).json({
      recipeItem: mapRecipeItem(recipeItem)
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return res.status(409).json({
        message: "This ingredient is already added to the recipe"
      });
    }

    throw err;
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

  const ingredient = await prisma.ingredient.findUnique({
    where: { id: parsed.data.ingredientId }
  });

  if (!ingredient || !ingredient.isActive) {
    return res.status(404).json({ message: "Active ingredient not found" });
  }

  if (ingredient.baseUnit !== parsed.data.baseUnit) {
    return res.status(400).json({
      message: `Unit mismatch. This ingredient uses ${ingredient.baseUnit}.`
    });
  }

  const existingRecipeItem = await prisma.productRecipeItem.findFirst({
    where: {
      id: req.params.recipeItemId,
      productId: req.params.id
    }
  });

  if (!existingRecipeItem) {
    return res.status(404).json({ message: "Recipe item not found" });
  }

  try {
    const recipeItem = await prisma.productRecipeItem.update({
      where: { id: existingRecipeItem.id },
      data: {
        ingredientId: ingredient.id,
        requiredBaseQty: parsed.data.requiredBaseQty,
        baseUnit: parsed.data.baseUnit
      },
      include: { ingredient: true }
    });

    return res.json({
      recipeItem: mapRecipeItem(recipeItem)
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return res.status(409).json({
        message: "This ingredient is already added to the recipe"
      });
    }

    throw err;
  }
});

router.delete("/:id/recipe-items/:recipeItemId", async (req, res) => {
  const deleted = await prisma.productRecipeItem.deleteMany({
    where: {
      id: req.params.recipeItemId,
      productId: req.params.id
    }
  });

  if (deleted.count === 0) {
    return res.status(404).json({ message: "Recipe item not found" });
  }

  return res.json({
    message: "Recipe item removed"
  });
});

router.get("/:id/cost-preview", async (req, res) => {
  const productWithRecipe = await prisma.product.findUnique({
    where: { id: req.params.id },
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
                },
                orderBy: {
                  receivedAt: "asc"
                }
              }
            }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!productWithRecipe) {
    return res.status(404).json({ message: "Product not found" });
  }

  let currentCost = 0;

  const lines = productWithRecipe.recipeItems.map((recipeItem) => {
    const requiredQty = Number(recipeItem.requiredBaseQty);
    let remainingNeed = requiredQty;
    let ingredientCost = 0;

    const allocations: Array<{
      stockLotId: string;
      takeQty: number;
      unitCostBase: number;
      costAmount: number;
      receivedAt: Date;
    }> = [];

    for (const lot of recipeItem.ingredient.stockLots) {
      if (remainingNeed <= 0) break;

      const availableQty = Number(lot.remainingBaseQty);
      const takeQty = Math.min(remainingNeed, availableQty);
      const unitCostBase = Number(lot.unitCostBase);
      const costAmount = takeQty * unitCostBase;

      remainingNeed -= takeQty;
      ingredientCost += costAmount;

      allocations.push({
        stockLotId: lot.id,
        takeQty,
        unitCostBase,
        costAmount,
        receivedAt: lot.receivedAt
      });
    }

    currentCost += ingredientCost;

    return {
      recipeItemId: recipeItem.id,
      ingredientId: recipeItem.ingredientId,
      ingredientDisplayName: getIngredientDisplayName(recipeItem.ingredient),
      requiredBaseQty: requiredQty,
      baseUnit: recipeItem.baseUnit,
      estimatedCost: Number(ingredientCost.toFixed(2)),
      availableBaseQty: Number(
        (requiredQty - Math.max(remainingNeed, 0)).toFixed(3)
      ),
      shortageBaseQty: Number(Math.max(remainingNeed, 0).toFixed(3)),
      isAvailable: remainingNeed <= 0,
      allocations
    };
  });

  const sellPrice = Number(productWithRecipe.sellPrice);
  const roundedCurrentCost = Number(currentCost.toFixed(2));
  const estimatedProfit = Number((sellPrice - roundedCurrentCost).toFixed(2));

  return res.json({
    costPreview: {
      productId: productWithRecipe.id,
      sellPrice,
      currentCost: roundedCurrentCost,
      estimatedProfit,
      profitMarginPercent:
        sellPrice > 0
          ? Number(((estimatedProfit / sellPrice) * 100).toFixed(2))
          : 0,
      canProduce:
        productWithRecipe.recipeItems.length > 0 &&
        lines.every((line) => line.isAvailable),
      lines
    }
  });
});

export default router;
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
  z.string()
    .url("Image URL must be valid")
    .max(1200, "Image URL is too long")
    .nullable()
);

const recipeItemSchema = z.object({
  ingredientId: z.string().uuid("Valid ingredient is required"),
  requiredBaseQty: z.coerce.number().positive("Required quantity must be positive"),
  baseUnit: z.enum(["G", "ML", "UNIT"]),
  imageUrl: optionalImageUrl
});

type ProductSizeRecord = {
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
};

type ProductRecord = {
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
};

type IngredientRecord = {
  id: string;
  brand: string | null;
  name: string;
  imageUrl: string | null;
  packageQty: Prisma.Decimal;
  packageUnit: string;
  baseQty: Prisma.Decimal;
  baseUnit: string;
};

type RecipeItemRecord = {
  id: string;
  productId: string;
  ingredientId: string;
  imageUrl: string | null;
  requiredBaseQty: Prisma.Decimal;
  baseUnit: string;
  createdAt: Date;
  ingredient: IngredientRecord;
};

type StockLotRecord = {
  id: string;
  remainingBaseQty: Prisma.Decimal;
  unitCostBase: Prisma.Decimal;
  receivedAt: Date;
  expiryDate: Date | null;
};

type CostRecipeItemRecord = RecipeItemRecord & {
  ingredient: IngredientRecord & {
    stockLots: StockLotRecord[];
  };
};

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

function mapProductSize(size: ProductSizeRecord) {
  return {
    id: size.id,
    productId: size.productId,
    officialSiteSizeId: size.officialSiteSizeId,
    name: size.label,
    label: size.label,
    serves: size.serves,
    price: Number(size.price),
    sortOrder: size.sortOrder,
    isActive: size.isActive,
    officialSiteUpdatedAt: size.officialSiteUpdatedAt,
    syncedAt: size.syncedAt,
    createdAt: size.createdAt,
    updatedAt: size.updatedAt
  };
}

function mapProduct(
  product: ProductRecord,
  sizes: ProductSizeRecord[] = [],
  recipeItemCount = 0
) {
  const mappedSizes = sizes.map(mapProductSize);
  const activeSizes = mappedSizes.filter((size) => size.isActive);

  return {
    id: product.id,
    officialSiteProductId: product.officialSiteProductId,
    officialSiteSyncedAt: product.officialSiteSyncedAt,
    isOfficialSiteProduct: product.officialSiteProductId !== null,
    name: product.name,
    variantName: product.variantName,
    imageUrl: product.imageUrl,
    displayName: getProductDisplayName(product),
    sellPrice: Number(product.sellPrice),
    isActive: product.isActive,
    sizes: mappedSizes,
    activeSizes,
    hasMultipleSizes: activeSizes.length > 1,
    recipeItemCount,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt
  };
}

function mapRecipeItem(recipeItem: RecipeItemRecord) {
  return {
    id: recipeItem.id,
    productId: recipeItem.productId,
    ingredientId: recipeItem.ingredientId,
    imageUrl: recipeItem.imageUrl,
    ingredientImageUrl: recipeItem.ingredient.imageUrl,
    displayImageUrl:
      recipeItem.imageUrl ||
      recipeItem.ingredient.imageUrl ||
      null,
    ingredientDisplayName: getIngredientDisplayName(recipeItem.ingredient),
    requiredBaseQty: Number(recipeItem.requiredBaseQty),
    baseUnit: recipeItem.baseUnit,
    ingredient: {
      brand: recipeItem.ingredient.brand,
      name: recipeItem.ingredient.name,
      imageUrl: recipeItem.ingredient.imageUrl,
      packageQty: Number(recipeItem.ingredient.packageQty),
      packageUnit: recipeItem.ingredient.packageUnit,
      baseQty: Number(recipeItem.ingredient.baseQty),
      baseUnit: recipeItem.ingredient.baseUnit
    },
    createdAt: recipeItem.createdAt
  };
}

function isPrismaUniqueError(error: unknown) {
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
    },
    select: {
      id: true,
      isActive: true
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
      createdAt: "desc"
    }
  });
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

    const sizesByProduct = new Map<string, ProductSizeRecord[]>();
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

    const product = await prisma.product.findFirst({
      where: {
        id,
        officialSiteProductId: {
          not: null
        }
      }
    });

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

    const recipeItems = await getRecipeItems(product.id);

    return res.json({
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
        message: "Cannot modify the recipe of an inactive official product"
      });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: {
        id: parsed.data.ingredientId
      }
    });

    if (!ingredient || !ingredient.isActive) {
      return res.status(404).json({
        message: "Active ingredient not found"
      });
    }

    if (ingredient.baseUnit !== parsed.data.baseUnit) {
      return res.status(400).json({
        message: `Unit mismatch. This ingredient uses ${ingredient.baseUnit}.`
      });
    }

    const recipeItem = await prisma.productRecipeItem.create({
      data: {
        productId: product.id,
        ingredientId: ingredient.id,
        imageUrl: parsed.data.imageUrl,
        requiredBaseQty: parsed.data.requiredBaseQty,
        baseUnit: parsed.data.baseUnit
      },
      include: {
        ingredient: true
      }
    });

    return res.status(201).json({
      recipeItem: mapRecipeItem(recipeItem)
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return res.status(409).json({
        message: "This ingredient is already added to the recipe"
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
        message: "Cannot modify the recipe of an inactive official product"
      });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: {
        id: parsed.data.ingredientId
      }
    });

    if (!ingredient || !ingredient.isActive) {
      return res.status(404).json({
        message: "Active ingredient not found"
      });
    }

    if (ingredient.baseUnit !== parsed.data.baseUnit) {
      return res.status(400).json({
        message: `Unit mismatch. This ingredient uses ${ingredient.baseUnit}.`
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

    const recipeItem = await prisma.productRecipeItem.update({
      where: {
        id: existing.id
      },
      data: {
        ingredientId: ingredient.id,
        imageUrl: parsed.data.imageUrl,
        requiredBaseQty: parsed.data.requiredBaseQty,
        baseUnit: parsed.data.baseUnit
      },
      include: {
        ingredient: true
      }
    });

    return res.json({
      recipeItem: mapRecipeItem(recipeItem)
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return res.status(409).json({
        message: "This ingredient is already added to the recipe"
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
        message: "Cannot modify the recipe of an inactive official product"
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
  try {
    const productId = getRouteParam(req.params.id, "Product id");
    const now = new Date();

    const requestedSizeId =
      typeof req.query.productSizeId === "string"
        ? req.query.productSizeId.trim()
        : null;

    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        officialSiteProductId: {
          not: null
        }
      }
    });

    if (!product) {
      return res.status(404).json({
        message: "Official product not found"
      });
    }

    const [sizes, recipeItems] = await Promise.all([
      getProductSizes(product.id),
      prisma.productRecipeItem.findMany({
        where: {
          productId: product.id
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
      })
    ]);

    const selectedSize = requestedSizeId
      ? sizes.find(
          (size) => size.id === requestedSizeId && size.isActive
        )
      : null;

    if (requestedSizeId && !selectedSize) {
      return res.status(404).json({
        message: "Active product size not found"
      });
    }

    let currentCost = 0;

    const lines = recipeItems.map((recipeItem: CostRecipeItemRecord) => {
      const requiredQty = Number(recipeItem.requiredBaseQty);
      let remainingNeed = requiredQty;
      let ingredientCost = 0;

      const eligibleLots = recipeItem.ingredient.stockLots
        .filter(
          (lot: StockLotRecord) =>
            !lot.expiryDate ||
            lot.expiryDate.getTime() >= now.getTime()
        )
        .sort((first: StockLotRecord, second: StockLotRecord) => {
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

      currentCost += ingredientCost;

      return {
        recipeItemId: recipeItem.id,
        ingredientId: recipeItem.ingredientId,
        ingredientDisplayName: getIngredientDisplayName(
          recipeItem.ingredient
        ),
        imageUrl: recipeItem.imageUrl,
        ingredientImageUrl: recipeItem.ingredient.imageUrl,
        displayImageUrl:
          recipeItem.imageUrl ||
          recipeItem.ingredient.imageUrl ||
          null,
        requiredBaseQty: requiredQty,
        baseUnit: recipeItem.baseUnit,
        estimatedCost: Number(ingredientCost.toFixed(2)),
        availableBaseQty: Number(
          (requiredQty - Math.max(remainingNeed, 0)).toFixed(3)
        ),
        shortageBaseQty: Number(
          Math.max(remainingNeed, 0).toFixed(3)
        ),
        isAvailable: remainingNeed <= 0
      };
    });

    const sellPrice = selectedSize
      ? Number(selectedSize.price)
      : Number(product.sellPrice);

    const roundedCurrentCost = Number(currentCost.toFixed(2));
    const estimatedProfit = Number(
      (sellPrice - roundedCurrentCost).toFixed(2)
    );

    return res.json({
      costPreview: {
        productId: product.id,
        productSizeId: selectedSize?.id ?? null,
        sizeLabel: selectedSize?.label ?? null,
        sellPrice,
        currentCost: roundedCurrentCost,
        estimatedProfit,
        profitMarginPercent:
          sellPrice > 0
            ? Number(
                ((estimatedProfit / sellPrice) * 100).toFixed(2)
              )
            : 0,
        canProduce:
          recipeItems.length > 0 &&
          lines.every((line) => line.isAvailable),
        lines
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
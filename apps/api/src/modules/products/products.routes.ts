import {
  Prisma,
} from "@prisma/client";
import {
  Router,
} from "express";
import {
  z,
} from "zod";

import {
  getRouteParam,
} from "../../lib/http";
import {
  prisma,
} from "../../lib/prisma";
import {
  authMiddleware,
} from "../../middleware/auth.middleware";
import {
  syncOfficialSiteProducts,
} from "./productSync.service";

const router =
  Router();

router.use(
  authMiddleware,
);

const optionalImageUrl =
  z.preprocess(
    (value) => {
      if (
        value === "" ||
        value === undefined
      ) {
        return null;
      }

      return value;
    },
    z
      .string()
      .url(
        "Image URL must be valid",
      )
      .max(
        1200,
        "Image URL is too long",
      )
      .nullable(),
  );

const recipeItemSchema =
  z.object({
    ingredientId:
      z
        .string()
        .uuid(
          "Valid ingredient is required",
        ),

    requiredBaseQty:
      z.coerce
        .number()
        .positive(
          "Required quantity must be positive",
        ),

    baseUnit:
      z.enum([
        "G",
        "ML",
        "UNIT",
      ]),

    imageUrl:
      optionalImageUrl,
  });

function getIngredientDisplayName(
  ingredient: {
    brand:
      | string
      | null;
    name: string;
    packageQty:
      unknown;
    packageUnit:
      string;
  },
) {
  const brand =
    ingredient.brand
      ? `${ingredient.brand} `
      : "";

  return `${brand}${ingredient.name} ${ingredient.packageQty}${ingredient.packageUnit.toLowerCase()}`;
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

function mapProduct(
  product: {
    id: string;

    officialSiteProductId:
      | number
      | null;

    officialSiteSyncedAt:
      | Date
      | null;

    name: string;

    variantName:
      | string
      | null;

    imageUrl:
      | string
      | null;

    sellPrice:
      unknown;

    isActive: boolean;

    createdAt:
      Date;

    updatedAt:
      Date;

    _count?: {
      recipeItems:
        number;
    };
  },
) {
  return {
    id:
      product.id,

    officialSiteProductId:
      product.officialSiteProductId,

    officialSiteSyncedAt:
      product.officialSiteSyncedAt,

    isOfficialSiteProduct:
      product.officialSiteProductId !==
      null,

    name:
      product.name,

    variantName:
      product.variantName,

    imageUrl:
      product.imageUrl,

    displayName:
      getProductDisplayName(
        product,
      ),

    sellPrice:
      product.sellPrice,

    isActive:
      product.isActive,

    recipeItemCount:
      product._count
        ?.recipeItems ??
      0,

    createdAt:
      product.createdAt,

    updatedAt:
      product.updatedAt,
  };
}

function mapRecipeItem(
  recipeItem: {
    id: string;

    productId:
      string;

    ingredientId:
      string;

    imageUrl:
      | string
      | null;

    requiredBaseQty:
      unknown;

    baseUnit:
      string;

    createdAt:
      Date;

    ingredient: {
      brand:
        | string
        | null;

      name:
        string;

      imageUrl:
        | string
        | null;

      packageQty:
        unknown;

      packageUnit:
        string;

      baseQty:
        unknown;

      baseUnit:
        string;
    };
  },
) {
  return {
    id:
      recipeItem.id,

    productId:
      recipeItem.productId,

    ingredientId:
      recipeItem.ingredientId,

    imageUrl:
      recipeItem.imageUrl,

    ingredientImageUrl:
      recipeItem.ingredient
        .imageUrl,

    displayImageUrl:
      recipeItem.imageUrl ||
      recipeItem.ingredient
        .imageUrl ||
      null,

    ingredientDisplayName:
      getIngredientDisplayName(
        recipeItem.ingredient,
      ),

    requiredBaseQty:
      recipeItem.requiredBaseQty,

    baseUnit:
      recipeItem.baseUnit,

    ingredient: {
      brand:
        recipeItem.ingredient
          .brand,

      name:
        recipeItem.ingredient
          .name,

      imageUrl:
        recipeItem.ingredient
          .imageUrl,

      packageQty:
        recipeItem.ingredient
          .packageQty,

      packageUnit:
        recipeItem.ingredient
          .packageUnit,

      baseQty:
        recipeItem.ingredient
          .baseQty,

      baseUnit:
        recipeItem.ingredient
          .baseUnit,
    },

    createdAt:
      recipeItem.createdAt,
  };
}

function isPrismaUniqueError(
  error: unknown,
) {
  return (
    error instanceof
      Prisma.PrismaClientKnownRequestError &&
    error.code ===
      "P2002"
  );
}

/* ======================================================
   OFFICIAL PRODUCT CATALOGUE

   Product master data is owned by the official Baura
   website.

   ERP is read-only for:
   - product name
   - variant / size
   - product image
   - selling price
   - active status

   ERP remains responsible for:
   - recipes
   - costing
   - production
   - stock
   - POS
====================================================== */

/*
 * Synchronize this BEFORE /:id routes because otherwise
 * Express can interpret "sync-official-site" as an id.
 */
router.post(
  "/sync-official-site",
  async (
    _req,
    res,
  ) => {
    try {
      const sync =
        await syncOfficialSiteProducts();

      return res.json({
        message:
          "Official Baura product catalogue synchronized successfully.",

        sync,
      });
    } catch (error) {
      console.error(
        "Official product synchronization failed:",
        error,
      );

      return res
        .status(502)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to synchronize official products",
        });
    }
  },
);

/*
 * ERP product listing.
 *
 * Only official-site products are returned.
 * Legacy ERP-created products are intentionally excluded.
 */
router.get(
  "/",
  async (
    _req,
    res,
  ) => {
    try {
      const products =
        await prisma.product.findMany({
          where: {
            officialSiteProductId: {
              not:
                null,
            },
          },

          orderBy: [
            {
              isActive:
                "desc",
            },
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
            _count: {
              select: {
                recipeItems:
                  true,
              },
            },
          },
        });

      return res.json({
        products:
          products.map(
            mapProduct,
          ),
      });
    } catch (error) {
      return res
        .status(500)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to load products",
        });
    }
  },
);

/*
 * ERP product detail.
 *
 * Only synchronized official products can be addressed
 * through the ERP product API.
 */
router.get(
  "/:id",
  async (
    req,
    res,
  ) => {
    try {
      const id =
        getRouteParam(
          req.params.id,
          "Product id",
        );

      const product =
        await prisma.product.findFirst({
          where: {
            id,

            officialSiteProductId: {
              not:
                null,
            },
          },

          include: {
            _count: {
              select: {
                recipeItems:
                  true,
              },
            },

            recipeItems: {
              include: {
                ingredient:
                  true,
              },

              orderBy: {
                createdAt:
                  "desc",
              },
            },
          },
        });

      if (
        !product
      ) {
        return res
          .status(404)
          .json({
            message:
              "Official product not found",
          });
      }

      return res.json({
        product: {
          ...mapProduct(
            product,
          ),

          recipeItems:
            product.recipeItems.map(
              mapRecipeItem,
            ),
        },
      });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to load product",
        });
    }
  },
);

/* ======================================================
   RECIPES

   Recipes belong to ERP.

   They can only be attached to products synchronized
   from the official website.
====================================================== */

router.get(
  "/:id/recipe",
  async (
    req,
    res,
  ) => {
    try {
      const productId =
        getRouteParam(
          req.params.id,
          "Product id",
        );

      const product =
        await prisma.product.findFirst({
          where: {
            id:
              productId,

            officialSiteProductId: {
              not:
                null,
            },
          },

          select: {
            id:
              true,
          },
        });

      if (
        !product
      ) {
        return res
          .status(404)
          .json({
            message:
              "Official product not found",
          });
      }

      const recipeItems =
        await prisma.productRecipeItem.findMany({
          where: {
            productId:
              product.id,
          },

          include: {
            ingredient:
              true,
          },

          orderBy: {
            createdAt:
              "desc",
          },
        });

      return res.json({
        recipeItems:
          recipeItems.map(
            mapRecipeItem,
          ),
      });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to load recipe",
        });
    }
  },
);

router.post(
  "/:id/recipe-items",
  async (
    req,
    res,
  ) => {
    const parsed =
      recipeItemSchema.safeParse(
        req.body,
      );

    if (
      !parsed.success
    ) {
      return res
        .status(400)
        .json({
          message:
            "Invalid recipe item data",

          errors:
            parsed.error.flatten(),
        });
    }

    try {
      const productId =
        getRouteParam(
          req.params.id,
          "Product id",
        );

      const product =
        await prisma.product.findFirst({
          where: {
            id:
              productId,

            officialSiteProductId: {
              not:
                null,
            },
          },

          select: {
            id:
              true,

            isActive:
              true,
          },
        });

      if (
        !product
      ) {
        return res
          .status(404)
          .json({
            message:
              "Official product not found",
          });
      }

      if (
        !product.isActive
      ) {
        return res
          .status(409)
          .json({
            message:
              "Cannot modify the recipe of an inactive official product",
          });
      }

      const ingredient =
        await prisma.ingredient.findUnique({
          where: {
            id:
              parsed.data.ingredientId,
          },
        });

      if (
        !ingredient ||
        !ingredient.isActive
      ) {
        return res
          .status(404)
          .json({
            message:
              "Active ingredient not found",
          });
      }

      if (
        ingredient.baseUnit !==
        parsed.data.baseUnit
      ) {
        return res
          .status(400)
          .json({
            message:
              `Unit mismatch. This ingredient uses ${ingredient.baseUnit}.`,
          });
      }

      const recipeItem =
        await prisma.productRecipeItem.create({
          data: {
            productId:
              product.id,

            ingredientId:
              ingredient.id,

            imageUrl:
              parsed.data.imageUrl ||
              null,

            requiredBaseQty:
              parsed.data.requiredBaseQty,

            baseUnit:
              parsed.data.baseUnit,
          },

          include: {
            ingredient:
              true,
          },
        });

      return res
        .status(201)
        .json({
          recipeItem:
            mapRecipeItem(
              recipeItem,
            ),
        });
    } catch (error) {
      if (
        isPrismaUniqueError(
          error,
        )
      ) {
        return res
          .status(409)
          .json({
            message:
              "This ingredient is already added to the recipe",
          });
      }

      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to add recipe item",
        });
    }
  },
);

router.put(
  "/:id/recipe-items/:recipeItemId",
  async (
    req,
    res,
  ) => {
    const parsed =
      recipeItemSchema.safeParse(
        req.body,
      );

    if (
      !parsed.success
    ) {
      return res
        .status(400)
        .json({
          message:
            "Invalid recipe item data",

          errors:
            parsed.error.flatten(),
        });
    }

    try {
      const productId =
        getRouteParam(
          req.params.id,
          "Product id",
        );

      const recipeItemId =
        getRouteParam(
          req.params.recipeItemId,
          "Recipe item id",
        );

      const product =
        await prisma.product.findFirst({
          where: {
            id:
              productId,

            officialSiteProductId: {
              not:
                null,
            },
          },

          select: {
            id:
              true,

            isActive:
              true,
          },
        });

      if (
        !product
      ) {
        return res
          .status(404)
          .json({
            message:
              "Official product not found",
          });
      }

      if (
        !product.isActive
      ) {
        return res
          .status(409)
          .json({
            message:
              "Cannot modify the recipe of an inactive official product",
          });
      }

      const ingredient =
        await prisma.ingredient.findUnique({
          where: {
            id:
              parsed.data.ingredientId,
          },
        });

      if (
        !ingredient ||
        !ingredient.isActive
      ) {
        return res
          .status(404)
          .json({
            message:
              "Active ingredient not found",
          });
      }

      if (
        ingredient.baseUnit !==
        parsed.data.baseUnit
      ) {
        return res
          .status(400)
          .json({
            message:
              `Unit mismatch. This ingredient uses ${ingredient.baseUnit}.`,
          });
      }

      const existing =
        await prisma.productRecipeItem.findFirst({
          where: {
            id:
              recipeItemId,

            productId:
              product.id,
          },
        });

      if (
        !existing
      ) {
        return res
          .status(404)
          .json({
            message:
              "Recipe item not found",
          });
      }

      const recipeItem =
        await prisma.productRecipeItem.update({
          where: {
            id:
              existing.id,
          },

          data: {
            ingredientId:
              ingredient.id,

            imageUrl:
              parsed.data.imageUrl ||
              null,

            requiredBaseQty:
              parsed.data.requiredBaseQty,

            baseUnit:
              parsed.data.baseUnit,
          },

          include: {
            ingredient:
              true,
          },
        });

      return res.json({
        recipeItem:
          mapRecipeItem(
            recipeItem,
          ),
      });
    } catch (error) {
      if (
        isPrismaUniqueError(
          error,
        )
      ) {
        return res
          .status(409)
          .json({
            message:
              "This ingredient is already added to the recipe",
          });
      }

      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to update recipe item",
        });
    }
  },
);

router.delete(
  "/:id/recipe-items/:recipeItemId",
  async (
    req,
    res,
  ) => {
    try {
      const productId =
        getRouteParam(
          req.params.id,
          "Product id",
        );

      const recipeItemId =
        getRouteParam(
          req.params.recipeItemId,
          "Recipe item id",
        );

      const product =
        await prisma.product.findFirst({
          where: {
            id:
              productId,

            officialSiteProductId: {
              not:
                null,
            },
          },

          select: {
            id:
              true,

            isActive:
              true,
          },
        });

      if (
        !product
      ) {
        return res
          .status(404)
          .json({
            message:
              "Official product not found",
          });
      }

      if (
        !product.isActive
      ) {
        return res
          .status(409)
          .json({
            message:
              "Cannot modify the recipe of an inactive official product",
          });
      }

      const deleted =
        await prisma.productRecipeItem.deleteMany({
          where: {
            id:
              recipeItemId,

            productId:
              product.id,
          },
        });

      if (
        deleted.count ===
        0
      ) {
        return res
          .status(404)
          .json({
            message:
              "Recipe item not found",
          });
      }

      return res.json({
        message:
          "Recipe item removed",
      });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to remove recipe item",
        });
    }
  },
);

/* ======================================================
   COST PREVIEW
====================================================== */

router.get(
  "/:id/cost-preview",
  async (
    req,
    res,
  ) => {
    try {
      const productId =
        getRouteParam(
          req.params.id,
          "Product id",
        );

      const now =
        new Date();

      const product =
        await prisma.product.findFirst({
          where: {
            id:
              productId,

            officialSiteProductId: {
              not:
                null,
            },
          },

          include: {
            recipeItems: {
              include: {
                ingredient: {
                  include: {
                    stockLots: {
                      where: {
                        remainingBaseQty: {
                          gt:
                            0,
                        },
                      },
                    },
                  },
                },
              },

              orderBy: {
                createdAt:
                  "asc",
              },
            },
          },
        });

      if (
        !product
      ) {
        return res
          .status(404)
          .json({
            message:
              "Official product not found",
          });
      }

      let currentCost =
        0;

      const lines =
        product.recipeItems.map(
          (
            recipeItem,
          ) => {
            const requiredQty =
              Number(
                recipeItem.requiredBaseQty,
              );

            let remainingNeed =
              requiredQty;

            let ingredientCost =
              0;

            const eligibleLots =
              recipeItem.ingredient.stockLots
                .filter(
                  (lot) =>
                    !lot.expiryDate ||
                    lot.expiryDate.getTime() >=
                      now.getTime(),
                )
                .sort(
                  (
                    first,
                    second,
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
                      first.receivedAt.getTime() -
                      second.receivedAt.getTime()
                    );
                  },
                );

            for (
              const lot
              of eligibleLots
            ) {
              if (
                remainingNeed <=
                0
              ) {
                break;
              }

              const availableQty =
                Number(
                  lot.remainingBaseQty,
                );

              const takeQty =
                Math.min(
                  remainingNeed,
                  availableQty,
                );

              const unitCostBase =
                Number(
                  lot.unitCostBase,
                );

              ingredientCost +=
                takeQty *
                unitCostBase;

              remainingNeed -=
                takeQty;
            }

            currentCost +=
              ingredientCost;

            return {
              recipeItemId:
                recipeItem.id,

              ingredientId:
                recipeItem.ingredientId,

              ingredientDisplayName:
                getIngredientDisplayName(
                  recipeItem.ingredient,
                ),

              imageUrl:
                recipeItem.imageUrl,

              ingredientImageUrl:
                recipeItem.ingredient
                  .imageUrl,

              displayImageUrl:
                recipeItem.imageUrl ||
                recipeItem.ingredient
                  .imageUrl ||
                null,

              requiredBaseQty:
                requiredQty,

              baseUnit:
                recipeItem.baseUnit,

              estimatedCost:
                Number(
                  ingredientCost.toFixed(
                    2,
                  ),
                ),

              availableBaseQty:
                Number(
                  (
                    requiredQty -
                    Math.max(
                      remainingNeed,
                      0,
                    )
                  ).toFixed(
                    3,
                  ),
                ),

              shortageBaseQty:
                Number(
                  Math.max(
                    remainingNeed,
                    0,
                  ).toFixed(
                    3,
                  ),
                ),

              isAvailable:
                remainingNeed <=
                0,
            };
          },
        );

      const sellPrice =
        Number(
          product.sellPrice,
        );

      const roundedCurrentCost =
        Number(
          currentCost.toFixed(
            2,
          ),
        );

      const estimatedProfit =
        Number(
          (
            sellPrice -
            roundedCurrentCost
          ).toFixed(
            2,
          ),
        );

      return res.json({
        costPreview: {
          productId:
            product.id,

          sellPrice,

          currentCost:
            roundedCurrentCost,

          estimatedProfit,

          profitMarginPercent:
            sellPrice >
            0
              ? Number(
                  (
                    (
                      estimatedProfit /
                      sellPrice
                    ) *
                    100
                  ).toFixed(
                    2,
                  ),
                )
              : 0,

          canProduce:
            product.recipeItems
              .length >
              0 &&
            lines.every(
              (line) =>
                line.isAvailable,
            ),

          lines,
        },
      });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to calculate cost preview",
        });
    }
  },
);

export default router;
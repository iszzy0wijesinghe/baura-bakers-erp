import {
  Router
} from "express";
import {
  z
} from "zod";
import {
  getRouteParam
} from "../../lib/http";
import {
  prisma
} from "../../lib/prisma";
import {
  authMiddleware,
  requireRoles
} from "../../middleware/auth.middleware";

const router =
  Router();

const optionalImageUrl =
  z.preprocess(
    (
      value
    ) => {
      if (
        value ===
          "" ||
        value ===
          undefined
      ) {
        return null;
      }

      return value;
    },
    z
      .string()
      .url(
        "Image URL must be valid"
      )
      .max(
        1200,
        "Image URL is too long"
      )
      .nullable()
  );

const ingredientSchema =
  z.object({
    name:
      z
        .string()
        .trim()
        .min(
          1,
          "Ingredient name is required"
        ),

    brand:
      z
        .string()
        .trim()
        .optional()
        .nullable(),

    imageUrl:
      optionalImageUrl,

    packageQty:
      z.coerce
        .number()
        .positive(
          "Package quantity must be positive"
        ),

    packageUnit:
      z.enum([
        "G",
        "KG",
        "ML",
        "L",
        "UNIT"
      ]),

    baseQty:
      z.coerce
        .number()
        .positive(
          "Base quantity must be positive"
        ),

    baseUnit:
      z.enum([
        "G",
        "ML",
        "UNIT"
      ]),

    lowStockAlertQty:
      z.preprocess(
        (
          value
        ) => {
          if (
            value ===
              "" ||
            value ===
              null ||
            value ===
              undefined
          ) {
            return null;
          }

          return value;
        },
        z.coerce
          .number()
          .positive()
          .nullable()
      )
  });

function getDisplayName(
  ingredient: {
    brand:
      | string
      | null;
    name: string;
    packageQty:
      unknown;
    packageUnit:
      string;
  }
) {
  const brand =
    ingredient.brand
      ? `${ingredient.brand} `
      : "";

  return `${brand}${ingredient.name} ${ingredient.packageQty}${ingredient.packageUnit.toLowerCase()}`;
}

router.use(
  authMiddleware
);

router.use(
  requireRoles(
    "ADMIN",
    "MANAGER"
  )
);

router.get(
  "/",
  async (
    _req,
    res
  ) => {
    try {
      const ingredients =
        await prisma.ingredient.findMany({
          orderBy: [
            {
              brand:
                "asc"
            },
            {
              name:
                "asc"
            }
          ]
        });

      return res.json({
        ingredients:
          ingredients.map(
            (
              ingredient
            ) => ({
              ...ingredient,

              displayName:
                getDisplayName(
                  ingredient
                )
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
              : "Failed to load ingredients"
        });
    }
  }
);

router.post(
  "/",
  async (
    req,
    res
  ) => {
    const parsed =
      ingredientSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      return res
        .status(400)
        .json({
          message:
            "Invalid ingredient data",

          errors:
            parsed.error.flatten()
        });
    }

    try {
      const ingredient =
        await prisma.ingredient.create({
          data: {
            ...parsed.data,

            brand:
              parsed.data.brand ||
              null,

            imageUrl:
              parsed.data.imageUrl ||
              null
          }
        });

      return res
        .status(201)
        .json({
          ingredient: {
            ...ingredient,

            displayName:
              getDisplayName(
                ingredient
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
              : "Failed to create ingredient"
        });
    }
  }
);

router.get(
  "/:id",
  async (
    req,
    res
  ) => {
    try {
      const id =
        getRouteParam(
          req.params.id,
          "Ingredient id"
        );

      const ingredient =
        await prisma.ingredient.findUnique({
          where: {
            id
          }
        });

      if (
        !ingredient
      ) {
        return res
          .status(404)
          .json({
            message:
              "Ingredient not found"
          });
      }

      return res.json({
        ingredient: {
          ...ingredient,

          displayName:
            getDisplayName(
              ingredient
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
              : "Failed to load ingredient"
        });
    }
  }
);

router.put(
  "/:id",
  async (
    req,
    res
  ) => {
    const parsed =
      ingredientSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      return res
        .status(400)
        .json({
          message:
            "Invalid ingredient data",

          errors:
            parsed.error.flatten()
        });
    }

    try {
      const id =
        getRouteParam(
          req.params.id,
          "Ingredient id"
        );

      const exists =
        await prisma.ingredient.findUnique({
          where: {
            id
          }
        });

      if (
        !exists
      ) {
        return res
          .status(404)
          .json({
            message:
              "Ingredient not found"
          });
      }

      const ingredient =
        await prisma.ingredient.update({
          where: {
            id
          },

          data: {
            ...parsed.data,

            brand:
              parsed.data.brand ||
              null,

            imageUrl:
              parsed.data.imageUrl ||
              null
          }
        });

      return res.json({
        ingredient: {
          ...ingredient,

          displayName:
            getDisplayName(
              ingredient
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
              : "Failed to update ingredient"
        });
    }
  }
);

router.delete(
  "/:id",
  async (
    req,
    res
  ) => {
    try {
      const id =
        getRouteParam(
          req.params.id,
          "Ingredient id"
        );

      const exists =
        await prisma.ingredient.findUnique({
          where: {
            id
          }
        });

      if (
        !exists
      ) {
        return res
          .status(404)
          .json({
            message:
              "Ingredient not found"
          });
      }

      await prisma.ingredient.update({
        where: {
          id
        },

        data: {
          isActive:
            false
        }
      });

      return res.json({
        message:
          "Ingredient deactivated successfully"
      });
    } catch (error) {
      return res
        .status(400)
        .json({
          message:
            error instanceof Error
              ? error.message
              : "Failed to deactivate ingredient"
        });
    }
  }
);

export default router;
/** @format */

import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import { authMiddleware, requireRoles } from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

const expenseSchema = z.object({
  productId: z.string().uuid(),
  productSizeId: z.string().uuid().nullable().optional(),

  name: z.string().trim().min(2).max(191),

  category: z.enum([
    "ELECTRICITY",
    "GAS",
    "LABOUR",
    "PACKAGING",
    "DECORATION",
    "TRANSPORT",
    "OTHER",
  ]),

  calculationMethod: z.enum(["PER_BATCH", "PER_UNIT", "QUANTITY_BASED"]),

  quantity: z.coerce.number().positive().default(1),
  rate: z.coerce.number().nonnegative(),

  description: z.string().trim().max(500).nullable().optional(),
});

function calculateExpense(
  expense: {
    calculationMethod: string;
    quantity: Prisma.Decimal;
    rate: Prisma.Decimal;
  },
  productionQty = 1,
) {
  const quantity = new Prisma.Decimal(expense.quantity);
  const rate = new Prisma.Decimal(expense.rate);

  if (expense.calculationMethod === "PER_UNIT") {
    return rate.mul(productionQty).toDecimalPlaces(2);
  }

  if (expense.calculationMethod === "QUANTITY_BASED") {
    return quantity.mul(rate).toDecimalPlaces(2);
  }

  return rate.toDecimalPlaces(2);
}

router.get("/:productId", async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.productId },
    });

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const expenses = await prisma.productRecipeExpense.findMany({
      where: {
        productId: product.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return res.json({
      expenses: expenses.map((expense) => ({
        ...expense,
        estimatedAmount: calculateExpense(expense).toString(),
      })),
    });
  } catch (error) {
    console.error("Recipe expense load failed", error);

    return res.status(500).json({
      message: "Failed to load recipe expenses",
    });
  }
});

router.post("/", requireRoles("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid recipe expense",
      errors: parsed.error.flatten(),
    });
  }

  try {
    const data = parsed.data;

    const product = await prisma.product.findUnique({
      where: { id: data.productId },
    });

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    if (data.productSizeId) {
      const size = await prisma.productSize.findFirst({
        where: {
          id: data.productSizeId,
          productId: data.productId,
        },
      });

      if (!size) {
        return res.status(400).json({
          message: "Selected size does not belong to this product",
        });
      }
    }

    const expense = await prisma.productRecipeExpense.create({
      data: {
        productId: data.productId,
        productSizeId: data.productSizeId ?? null,
        name: data.name,
        category: data.category,
        calculationMethod: data.calculationMethod,
        quantity: new Prisma.Decimal(data.quantity),
        rate: new Prisma.Decimal(data.rate),
        description: data.description ?? null,
      },
    });

    return res.status(201).json({
      message: "Recipe expense created",
      expense,
    });
  } catch (error) {
    console.error("Recipe expense creation failed", error);

    return res.status(500).json({
      message: "Failed to create recipe expense",
    });
  }
});

router.put("/:id", requireRoles("ADMIN", "MANAGER"), async (req, res) => {
  const parsed = expenseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid recipe expense",
      errors: parsed.error.flatten(),
    });
  }

  try {
    const expenseId = req.params.id;

    if (typeof expenseId !== "string") {
      return res.status(400).json({
        message: "Invalid recipe expense ID",
      });
    }

    const existing = await prisma.productRecipeExpense.findUnique({
      where: { id: expenseId },
    });

    if (!existing) {
      return res.status(404).json({
        message: "Recipe expense not found",
      });
    }

    const data = parsed.data;

    if (data.productId !== existing.productId) {
      return res.status(400).json({
        message: "Cannot move an expense to another product",
      });
    }

    if (data.productSizeId) {
      const size = await prisma.productSize.findFirst({
        where: {
          id: data.productSizeId,
          productId: data.productId,
        },
      });

      if (!size) {
        return res.status(400).json({
          message: "Invalid product size",
        });
      }
    }

    const expense = await prisma.productRecipeExpense.update({
      where: { id: existing.id },
      data: {
        productSizeId: data.productSizeId ?? null,
        name: data.name,
        category: data.category,
        calculationMethod: data.calculationMethod,
        quantity: new Prisma.Decimal(data.quantity),
        rate: new Prisma.Decimal(data.rate),
        description: data.description ?? null,
      },
    });

    return res.json({
      message: "Recipe expense updated",
      expense,
    });
  } catch (error) {
    console.error("Recipe expense update failed", error);

    return res.status(500).json({
      message: "Failed to update recipe expense",
    });
  }
});

router.delete("/:id", requireRoles("ADMIN", "MANAGER"), async (req, res) => {
  try {
    const expenseId = req.params.id;

    if (typeof expenseId !== "string") {
      return res.status(400).json({
        message: "Invalid recipe expense ID",
      });
    }

    const existing = await prisma.productRecipeExpense.findUnique({
      where: { id: expenseId },
    });
    if (!existing) {
      return res.status(404).json({
        message: "Recipe expense not found",
      });
    }

    await prisma.productRecipeExpense.update({
      where: { id: existing.id },
      data: {
        isActive: false,
      },
    });

    return res.json({
      message: "Recipe expense deactivated",
    });
  } catch (error) {
    console.error("Recipe expense deactivation failed", error);

    return res.status(500).json({
      message: "Failed to deactivate recipe expense",
    });
  }
});

export default router;

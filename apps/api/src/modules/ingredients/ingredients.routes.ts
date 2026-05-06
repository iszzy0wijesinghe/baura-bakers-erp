import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

const ingredientSchema = z.object({
  name: z.string().min(1, "Ingredient name is required"),
  brand: z.string().optional().nullable(),
  packageQty: z.coerce.number().positive("Package quantity must be positive"),
  packageUnit: z.enum(["G", "KG", "ML", "L", "UNIT"]),
  baseQty: z.coerce.number().positive("Base quantity must be positive"),
  baseUnit: z.enum(["G", "ML", "UNIT"]),
  lowStockAlertQty: z.coerce.number().positive().optional().nullable()
});

function getDisplayName(ingredient: {
  brand: string | null;
  name: string;
  packageQty: unknown;
  packageUnit: string;
}) {
  const brand = ingredient.brand ? `${ingredient.brand} ` : "";
  return `${brand}${ingredient.name} ${ingredient.packageQty}${ingredient.packageUnit.toLowerCase()}`;
}

router.use(authMiddleware);

router.get("/", async (_req, res) => {
  const ingredients = await prisma.ingredient.findMany({
    orderBy: [{ brand: "asc" }, { name: "asc" }]
  });

  return res.json({
    ingredients: ingredients.map((ingredient) => ({
      ...ingredient,
      displayName: getDisplayName(ingredient)
    }))
  });
});

router.post("/", async (req, res) => {
  const parsed = ingredientSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid ingredient data",
      errors: parsed.error.flatten()
    });
  }

  const ingredient = await prisma.ingredient.create({
    data: parsed.data
  });

  return res.status(201).json({
    ingredient: {
      ...ingredient,
      displayName: getDisplayName(ingredient)
    }
  });
});

router.get("/:id", async (req, res) => {
  const ingredient = await prisma.ingredient.findUnique({
    where: { id: req.params.id }
  });

  if (!ingredient) {
    return res.status(404).json({ message: "Ingredient not found" });
  }

  return res.json({
    ingredient: {
      ...ingredient,
      displayName: getDisplayName(ingredient)
    }
  });
});

router.put("/:id", async (req, res) => {
  const parsed = ingredientSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid ingredient data",
      errors: parsed.error.flatten()
    });
  }

  const exists = await prisma.ingredient.findUnique({
    where: { id: req.params.id }
  });

  if (!exists) {
    return res.status(404).json({ message: "Ingredient not found" });
  }

  const ingredient = await prisma.ingredient.update({
    where: { id: req.params.id },
    data: parsed.data
  });

  return res.json({
    ingredient: {
      ...ingredient,
      displayName: getDisplayName(ingredient)
    }
  });
});

router.delete("/:id", async (req, res) => {
  const exists = await prisma.ingredient.findUnique({
    where: { id: req.params.id }
  });

  if (!exists) {
    return res.status(404).json({ message: "Ingredient not found" });
  }

  await prisma.ingredient.update({
    where: { id: req.params.id },
    data: { isActive: false }
  });

  return res.json({ message: "Ingredient deactivated successfully" });
});

export default router;
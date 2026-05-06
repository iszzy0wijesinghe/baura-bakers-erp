import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

const paymentMethods = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE", "OTHER"] as const;

const createSaleSchema = z.object({
  salesChannelId: z.string().uuid().optional().nullable(),
  paymentMethod: z.enum(paymentMethods).default("CASH"),
  discountTotal: z.coerce.number().min(0).default(0),
  soldAt: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid("Valid product is required"),
        qty: z.coerce.number().positive("Quantity must be greater than 0"),
        unitSellPrice: z.coerce.number().min(0).optional()
      })
    )
    .min(1, "At least one sale item is required")
});

function round2(value: number) {
  return Number(value.toFixed(2));
}

function round3(value: number) {
  return Number(value.toFixed(3));
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

function getProductDisplayName(product: {
  name: string;
  variantName: string | null;
}) {
  return product.variantName
    ? `${product.name} - ${product.variantName}`
    : product.name;
}

async function generateOrderNo() {
  const count = await prisma.salesOrder.count();
  return `SAL-${String(count + 1).padStart(5, "0")}`;
}

router.get("/channels", async (_req, res) => {
  const channels = await prisma.salesChannel.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" }
  });

  return res.json({ channels });
});

router.get("/products", async (_req, res) => {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { variantName: "asc" }],
    include: {
      _count: {
        select: { recipeItems: true }
      }
    }
  });

  return res.json({
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      variantName: product.variantName,
      displayName: getProductDisplayName(product),
      sellPrice: product.sellPrice,
      recipeItemCount: product._count.recipeItems,
      isReadyForSale: product._count.recipeItems > 0
    }))
  });
});

router.get("/", async (_req, res) => {
  const sales = await prisma.salesOrder.findMany({
    orderBy: { soldAt: "desc" },
    take: 100,
    include: {
      salesChannel: true,
      items: {
        include: {
          product: true
        }
      }
    }
  });

  return res.json({
    sales: sales.map((sale) => ({
      id: sale.id,
      orderNo: sale.orderNo,
      salesChannel: sale.salesChannel?.name || "Direct",
      paymentMethod: sale.paymentMethod,
      grossTotal: sale.grossTotal,
      discountTotal: sale.discountTotal,
      netTotal: sale.netTotal,
      cogsTotal: sale.cogsTotal,
      profitTotal: sale.profitTotal,
      status: sale.status,
      soldAt: sale.soldAt,
      itemCount: sale.items.length,
      items: sale.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productDisplayName: getProductDisplayName(item.product),
        qty: item.qty,
        unitSellPrice: item.unitSellPrice,
        lineTotal: item.lineTotal,
        cogsTotal: item.cogsTotal,
        profitTotal: item.profitTotal
      }))
    }))
  });
});

router.get("/:id", async (req, res) => {
  const sale = await prisma.salesOrder.findUnique({
    where: { id: req.params.id },
    include: {
      salesChannel: true,
      items: {
        include: {
          product: true,
          fifoConsumptions: {
            include: {
              ingredient: true,
              stockLot: {
                include: {
                  carterItem: {
                    include: {
                      carter: true
                    }
                  }
                }
              }
            },
            orderBy: { createdAt: "asc" }
          }
        },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!sale) {
    return res.status(404).json({ message: "Sale not found" });
  }

  return res.json({
    sale: {
      id: sale.id,
      orderNo: sale.orderNo,
      salesChannel: sale.salesChannel?.name || "Direct",
      paymentMethod: sale.paymentMethod,
      grossTotal: sale.grossTotal,
      discountTotal: sale.discountTotal,
      netTotal: sale.netTotal,
      cogsTotal: sale.cogsTotal,
      profitTotal: sale.profitTotal,
      status: sale.status,
      soldAt: sale.soldAt,
      items: sale.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productDisplayName: getProductDisplayName(item.product),
        qty: item.qty,
        unitSellPrice: item.unitSellPrice,
        lineTotal: item.lineTotal,
        cogsTotal: item.cogsTotal,
        profitTotal: item.profitTotal,
        fifoConsumptions: item.fifoConsumptions.map((consumption) => ({
          id: consumption.id,
          ingredientId: consumption.ingredientId,
          ingredientDisplayName: getIngredientDisplayName(
            consumption.ingredient
          ),
          stockLotId: consumption.stockLotId,
          carterNo: consumption.stockLot.carterItem.carter.carterNo,
          consumedBaseQty: consumption.consumedBaseQty,
          unitCostBase: consumption.unitCostBase,
          costAmount: consumption.costAmount
        }))
      }))
    }
  });
});

router.post("/", async (req, res) => {
  const parsed = createSaleSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid sale data",
      errors: parsed.error.flatten()
    });
  }

  try {
    const createdSale = await prisma.$transaction(async (tx) => {
      if (parsed.data.salesChannelId) {
        const channel = await tx.salesChannel.findUnique({
          where: { id: parsed.data.salesChannelId }
        });

        if (!channel || !channel.isActive) {
          throw new Error("Active sales channel not found");
        }
      }

      const productIds = [...new Set(parsed.data.items.map((item) => item.productId))];

      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
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
                    },
                    orderBy: {
                      receivedAt: "asc"
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

      const productMap = new Map(products.map((product) => [product.id, product]));

      const missingProduct = productIds.find((productId) => !productMap.has(productId));

      if (missingProduct) {
        throw new Error("One or more active products were not found");
      }

      const lotRemainingMap = new Map<string, number>();

      for (const product of products) {
        for (const recipeItem of product.recipeItems) {
          for (const lot of recipeItem.ingredient.stockLots) {
            if (!lotRemainingMap.has(lot.id)) {
              lotRemainingMap.set(lot.id, Number(lot.remainingBaseQty));
            }
          }
        }
      }

      type PlannedAllocation = {
        stockLotId: string;
        ingredientId: string;
        consumedBaseQty: number;
        unitCostBase: number;
        costAmount: number;
      };

      type PlannedSaleItem = {
        productId: string;
        qty: number;
        unitSellPrice: number;
        lineTotal: number;
        cogsTotal: number;
        profitTotal: number;
        allocations: PlannedAllocation[];
      };

      const plannedItems: PlannedSaleItem[] = [];

      for (const cartItem of parsed.data.items) {
        const product = productMap.get(cartItem.productId);

        if (!product) {
          throw new Error("Product not found");
        }

        if (product.recipeItems.length === 0) {
          throw new Error(
            `${getProductDisplayName(product)} has no recipe ingredients`
          );
        }

        const qty = cartItem.qty;
        const unitSellPrice =
          cartItem.unitSellPrice !== undefined
            ? cartItem.unitSellPrice
            : Number(product.sellPrice);

        const lineTotal = round2(qty * unitSellPrice);
        const allocations: PlannedAllocation[] = [];

        for (const recipeItem of product.recipeItems) {
          const requiredBaseQty = Number(recipeItem.requiredBaseQty) * qty;
          let remainingNeed = requiredBaseQty;

          for (const lot of recipeItem.ingredient.stockLots) {
            if (remainingNeed <= 0) break;

            const availableQty = lotRemainingMap.get(lot.id) || 0;

            if (availableQty <= 0) continue;

            const takeQty = Math.min(remainingNeed, availableQty);
            const unitCostBase = Number(lot.unitCostBase);
            const costAmount = round2(takeQty * unitCostBase);

            remainingNeed = round3(remainingNeed - takeQty);
            lotRemainingMap.set(lot.id, round3(availableQty - takeQty));

            allocations.push({
              stockLotId: lot.id,
              ingredientId: recipeItem.ingredientId,
              consumedBaseQty: round3(takeQty),
              unitCostBase,
              costAmount
            });
          }

          if (remainingNeed > 0) {
            throw new Error(
              `Not enough stock for ${getIngredientDisplayName(
                recipeItem.ingredient
              )}. Shortage: ${round3(remainingNeed)} ${recipeItem.baseUnit}`
            );
          }
        }

        const cogsTotal = round2(
          allocations.reduce((sum, allocation) => sum + allocation.costAmount, 0)
        );

        plannedItems.push({
          productId: product.id,
          qty,
          unitSellPrice,
          lineTotal,
          cogsTotal,
          profitTotal: round2(lineTotal - cogsTotal),
          allocations
        });
      }

      const grossTotal = round2(
        plannedItems.reduce((sum, item) => sum + item.lineTotal, 0)
      );

      const discountTotal = round2(
        Math.min(parsed.data.discountTotal || 0, grossTotal)
      );

      const netTotal = round2(grossTotal - discountTotal);

      const cogsTotal = round2(
        plannedItems.reduce((sum, item) => sum + item.cogsTotal, 0)
      );

      const profitTotal = round2(netTotal - cogsTotal);

      const orderNo = await generateOrderNo();

      const sale = await tx.salesOrder.create({
        data: {
          orderNo,
          salesChannelId: parsed.data.salesChannelId || null,
          paymentMethod: parsed.data.paymentMethod,
          saleType: "POS",
          grossTotal,
          discountTotal,
          netTotal,
          cogsTotal,
          profitTotal,
          status: "COMPLETED",
          createdById: req.user?.id || null,
          soldAt: parsed.data.soldAt ? new Date(parsed.data.soldAt) : new Date()
        }
      });

      for (const plannedItem of plannedItems) {
        const saleItem = await tx.saleItem.create({
          data: {
            salesOrderId: sale.id,
            productId: plannedItem.productId,
            qty: plannedItem.qty,
            unitSellPrice: plannedItem.unitSellPrice,
            lineTotal: plannedItem.lineTotal,
            cogsTotal: plannedItem.cogsTotal,
            profitTotal: plannedItem.profitTotal
          }
        });

        for (const allocation of plannedItem.allocations) {
          await tx.ingredientStockLot.update({
            where: { id: allocation.stockLotId },
            data: {
              remainingBaseQty: {
                decrement: allocation.consumedBaseQty
              }
            }
          });

          await tx.saleItemFifoConsumption.create({
            data: {
              saleItemId: saleItem.id,
              stockLotId: allocation.stockLotId,
              ingredientId: allocation.ingredientId,
              consumedBaseQty: allocation.consumedBaseQty,
              unitCostBase: allocation.unitCostBase,
              costAmount: allocation.costAmount
            }
          });

          await tx.stockMovement.create({
            data: {
              ingredientId: allocation.ingredientId,
              stockLotId: allocation.stockLotId,
              movementType: "SALE",
              refType: "SALE_ITEM",
              refId: saleItem.id,
              qtyDelta: -allocation.consumedBaseQty,
              unitCostBase: allocation.unitCostBase,
              costAmount: allocation.costAmount,
              note: `Sold through ${sale.orderNo}`
            }
          });
        }
      }

      return sale;
    });

    const saleWithDetails = await prisma.salesOrder.findUnique({
      where: { id: createdSale.id },
      include: {
        salesChannel: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    return res.status(201).json({
      message: "Sale completed successfully",
      sale: saleWithDetails
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete sale";

    return res.status(400).json({
      message
    });
  }
});

export default router;
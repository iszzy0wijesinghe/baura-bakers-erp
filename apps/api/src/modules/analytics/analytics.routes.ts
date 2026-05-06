import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.use(authMiddleware);

function toNumber(value: unknown) {
  return Number(value || 0);
}

function round2(value: number) {
  return Number(value.toFixed(2));
}

function round3(value: number) {
  return Number(value.toFixed(3));
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

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysAgo(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  value.setHours(0, 0, 0, 0);
  return value;
}

function formatDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateParam(value: unknown, fallback: Date, endOfDay = false) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  if (endOfDay) {
    parsed.setHours(23, 59, 59, 999);
  } else {
    parsed.setHours(0, 0, 0, 0);
  }

  return parsed;
}

function daysBetween(start: Date, end: Date) {
  const dates: Date[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= end && dates.length < 120) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

router.get("/dashboard", async (_req, res) => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const trendStart = daysAgo(6);

  const [
    todaySales,
    monthSales,
    trendSales,
    allActiveIngredients,
    activeProductCount,
    activeIngredientCount,
    recentSales,
    saleItems
  ] = await Promise.all([
    prisma.salesOrder.findMany({
      where: {
        status: "COMPLETED",
        soldAt: {
          gte: todayStart
        }
      }
    }),

    prisma.salesOrder.findMany({
      where: {
        status: "COMPLETED",
        soldAt: {
          gte: monthStart
        }
      },
      include: {
        salesChannel: true
      }
    }),

    prisma.salesOrder.findMany({
      where: {
        status: "COMPLETED",
        soldAt: {
          gte: trendStart
        }
      }
    }),

    prisma.ingredient.findMany({
      where: {
        isActive: true
      },
      include: {
        stockLots: {
          where: {
            remainingBaseQty: {
              gt: 0
            }
          }
        }
      },
      orderBy: [{ brand: "asc" }, { name: "asc" }]
    }),

    prisma.product.count({
      where: {
        isActive: true
      }
    }),

    prisma.ingredient.count({
      where: {
        isActive: true
      }
    }),

    prisma.salesOrder.findMany({
      where: {
        status: "COMPLETED"
      },
      orderBy: {
        soldAt: "desc"
      },
      take: 8,
      include: {
        salesChannel: true,
        items: {
          include: {
            product: true
          }
        }
      }
    }),

    prisma.saleItem.findMany({
      where: {
        salesOrder: {
          status: "COMPLETED",
          soldAt: {
            gte: monthStart
          }
        }
      },
      include: {
        product: true,
        salesOrder: {
          include: {
            salesChannel: true
          }
        }
      }
    })
  ]);

  const todaySalesTotal = round2(
    todaySales.reduce((sum, sale) => sum + toNumber(sale.netTotal), 0)
  );

  const todayProfitTotal = round2(
    todaySales.reduce((sum, sale) => sum + toNumber(sale.profitTotal), 0)
  );

  const monthSalesTotal = round2(
    monthSales.reduce((sum, sale) => sum + toNumber(sale.netTotal), 0)
  );

  const monthProfitTotal = round2(
    monthSales.reduce((sum, sale) => sum + toNumber(sale.profitTotal), 0)
  );

  const monthCogsTotal = round2(
    monthSales.reduce((sum, sale) => sum + toNumber(sale.cogsTotal), 0)
  );

  const inventoryItems = allActiveIngredients.map((ingredient) => {
    const qtyOnHand = ingredient.stockLots.reduce(
      (sum, lot) => sum + toNumber(lot.remainingBaseQty),
      0
    );

    const stockValue = ingredient.stockLots.reduce(
      (sum, lot) =>
        sum + toNumber(lot.remainingBaseQty) * toNumber(lot.unitCostBase),
      0
    );

    const lowStockAlertQty =
      ingredient.lowStockAlertQty !== null
        ? toNumber(ingredient.lowStockAlertQty)
        : null;

    const isOutOfStock = qtyOnHand <= 0;

    const isLowStock =
      !isOutOfStock &&
      lowStockAlertQty !== null &&
      qtyOnHand <= lowStockAlertQty;

    return {
      ingredientId: ingredient.id,
      displayName: getIngredientDisplayName(ingredient),
      baseUnit: ingredient.baseUnit,
      qtyOnHand: round3(qtyOnHand),
      stockValue: round2(stockValue),
      lowStockAlertQty,
      isOutOfStock,
      isLowStock,
      stockLotCount: ingredient.stockLots.length
    };
  });

  const inventoryValue = round2(
    inventoryItems.reduce((sum, item) => sum + item.stockValue, 0)
  );

  const lowStockItems = inventoryItems
    .filter((item) => item.isOutOfStock || item.isLowStock)
    .sort((a, b) => {
      if (a.isOutOfStock && !b.isOutOfStock) return -1;
      if (!a.isOutOfStock && b.isOutOfStock) return 1;
      if (a.isLowStock && !b.isLowStock) return -1;
      if (!a.isLowStock && b.isLowStock) return 1;
      return a.displayName.localeCompare(b.displayName);
    })
    .slice(0, 10);

  const outOfStockCount = inventoryItems.filter(
    (item) => item.isOutOfStock
  ).length;

  const lowStockCount = inventoryItems.filter((item) => item.isLowStock).length;

  const productSalesMap = new Map<
    string,
    {
      productId: string;
      displayName: string;
      qty: number;
      revenue: number;
      cogs: number;
      profit: number;
    }
  >();

  for (const item of saleItems) {
    const existing =
      productSalesMap.get(item.productId) ||
      {
        productId: item.productId,
        displayName: getProductDisplayName(item.product),
        qty: 0,
        revenue: 0,
        cogs: 0,
        profit: 0
      };

    existing.qty += toNumber(item.qty);
    existing.revenue += toNumber(item.lineTotal);
    existing.cogs += toNumber(item.cogsTotal);
    existing.profit += toNumber(item.profitTotal);

    productSalesMap.set(item.productId, existing);
  }

  const topProducts = Array.from(productSalesMap.values())
    .map((item) => ({
      ...item,
      qty: round3(item.qty),
      revenue: round2(item.revenue),
      cogs: round2(item.cogs),
      profit: round2(item.profit)
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const channelSalesMap = new Map<
    string,
    {
      channelName: string;
      orderCount: number;
      revenue: number;
      cogs: number;
      profit: number;
    }
  >();

  for (const sale of monthSales) {
    const channelName = sale.salesChannel?.name || "Direct / Shop";

    const existing =
      channelSalesMap.get(channelName) ||
      {
        channelName,
        orderCount: 0,
        revenue: 0,
        cogs: 0,
        profit: 0
      };

    existing.orderCount += 1;
    existing.revenue += toNumber(sale.netTotal);
    existing.cogs += toNumber(sale.cogsTotal);
    existing.profit += toNumber(sale.profitTotal);

    channelSalesMap.set(channelName, existing);
  }

  const channelSales = Array.from(channelSalesMap.values())
    .map((item) => ({
      ...item,
      revenue: round2(item.revenue),
      cogs: round2(item.cogs),
      profit: round2(item.profit)
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const trendMap = new Map<
    string,
    {
      date: string;
      sales: number;
      profit: number;
      orderCount: number;
    }
  >();

  for (let index = 0; index < 7; index += 1) {
    const date = daysAgo(6 - index);
    const key = formatDayKey(date);

    trendMap.set(key, {
      date: key,
      sales: 0,
      profit: 0,
      orderCount: 0
    });
  }

  for (const sale of trendSales) {
    const key = formatDayKey(sale.soldAt);
    const existing = trendMap.get(key);

    if (!existing) continue;

    existing.sales += toNumber(sale.netTotal);
    existing.profit += toNumber(sale.profitTotal);
    existing.orderCount += 1;
  }

  const salesTrend = Array.from(trendMap.values()).map((item) => ({
    date: item.date,
    sales: round2(item.sales),
    profit: round2(item.profit),
    orderCount: item.orderCount
  }));

  return res.json({
    summary: {
      todaySales: todaySalesTotal,
      todayProfit: todayProfitTotal,
      todayOrders: todaySales.length,
      monthSales: monthSalesTotal,
      monthProfit: monthProfitTotal,
      monthCogs: monthCogsTotal,
      inventoryValue,
      lowStockItems: lowStockCount,
      outOfStockItems: outOfStockCount,
      activeProducts: activeProductCount,
      activeIngredients: activeIngredientCount
    },
    salesTrend,
    topProducts,
    channelSales,
    lowStock: lowStockItems,
    recentSales: recentSales.map((sale) => ({
      id: sale.id,
      orderNo: sale.orderNo,
      salesChannel: sale.salesChannel?.name || "Direct / Shop",
      paymentMethod: sale.paymentMethod,
      netTotal: sale.netTotal,
      cogsTotal: sale.cogsTotal,
      profitTotal: sale.profitTotal,
      soldAt: sale.soldAt,
      itemCount: sale.items.length,
      items: sale.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productDisplayName: getProductDisplayName(item.product),
        qty: item.qty,
        lineTotal: item.lineTotal,
        profitTotal: item.profitTotal
      }))
    }))
  });
});

router.get("/advanced", async (req, res) => {
  const now = new Date();

  const defaultFrom = new Date();
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  defaultFrom.setHours(0, 0, 0, 0);

  const defaultTo = new Date(now);
  defaultTo.setHours(23, 59, 59, 999);

  const from = parseDateParam(req.query.from, defaultFrom);
  const to = parseDateParam(req.query.to, defaultTo, true);

  const [salesOrders, saleItems, activeIngredients, activeProductCount] =
    await Promise.all([
      prisma.salesOrder.findMany({
        where: {
          status: "COMPLETED",
          soldAt: {
            gte: from,
            lte: to
          }
        },
        include: {
          salesChannel: true,
          items: {
            include: {
              product: true
            }
          }
        },
        orderBy: {
          soldAt: "asc"
        }
      }),

      prisma.saleItem.findMany({
        where: {
          salesOrder: {
            status: "COMPLETED",
            soldAt: {
              gte: from,
              lte: to
            }
          }
        },
        include: {
          product: true,
          salesOrder: {
            include: {
              salesChannel: true
            }
          }
        }
      }),

      prisma.ingredient.findMany({
        where: {
          isActive: true
        },
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
        },
        orderBy: [{ brand: "asc" }, { name: "asc" }]
      }),

      prisma.product.count({
        where: {
          isActive: true
        }
      })
    ]);

  const revenue = round2(
    salesOrders.reduce((sum, sale) => sum + toNumber(sale.netTotal), 0)
  );

  const grossRevenue = round2(
    salesOrders.reduce((sum, sale) => sum + toNumber(sale.grossTotal), 0)
  );

  const discount = round2(
    salesOrders.reduce((sum, sale) => sum + toNumber(sale.discountTotal), 0)
  );

  const cogs = round2(
    salesOrders.reduce((sum, sale) => sum + toNumber(sale.cogsTotal), 0)
  );

  const profit = round2(
    salesOrders.reduce((sum, sale) => sum + toNumber(sale.profitTotal), 0)
  );

  const avgOrderValue =
    salesOrders.length > 0 ? round2(revenue / salesOrders.length) : 0;

  const profitMarginPercent =
    revenue > 0 ? round2((profit / revenue) * 100) : 0;

  const inventoryItems = activeIngredients.map((ingredient) => {
    const qtyOnHand = ingredient.stockLots.reduce(
      (sum, lot) => sum + toNumber(lot.remainingBaseQty),
      0
    );

    const stockValue = ingredient.stockLots.reduce(
      (sum, lot) =>
        sum + toNumber(lot.remainingBaseQty) * toNumber(lot.unitCostBase),
      0
    );

    const lowStockAlertQty =
      ingredient.lowStockAlertQty !== null
        ? toNumber(ingredient.lowStockAlertQty)
        : null;

    const isOutOfStock = qtyOnHand <= 0;

    const isLowStock =
      !isOutOfStock &&
      lowStockAlertQty !== null &&
      qtyOnHand <= lowStockAlertQty;

    let stockPriority = 3;

    if (isOutOfStock) stockPriority = 1;
    else if (isLowStock) stockPriority = 2;

    return {
      ingredientId: ingredient.id,
      displayName: getIngredientDisplayName(ingredient),
      baseUnit: ingredient.baseUnit,
      qtyOnHand: round3(qtyOnHand),
      stockValue: round2(stockValue),
      lowStockAlertQty,
      isOutOfStock,
      isLowStock,
      stockPriority,
      stockLotCount: ingredient.stockLots.length
    };
  });

  const inventoryValue = round2(
    inventoryItems.reduce((sum, item) => sum + item.stockValue, 0)
  );

  const lowStockCount = inventoryItems.filter((item) => item.isLowStock).length;
  const outOfStockCount = inventoryItems.filter(
    (item) => item.isOutOfStock
  ).length;

  const trendMap = new Map<
    string,
    {
      date: string;
      revenue: number;
      grossRevenue: number;
      discount: number;
      cogs: number;
      profit: number;
      orderCount: number;
    }
  >();

  for (const date of daysBetween(from, to)) {
    const key = formatDayKey(date);

    trendMap.set(key, {
      date: key,
      revenue: 0,
      grossRevenue: 0,
      discount: 0,
      cogs: 0,
      profit: 0,
      orderCount: 0
    });
  }

  for (const sale of salesOrders) {
    const key = formatDayKey(sale.soldAt);
    const existing = trendMap.get(key);

    if (!existing) continue;

    existing.revenue += toNumber(sale.netTotal);
    existing.grossRevenue += toNumber(sale.grossTotal);
    existing.discount += toNumber(sale.discountTotal);
    existing.cogs += toNumber(sale.cogsTotal);
    existing.profit += toNumber(sale.profitTotal);
    existing.orderCount += 1;
  }

  const trend = Array.from(trendMap.values()).map((item) => ({
    date: item.date,
    revenue: round2(item.revenue),
    grossRevenue: round2(item.grossRevenue),
    discount: round2(item.discount),
    cogs: round2(item.cogs),
    profit: round2(item.profit),
    orderCount: item.orderCount,
    marginPercent:
      item.revenue > 0 ? round2((item.profit / item.revenue) * 100) : 0
  }));

  const productMap = new Map<
    string,
    {
      productId: string;
      displayName: string;
      qty: number;
      revenue: number;
      cogs: number;
      profit: number;
      orderCount: number;
    }
  >();

  for (const item of saleItems) {
    const existing =
      productMap.get(item.productId) ||
      {
        productId: item.productId,
        displayName: getProductDisplayName(item.product),
        qty: 0,
        revenue: 0,
        cogs: 0,
        profit: 0,
        orderCount: 0
      };

    existing.qty += toNumber(item.qty);
    existing.revenue += toNumber(item.lineTotal);
    existing.cogs += toNumber(item.cogsTotal);
    existing.profit += toNumber(item.profitTotal);
    existing.orderCount += 1;

    productMap.set(item.productId, existing);
  }

  const productSales = Array.from(productMap.values())
    .map((item) => ({
      ...item,
      qty: round3(item.qty),
      revenue: round2(item.revenue),
      cogs: round2(item.cogs),
      profit: round2(item.profit),
      marginPercent:
        item.revenue > 0 ? round2((item.profit / item.revenue) * 100) : 0
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const channelMap = new Map<
    string,
    {
      channelName: string;
      orderCount: number;
      revenue: number;
      cogs: number;
      profit: number;
    }
  >();

  for (const sale of salesOrders) {
    const channelName = sale.salesChannel?.name || "Direct / Shop";

    const existing =
      channelMap.get(channelName) ||
      {
        channelName,
        orderCount: 0,
        revenue: 0,
        cogs: 0,
        profit: 0
      };

    existing.orderCount += 1;
    existing.revenue += toNumber(sale.netTotal);
    existing.cogs += toNumber(sale.cogsTotal);
    existing.profit += toNumber(sale.profitTotal);

    channelMap.set(channelName, existing);
  }

  const channelSales = Array.from(channelMap.values())
    .map((item) => ({
      ...item,
      revenue: round2(item.revenue),
      cogs: round2(item.cogs),
      profit: round2(item.profit),
      marginPercent:
        item.revenue > 0 ? round2((item.profit / item.revenue) * 100) : 0
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const paymentMap = new Map<
    string,
    {
      paymentMethod: string;
      orderCount: number;
      revenue: number;
      profit: number;
    }
  >();

  for (const sale of salesOrders) {
    const existing =
      paymentMap.get(sale.paymentMethod) ||
      {
        paymentMethod: sale.paymentMethod,
        orderCount: 0,
        revenue: 0,
        profit: 0
      };

    existing.orderCount += 1;
    existing.revenue += toNumber(sale.netTotal);
    existing.profit += toNumber(sale.profitTotal);

    paymentMap.set(sale.paymentMethod, existing);
  }

  const paymentSales = Array.from(paymentMap.values())
    .map((item) => ({
      ...item,
      revenue: round2(item.revenue),
      profit: round2(item.profit)
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const inventoryRisk = inventoryItems
    .sort((a, b) => {
      if (a.stockPriority !== b.stockPriority) {
        return a.stockPriority - b.stockPriority;
      }

      return a.displayName.localeCompare(b.displayName);
    })
    .slice(0, 20);

  return res.json({
    range: {
      from,
      to
    },
    summary: {
      orderCount: salesOrders.length,
      grossRevenue,
      revenue,
      discount,
      cogs,
      profit,
      avgOrderValue,
      profitMarginPercent,
      inventoryValue,
      lowStockItems: lowStockCount,
      outOfStockItems: outOfStockCount,
      activeProducts: activeProductCount,
      activeIngredients: activeIngredients.length
    },
    trend,
    productSales,
    channelSales,
    paymentSales,
    inventoryRisk
  });
});

export default router;
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { nextDocumentNumber } from "../../lib/documentSequence";
import { runSerializableTransaction } from "../../lib/transaction";
import { recordPosSaleFinanceJournal } from "../finance/finance.pos-posting";
import {
  getOfficialSiteCustomer,
  type OfficialSiteCustomer
} from "../../lib/officialSite";
import {
  authMiddleware,
  hasAnyRole,
  requirePermission,
  requireRoles
} from "../../middleware/auth.middleware";
import { getSriLankaDateParts } from "../business-calendar/businessCalendar.routes";

const router = Router();

router.use(authMiddleware);

const paymentMethods = [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "ONLINE",
  "OTHER"
] as const;

const paymentSchema = z.object({
  method: z.enum(paymentMethods),
  tenderedAmount: z.coerce.number().finite().min(0).optional().nullable(),
  reference: z.string().trim().max(191).optional().nullable()
});

const createSaleSchema = z.object({
  salesChannelId: z.string().uuid().optional().nullable(),
  officialCustomerId: z.coerce.number().int().positive().optional().nullable(),
  receiptEmail: z.union([
    z.string().trim().email("Enter a valid receipt email address").max(191),
    z.literal(""),
    z.null()
  ]).optional(),
  discountTotal: z.coerce.number().finite().min(0).default(0),
  approvalId: z.string().uuid().optional().nullable(),
  idempotencyKey: z.string().trim().min(8).max(191).optional().nullable(),
  payment: paymentSchema.optional(),
  payments: z.array(paymentSchema.extend({ amount: z.coerce.number().finite().positive() })).min(1).max(5).optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid("Valid product is required"),
      productSizeId: z.string().uuid().optional().nullable(),
      qty: z.coerce.number().finite().positive("Quantity must be greater than 0")
    })
  ).min(1, "At least one sale item is required").max(500, "Too many sale items")
});

type NormalizedSaleItem = {
  productId: string;
  productSizeId: string | null;
  qty: number;
};

type PlannedAllocation = {
  finishedGoodsLotId: string;
  consumedQty: number;
  unitCost: number;
  costAmount: number;
};

type PlannedItem = {
  productId: string;
  productSizeId: string | null;
  productDisplayName: string;
  productSizeLabel: string | null;
  qty: number;
  unitSellPrice: number;
  lineTotal: number;
  discountTotal: number;
  netTotal: number;
  cogsTotal: number;
  profitTotal: number;
  allocations: PlannedAllocation[];
};

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

function getSizedDisplayName(
  product: {
    name: string;
    variantName: string | null;
  },
  sizeLabel: string | null
) {
  const name = getProductDisplayName(product);
  return sizeLabel ? `${name} - ${sizeLabel}` : name;
}

function isExpired(expiryDate: Date | null, at = new Date()) {
  return Boolean(expiryDate && expiryDate.getTime() < at.getTime());
}

function sortFinishedLots<T extends {
  expiryDate: Date | null;
  producedAt: Date;
}>(lots: T[]) {
  return [...lots].sort((a, b) => {
    if (a.expiryDate && b.expiryDate) {
      const difference = a.expiryDate.getTime() - b.expiryDate.getTime();
      if (difference !== 0) return difference;
    } else if (a.expiryDate) {
      return -1;
    } else if (b.expiryDate) {
      return 1;
    }

    return a.producedAt.getTime() - b.producedAt.getTime();
  });
}

function normalizeNullableText(value: string | null | undefined) {
  return value?.trim() || null;
}

function normalizeCustomerSnapshot(customer: OfficialSiteCustomer) {
  return {
    officialCustomerId: customer.id,
    customerNameSnapshot: customer.name.trim().slice(0, 191),
    customerPhoneSnapshot: (
      customer.phone_normalized ||
      customer.phone ||
      ""
    ).trim().slice(0, 32) || null,
    customerEmailSnapshot: customer.email?.trim().slice(0, 191) || null
  };
}

function getPaymentReference(value: string | null | undefined) {
  return normalizeNullableText(value)?.slice(0, 191) || null;
}

function getReceiptEmail(
  requestedEmail: string | null | undefined,
  customer: OfficialSiteCustomer | null
) {
  const explicitEmail = normalizeNullableText(requestedEmail);
  return explicitEmail || customer?.email?.trim() || null;
}

function assertPaymentInput(payment: z.infer<typeof paymentSchema>) {
  const reference = getPaymentReference(payment.reference);

  if (payment.method === "CASH" && reference) {
    throw new Error("Cash payment cannot contain a payment reference.");
  }

  if (
    payment.method !== "CASH" &&
    payment.tenderedAmount !== undefined &&
    payment.tenderedAmount !== null
  ) {
    throw new Error("Tendered amount is only valid for cash payments.");
  }

  if (
    (payment.method === "CARD" || payment.method === "BANK_TRANSFER") &&
    !reference
  ) {
    throw new Error(
      payment.method === "CARD"
        ? "Card payment reference is required."
        : "Bank transfer reference is required."
    );
  }
}

function getDateOnlyKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeSaleItems(
  items: z.infer<typeof createSaleSchema>["items"]
): NormalizedSaleItem[] {
  const aggregated = new Map<string, NormalizedSaleItem>();

  for (const item of items) {
    const productSizeId = item.productSizeId ?? null;
    const key = `${item.productId}:${productSizeId ?? "standard"}`;
    const previous = aggregated.get(key);

    const qty = round3((previous?.qty ?? 0) + item.qty);

    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error("Sale quantities must be greater than zero.");
    }

    if (Math.abs(item.qty - round3(item.qty)) > 0.0000001) {
      throw new Error("Sale quantities cannot exceed three decimal places.");
    }

    aggregated.set(key, {
      productId: item.productId,
      productSizeId,
      qty
    });
  }

  return [...aggregated.values()];
}

/*
|--------------------------------------------------------------------------
| POS SALES CHANNELS
|--------------------------------------------------------------------------
*/

router.get(
  "/channels",
  requirePermission("erp.pos.access"),
  async (_req, res) => {
    try {
      const channels = await prisma.salesChannel.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" }
      });

      return res.json({ channels });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error
          ? error.message
          : "Failed to load sales channels"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| POS PRODUCT CATALOGUE
|--------------------------------------------------------------------------
|
| Inventory is calculated separately for each product size.
| Expired inventory is never included in sellable quantities.
| Cost and profit information are not exposed here.
|--------------------------------------------------------------------------
*/

router.get(
  "/products",
  requirePermission("erp.pos.access"),
  async (_req, res) => {
    try {
      const now = new Date();

      const products = await prisma.product.findMany({
        where: { isActive: true },
        orderBy: [
          { name: "asc" },
          { variantName: "asc" }
        ],
        include: {
          sizes: {
            orderBy: [
              { sortOrder: "asc" },
              { label: "asc" }
            ]
          },
          finishedGoodsLots: {
            where: {
              remainingQty: { gt: 0 }
            },
            select: {
              productSizeId: true,
              remainingQty: true,
              expiryDate: true
            }
          }
        }
      });

      const catalogue = products.map((product) => {
        const threshold = product.finishedStockAlertQty === null
          ? null
          : Number(product.finishedStockAlertQty);

        const sellableLots = product.finishedGoodsLots.filter(
          (lot) => !isExpired(lot.expiryDate, now)
        );

        const getAvailableQty = (productSizeId: string | null) =>
          round3(
            sellableLots
              .filter((lot) => lot.productSizeId === productSizeId)
              .reduce((total, lot) => total + Number(lot.remainingQty), 0)
          );

        const activeSizes = product.sizes.filter((size) => size.isActive);
        const requiresSize = product.sizes.length > 0;

        const sizes = activeSizes.map((size) => {
          const availableQty = getAvailableQty(size.id);

          return {
            id: size.id,
            productSizeId: size.id,
            label: size.label,
            serves: size.serves,
            officialSiteSizeId: size.officialSiteSizeId,
            price: Number(size.price),
            sellPrice: Number(size.price),
            availableQty,
            inStock: availableQty > 0,
            isInStock: availableQty > 0,
            isLowStock: threshold !== null &&
              availableQty > 0 &&
              availableQty <= threshold
          };
        });

        const standardAvailableQty = getAvailableQty(null);

        const availableQty = requiresSize
          ? round3(sizes.reduce((sum, size) => sum + size.availableQty, 0))
          : standardAvailableQty;

        return {
          id: product.id,
          officialSiteProductId: product.officialSiteProductId,
          name: product.name,
          variantName: product.variantName,
          displayName: getProductDisplayName(product),
          imageUrl: product.imageUrl,
          sellPrice: Number(product.sellPrice),
          availableQty,
          inStock: availableQty > 0,
          isInStock: availableQty > 0,
          isLowStock: threshold !== null &&
            availableQty > 0 &&
            availableQty <= threshold,
          lowStockThreshold: threshold,
          finishedStockAlertQty: product.finishedStockAlertQty,
          requiresSize,
          sizes,
          officialSiteSyncedAt: product.officialSiteSyncedAt
        };
      });

      return res.json({
        products: catalogue,
        count: catalogue.length,
        generatedAt: now.toISOString()
      });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error
          ? error.message
          : "Failed to load POS products"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| MANAGEMENT SALES HISTORY
|--------------------------------------------------------------------------
*/

router.get(
  "/",
  requireRoles("ADMIN", "MANAGER", "ACCOUNT_STAFF"),
  async (_req, res) => {
    try {
      const sales = await prisma.salesOrder.findMany({
        orderBy: { soldAt: "desc" },
        take: 100,
        include: {
          salesChannel: true,
          payments: {
            orderBy: { createdAt: "asc" }
          },
          items: {
            include: {
              product: true,
              productSize: true
            }
          }
        }
      });

      return res.json({
        sales: sales.map((sale) => ({
          id: sale.id,
          orderNo: sale.orderNo,
          posSessionId: sale.posSessionId,
          salesChannel: sale.salesChannel?.name || "Direct",
          paymentMethod: sale.paymentMethod,
          payments: sale.payments,
          officialCustomerId: sale.officialCustomerId,
          customerName: sale.customerNameSnapshot,
          customerPhone: sale.customerPhoneSnapshot,
          customerEmail: sale.customerEmailSnapshot,
          receiptEmail: sale.receiptEmail,
          receiptEmailStatus: sale.receiptEmailStatus,
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
            productSizeId: item.productSizeId,
            productSizeLabel: item.productSize?.label ?? null,
            productDisplayName: getSizedDisplayName(
              item.product,
              item.productSize?.label ?? null
            ),
            qty: item.qty,
            unitSellPrice: item.unitSellPrice,
            lineTotal: item.lineTotal,
            discountTotal: item.discountTotal,
            netTotal: item.netTotal,
            cogsTotal: item.cogsTotal,
            profitTotal: item.profitTotal
          }))
        }))
      });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error
          ? error.message
          : "Failed to load sales"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| MANAGEMENT SALE DETAIL
|--------------------------------------------------------------------------
*/

router.get(
  "/:id",
  requireRoles("ADMIN", "MANAGER", "ACCOUNT_STAFF"),
  async (req, res) => {
    const saleId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;

    if (!saleId) {
      return res.status(400).json({
        message: "Sale ID is required"
      });
    }

    try {
      const sale = await prisma.salesOrder.findUnique({
        where: { id: saleId },
        include: {
          salesChannel: true,
          payments: {
            orderBy: { createdAt: "asc" }
          },
          items: {
            include: {
              product: true,
              productSize: true,
              finishedGoodsConsumptions: {
                include: {
                  finishedGoodsLot: {
                    include: {
                      productionBatch: {
                        select: { batchNo: true }
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
        return res.status(404).json({
          message: "Sale not found"
        });
      }

      return res.json({
        sale: {
          id: sale.id,
          orderNo: sale.orderNo,
          posSessionId: sale.posSessionId,
          salesChannel: sale.salesChannel?.name || "Direct",
          paymentMethod: sale.paymentMethod,
          payments: sale.payments,
          officialCustomerId: sale.officialCustomerId,
          customerName: sale.customerNameSnapshot,
          customerPhone: sale.customerPhoneSnapshot,
          customerEmail: sale.customerEmailSnapshot,
          receiptEmail: sale.receiptEmail,
          receiptEmailStatus: sale.receiptEmailStatus,
          receiptEmailSentAt: sale.receiptEmailSentAt,
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
            productSizeId: item.productSizeId,
            productSizeLabel: item.productSize?.label ?? null,
            productDisplayName: getSizedDisplayName(
              item.product,
              item.productSize?.label ?? null
            ),
            qty: item.qty,
            unitSellPrice: item.unitSellPrice,
            lineTotal: item.lineTotal,
            discountTotal: item.discountTotal,
            netTotal: item.netTotal,
            cogsTotal: item.cogsTotal,
            profitTotal: item.profitTotal,
            finishedGoodsConsumptions: item.finishedGoodsConsumptions.map(
              (consumption) => ({
                id: consumption.id,
                finishedGoodsLotId: consumption.finishedGoodsLotId,
                productSizeId: consumption.finishedGoodsLot.productSizeId,
                batchNo: consumption.finishedGoodsLot.productionBatch.batchNo,
                consumedQty: consumption.consumedQty,
                unitCost: consumption.unitCost,
                costAmount: consumption.costAmount
              })
            )
          }))
        }
      });
    } catch (error) {
      return res.status(500).json({
        message: error instanceof Error
          ? error.message
          : "Failed to load sale"
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| COMPLETE POS SALE
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  requirePermission("erp.pos.access"),
  async (req, res) => {
    const parsed = createSaleSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid sale data",
        errors: parsed.error.flatten()
      });
    }

    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required"
      });
    }

    try {
      if (Boolean(parsed.data.payment) === Boolean(parsed.data.payments)) {
        throw new Error("Provide either payment or payments, not both.");
      }
      for (const entry of parsed.data.payments ?? (parsed.data.payment ? [parsed.data.payment] : [])) {
        assertPaymentInput(entry);
      }
      if (parsed.data.payments && process.env.POS_SPLIT_PAYMENTS_ENABLED !== "true") {
        throw new Error("Split payments are not enabled.");
      }
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error
          ? error.message
          : "Invalid payment data",
        code: "INVALID_PAYMENT_DATA"
      });
    }

    const requestedDiscount = round2(parsed.data.discountTotal || 0);
    const approvalId = parsed.data.approvalId ?? null;
    const idempotencyKey = normalizeNullableText(parsed.data.idempotencyKey);
    const submittedPayments = parsed.data.payments ?? [{ ...parsed.data.payment!, amount: undefined }];
    const primaryPayment = submittedPayments[0];
    const canApplyManualDiscount = hasAnyRole(req, "ADMIN", "MANAGER");

    if (requestedDiscount > 0 && !canApplyManualDiscount && !approvalId) {
      return res.status(403).json({
        message: "Manager approval is required for manual discounts.",
        code: "MANAGER_APPROVAL_REQUIRED",
        approvalType: "MANUAL_DISCOUNT"
      });
    }

    if (requestedDiscount <= 0 && approvalId) {
      return res.status(400).json({
        message: "Approval ID cannot be used without a manual discount.",
        code: "INVALID_APPROVAL_USAGE"
      });
    }

    let normalizedItems: NormalizedSaleItem[];

    try {
      normalizedItems = normalizeSaleItems(parsed.data.items);
    } catch (error) {
      return res.status(400).json({
        message: error instanceof Error
          ? error.message
          : "Invalid sale quantities"
      });
    }

    try {
      /*
       * Check idempotency before contacting the official website.
       */
      if (idempotencyKey) {
        const existingSale = await prisma.salesOrder.findUnique({
          where: { idempotencyKey },
          include: {
            salesChannel: true,
            payments: true,
            items: {
              include: {
                product: true,
                productSize: true
              }
            }
          }
        });

        if (existingSale) {
          return res.status(200).json({
            message: "Sale was already completed",
            idempotentReplay: true,
            sale: existingSale
          });
        }
      }

      /*
       * Resolve official-site customer outside the DB transaction.
       */
      let officialCustomer: OfficialSiteCustomer | null = null;

      if (parsed.data.officialCustomerId) {
        officialCustomer = await getOfficialSiteCustomer(
          parsed.data.officialCustomerId
        );

        if (!officialCustomer) {
          return res.status(404).json({
            message: "Customer was not found on the official website.",
            code: "CUSTOMER_NOT_FOUND"
          });
        }

        if (!officialCustomer.is_active) {
          return res.status(409).json({
            message: "This customer account is inactive.",
            code: "CUSTOMER_INACTIVE"
          });
        }
      }

      const customerSnapshot = officialCustomer
        ? normalizeCustomerSnapshot(officialCustomer)
        : null;

      const receiptEmail = getReceiptEmail(
        parsed.data.receiptEmail,
        officialCustomer
      );

      const soldAt = new Date();
      const sriLankaDate = getSriLankaDateParts(soldAt);

      const createdSale = await runSerializableTransaction(async (tx) => {
        /*
         * Recheck idempotency inside the transaction.
         */
        if (idempotencyKey) {
          const duplicate = await tx.salesOrder.findUnique({
            where: { idempotencyKey },
            select: { id: true }
          });

          if (duplicate) {
            throw new Error("IDEMPOTENT_SALE_ALREADY_EXISTS");
          }
        }

        /*
         * Require an open POS session for the current business date.
         */
        const posSession = await tx.posSession.findFirst({
          where: {
            openedById: req.user!.id,
            status: "OPEN"
          },
          orderBy: { openedAt: "desc" },
          select: {
            id: true,
            sessionNo: true,
            businessDate: true,
            openedAt: true
          }
        });

        if (!posSession) {
          throw new Error("NO_OPEN_POS_SESSION");
        }

        if (getDateOnlyKey(posSession.businessDate) !== sriLankaDate.date) {
          throw new Error("POS_SESSION_BUSINESS_DATE_MISMATCH");
        }

        /*
         * Validate manager discount approval.
         */
        let validatedApprovalId: string | null = null;

        if (requestedDiscount > 0 && !canApplyManualDiscount) {
          if (!approvalId) {
            throw new Error(
              "Manager approval is required for manual discounts."
            );
          }

          const approval = await tx.posApproval.findUnique({
            where: { id: approvalId },
            select: {
              id: true,
              type: true,
              status: true,
              requestedById: true,
              approvedById: true,
              saleId: true,
              amount: true,
              expiresAt: true,
              approvedAt: true,
              usedAt: true
            }
          });

          if (!approval) {
            throw new Error("Manager approval request was not found.");
          }

          if (approval.type !== "MANUAL_DISCOUNT") {
            throw new Error(
              "This approval cannot be used for a manual discount."
            );
          }

          if (approval.requestedById !== req.user!.id) {
            throw new Error(
              "This manager approval belongs to another POS user."
            );
          }

          if (approval.status === "PENDING") {
            throw new Error("Manager approval is still pending.");
          }

          if (approval.status === "REJECTED") {
            throw new Error("Manager approval was rejected.");
          }

          if (approval.status === "EXPIRED") {
            throw new Error("Manager approval has expired.");
          }

          if (approval.status === "USED" || approval.usedAt || approval.saleId) {
            throw new Error("Manager approval has already been used.");
          }

          if (approval.status !== "APPROVED") {
            throw new Error("Manager approval is not valid.");
          }

          if (!approval.approvedById || !approval.approvedAt) {
            throw new Error("Manager approval is incomplete.");
          }

          if (approval.expiresAt.getTime() <= soldAt.getTime()) {
            throw new Error("Manager approval has expired.");
          }

          const approvedAmount = approval.amount === null
            ? null
            : round2(Number(approval.amount));

          if (
            approvedAmount === null ||
            approvedAmount !== requestedDiscount
          ) {
            throw new Error(
              "The approved discount amount does not match the requested discount."
            );
          }

          validatedApprovalId = approval.id;
        }

        /*
         * Validate the selected sales channel.
         */
        if (parsed.data.salesChannelId) {
          const channel = await tx.salesChannel.findFirst({
            where: {
              id: parsed.data.salesChannelId,
              isActive: true
            },
            select: { id: true }
          });

          if (!channel) {
            throw new Error("Active sales channel not found");
          }
        }

        /*
         * Load authoritative product, size and finished-stock data.
         */
        const productIds = [...new Set(
          normalizedItems.map((item) => item.productId)
        )];

        const products = await tx.product.findMany({
          where: {
            id: { in: productIds },
            isActive: true
          },
          include: {
            sizes: {
              select: {
                id: true,
                productId: true,
                label: true,
                price: true,
                isActive: true
              }
            },
            finishedGoodsLots: {
              where: {
                remainingQty: { gt: 0 }
              }
            }
          }
        });

        const productMap = new Map(
          products.map((product) => [product.id, product])
        );

        const missingProduct = productIds.find(
          (productId) => !productMap.has(productId)
        );

        if (missingProduct) {
          throw new Error("One or more active products were not found");
        }

        /*
         * A product with configured sizes must always be sold
         * using an active size, even if all its sizes are inactive.
         */
        const sizeMap = new Map(
          products.flatMap((product) =>
            product.sizes.map((size) => [size.id, size] as const)
          )
        );

        for (const item of normalizedItems) {
          const product = productMap.get(item.productId);

          if (!product) {
            throw new Error("Product not found");
          }

          if (product.sizes.length > 0 && !item.productSizeId) {
            throw new Error(
              `Select a product size for ${getProductDisplayName(product)} before checkout.`
            );
          }

          if (item.productSizeId) {
            const size = sizeMap.get(item.productSizeId);

            if (
              !size ||
              !size.isActive ||
              size.productId !== item.productId
            ) {
              throw new Error(
                "Selected product size is invalid or inactive."
              );
            }
          }
        }

        /*
         * Track quantities locally while planning allocations.
         * This prevents duplicate cart lines from consuming
         * the same available stock twice.
         */
        const lotRemainingMap = new Map<string, number>();

        for (const product of products) {
          for (const lot of product.finishedGoodsLots) {
            lotRemainingMap.set(lot.id, Number(lot.remainingQty));
          }
        }

        const plannedItems: PlannedItem[] = [];

        /*
         * FEFO allocation, strictly separated by product size.
         */
        for (const requestedItem of normalizedItems) {
          const product = productMap.get(requestedItem.productId);

          if (!product) {
            throw new Error("Product not found");
          }

          const selectedSize = requestedItem.productSizeId
            ? sizeMap.get(requestedItem.productSizeId)
            : null;

          const productSizeLabel = selectedSize?.label ?? null;

          const eligibleLots = sortFinishedLots(
            product.finishedGoodsLots.filter(
              (lot) =>
                lot.productSizeId === requestedItem.productSizeId &&
                !isExpired(lot.expiryDate, soldAt)
            )
          );

          let remainingNeed = requestedItem.qty;
          const allocations: PlannedAllocation[] = [];

          for (const lot of eligibleLots) {
            if (remainingNeed <= 0) break;

            const available = lotRemainingMap.get(lot.id) ?? 0;

            if (available <= 0) continue;

            const take = round3(Math.min(remainingNeed, available));

            if (take <= 0) continue;

            const unitCost = Number(lot.unitCost);
            const costAmount = round2(take * unitCost);

            allocations.push({
              finishedGoodsLotId: lot.id,
              consumedQty: take,
              unitCost,
              costAmount
            });

            lotRemainingMap.set(
              lot.id,
              round3(available - take)
            );

            remainingNeed = round3(remainingNeed - take);
          }

          if (remainingNeed > 0) {
            const availableQty = round3(
              requestedItem.qty - remainingNeed
            );

            throw new Error(
              `${getSizedDisplayName(
                product,
                productSizeLabel
              )} has only ${availableQty} sellable item(s) in Bakery Stock.`
            );
          }

          /*
           * Price is always read from the database.
           */
          const unitSellPrice = selectedSize
            ? Number(selectedSize.price)
            : Number(product.sellPrice);

          if (!Number.isFinite(unitSellPrice) || unitSellPrice < 0) {
            throw new Error("Invalid product selling price.");
          }

          const lineTotal = round2(
            requestedItem.qty * unitSellPrice
          );

          const cogsTotal = round2(
            allocations.reduce(
              (sum, allocation) => sum + allocation.costAmount,
              0
            )
          );

          plannedItems.push({
            productId: product.id,
            productSizeId: requestedItem.productSizeId,
            productDisplayName: getSizedDisplayName(
              product,
              productSizeLabel
            ),
            productSizeLabel,
            qty: requestedItem.qty,
            unitSellPrice,
            lineTotal,
            discountTotal: 0,
            netTotal: lineTotal,
            cogsTotal,
            profitTotal: round2(lineTotal - cogsTotal),
            allocations
          });
        }

        /*
         * Calculate totals and distribute manual discount.
         */
        const grossTotal = round2(
          plannedItems.reduce(
            (sum, item) => sum + item.lineTotal,
            0
          )
        );

        if (requestedDiscount > grossTotal) {
          throw new Error(
            "Manual discount cannot exceed the sale gross total."
          );
        }

        const discountTotal = requestedDiscount;
        let allocatedDiscount = 0;

        plannedItems.forEach((item, index) => {
          const remainingDiscount = round2(
            Math.max(discountTotal - allocatedDiscount, 0)
          );

          const proportionalDiscount = grossTotal > 0
            ? round2(discountTotal * item.lineTotal / grossTotal)
            : 0;

          const itemDiscount = index === plannedItems.length - 1
            ? remainingDiscount
            : Math.min(proportionalDiscount, remainingDiscount);

          item.discountTotal = round2(
            Math.max(0, Math.min(itemDiscount, item.lineTotal))
          );

          item.netTotal = round2(
            item.lineTotal - item.discountTotal
          );

          item.profitTotal = round2(
            item.netTotal - item.cogsTotal
          );

          allocatedDiscount = round2(
            allocatedDiscount + item.discountTotal
          );
        });

        const netTotal = round2(grossTotal - discountTotal);

        const cogsTotal = round2(
          plannedItems.reduce(
            (sum, item) => sum + item.cogsTotal,
            0
          )
        );

        const profitTotal = round2(netTotal - cogsTotal);

        /* Validate payment allocations in integer cents to avoid rounding drift. */
        const paymentAllocations = submittedPayments.map((entry) => ({
          ...entry,
          amount: "amount" in entry && typeof entry.amount === "number" ? round2(entry.amount) : netTotal,
        }));
        if (paymentAllocations.some((entry) => entry.amount <= 0) ||
            Math.round(paymentAllocations.reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0)) !== Math.round(netTotal * 100)) {
          throw new Error("Payment allocations must equal the sale total exactly.");
        }
        const normalizedPayments = paymentAllocations.map((entry) => {
          const tenderedAmount = entry.method === "CASH"
            ? round2(entry.tenderedAmount ?? entry.amount)
            : null;
          if (tenderedAmount !== null && tenderedAmount < entry.amount) {
            throw new Error("Cash tendered amount is less than its payment allocation.");
          }
          return {
            method: entry.method,
            amount: entry.amount,
            tenderedAmount,
            changeAmount: tenderedAmount === null ? null : round2(tenderedAmount - entry.amount),
            reference: getPaymentReference(entry.reference),
          };
        });
        const tenderedAmount = normalizedPayments[0].tenderedAmount;
        const changeAmount = normalizedPayments[0].changeAmount;

        const orderNo = await nextDocumentNumber(
          tx,
          "SALE",
          "SAL",
          soldAt
        );

        /*
         * Create the sale.
         */
        const sale = await tx.salesOrder.create({
          data: {
            orderNo,
            salesChannelId: parsed.data.salesChannelId ?? null,
            posSessionId: posSession.id,
            paymentMethod: primaryPayment.method,
            saleType: "POS",
            grossTotal,
            discountTotal,
            netTotal,
            cogsTotal,
            profitTotal,
            status: "COMPLETED",
            createdById: req.user!.id,
            officialCustomerId:
              customerSnapshot?.officialCustomerId ?? null,
            customerNameSnapshot:
              customerSnapshot?.customerNameSnapshot ?? null,
            customerPhoneSnapshot:
              customerSnapshot?.customerPhoneSnapshot ?? null,
            customerEmailSnapshot:
              customerSnapshot?.customerEmailSnapshot ?? null,
            receiptEmail,
            receiptEmailStatus: receiptEmail
              ? "PENDING"
              : "NOT_REQUESTED",
            idempotencyKey,
            soldAt
          }
        });

        /*
         * Create payment ledger entry.
         */
        const payments = [];
        for (const [index, allocation] of normalizedPayments.entries()) {
          const paymentNo = await nextDocumentNumber(tx, "POS_PAYMENT", "PAY", soldAt);
          const payment = await tx.posPayment.create({
            data: {
              paymentNo,
              salesOrderId: sale.id,
              method: allocation.method,
              status: "COMPLETED",
              amount: allocation.amount,
              tenderedAmount: allocation.tenderedAmount,
              changeAmount: allocation.changeAmount,
              reference: allocation.reference,
              idempotencyKey: idempotencyKey ? `${idempotencyKey}:payment:${index}` : null,
              createdById: req.user!.id,
              completedAt: soldAt,
            },
          });
          payments.push(payment);
        }
        const payment = payments[0];

        /*
         * Create sale items and deduct matching finished-goods stock.
         */
        for (const plannedItem of plannedItems) {
          const saleItem = await tx.saleItem.create({
            data: {
              salesOrderId: sale.id,
              productId: plannedItem.productId,
              productSizeId: plannedItem.productSizeId,
              qty: plannedItem.qty,
              unitSellPrice: plannedItem.unitSellPrice,
              lineTotal: plannedItem.lineTotal,
              discountTotal: plannedItem.discountTotal,
              netTotal: plannedItem.netTotal,
              cogsTotal: plannedItem.cogsTotal,
              profitTotal: plannedItem.profitTotal
            }
          });

          for (const allocation of plannedItem.allocations) {
            /*
             * The database independently verifies product, size,
             * expiry and remaining quantity before decrementing.
             */
            const updated = await tx.finishedGoodsLot.updateMany({
              where: {
                id: allocation.finishedGoodsLotId,
                productId: plannedItem.productId,
                productSizeId: plannedItem.productSizeId,
                remainingQty: {
                  gte: allocation.consumedQty
                },
                OR: [
                  { expiryDate: null },
                  { expiryDate: { gte: soldAt } }
                ]
              },
              data: {
                remainingQty: {
                  decrement: allocation.consumedQty
                }
              }
            });

            if (updated.count !== 1) {
              throw new Error(
                "Bakery Stock changed while completing the sale. Please retry."
              );
            }

            await tx.saleFinishedGoodsConsumption.create({
              data: {
                saleItemId: saleItem.id,
                finishedGoodsLotId: allocation.finishedGoodsLotId,
                productId: plannedItem.productId,
                consumedQty: allocation.consumedQty,
                unitCost: allocation.unitCost,
                costAmount: allocation.costAmount
              }
            });

            await tx.finishedGoodsMovement.create({
              data: {
                productId: plannedItem.productId,
                productSizeId: plannedItem.productSizeId,
                stockLotId: allocation.finishedGoodsLotId,
                movementType: "SALE",
                refType: "SALE_ITEM",
                refId: saleItem.id,
                qtyDelta: -allocation.consumedQty,
                unitCost: allocation.unitCost,
                costAmount: allocation.costAmount,
                note: `Sold through ${orderNo}`,
                occurredAt: soldAt
              }
            });
          }
        }

        /*
         * Mark manager approval as used.
         */
        if (validatedApprovalId) {
          const consumedApproval = await tx.posApproval.updateMany({
            where: {
              id: validatedApprovalId,
              type: "MANUAL_DISCOUNT",
              status: "APPROVED",
              requestedById: req.user!.id,
              usedAt: null,
              saleId: null,
              expiresAt: { gt: soldAt }
            },
            data: {
              status: "USED",
              usedAt: soldAt,
              saleId: sale.id
            }
          });

          if (consumedApproval.count !== 1) {
            throw new Error(
              "Manager approval was already used, expired, or changed. Please request a new approval."
            );
          }

          await tx.auditLog.create({
            data: {
              userId: req.user!.id,
              action: "USE",
              entityType: "PosApproval",
              entityId: validatedApprovalId,
              afterJson: {
                approvalType: "MANUAL_DISCOUNT",
                saleId: sale.id,
                orderNo,
                discountTotal,
                usedById: req.user!.id,
                usedAt: soldAt
              }
            }
          });
        }

        /*
         * Audit payment.
         */
        for (const payment of payments) await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "CREATE",
            entityType: "PosPayment",
            entityId: payment.id,
            afterJson: {
              paymentNo: payment.paymentNo,
              saleId: sale.id,
              orderNo,
              posSessionId: posSession.id,
              method: payment.method,
              amount: payment.amount,
              tenderedAmount: payment.tenderedAmount,
              changeAmount: payment.changeAmount,
              reference: payment.reference,
              status: "COMPLETED"
            }
          }
        });

        /*
         * Audit sale, including selected sizes.
         */
        await tx.auditLog.create({
          data: {
            userId: req.user!.id,
            action: "CREATE",
            entityType: "SalesOrder",
            entityId: sale.id,
            afterJson: {
              orderNo,
              posSessionId: posSession.id,
              sessionNo: posSession.sessionNo,
              grossTotal,
              discountTotal,
              netTotal,
              cogsTotal,
              profitTotal,
              paymentMethod: primaryPayment.method,
              paymentId: payment.id,
              paymentNo: payment.paymentNo,
              manualDiscount: discountTotal > 0,
              managerApprovalId: validatedApprovalId,
              cashierUserId: req.user!.id,
              officialCustomerId:
                customerSnapshot?.officialCustomerId ?? null,
              receiptEmail,
              receiptEmailRequested: Boolean(receiptEmail),
              idempotencyKey,
              items: plannedItems.map((item) => ({
                productId: item.productId,
                productSizeId: item.productSizeId,
                productSizeLabel: item.productSizeLabel,
                qty: item.qty,
                unitSellPrice: item.unitSellPrice,
                lineTotal: item.lineTotal
              }))
            }
          }
        });

        await recordPosSaleFinanceJournal(tx, {
          id: sale.id, orderNo, soldAt, businessDate: sriLankaDate.date,
          payments: normalizedPayments.map(({ method, amount }) => ({ method, amount })),
          netTotal, cogsTotal,
          createdById: req.user!.id
        });

        return sale;
      });

      /*
       * Load committed receipt.
       */
      const saleWithDetails = await prisma.salesOrder.findUnique({
        where: { id: createdSale.id },
        include: {
          salesChannel: true,
          posSession: {
            select: {
              id: true,
              sessionNo: true,
              businessDate: true
            }
          },
          payments: {
            orderBy: { createdAt: "asc" }
          },
          items: {
            include: {
              product: true,
              productSize: true
            },
            orderBy: { createdAt: "asc" }
          }
        }
      });

      if (!saleWithDetails) {
        return res.status(500).json({
          message: "Sale completed but receipt data could not be loaded."
        });
      }

      const canViewFinancialData = hasAnyRole(
        req,
        "ADMIN",
        "MANAGER",
        "ACCOUNT_STAFF"
      );

      /*
       * Ordinary cashiers must not receive COGS or profit.
       */
      if (!canViewFinancialData) {
        return res.status(201).json({
          message: "Sale completed successfully",
          sale: {
            id: saleWithDetails.id,
            orderNo: saleWithDetails.orderNo,
            posSession: saleWithDetails.posSession,
            salesChannel: saleWithDetails.salesChannel?.name || "Direct",
            paymentMethod: saleWithDetails.paymentMethod,
            payments: saleWithDetails.payments.map((payment) => ({
              id: payment.id,
              paymentNo: payment.paymentNo,
              method: payment.method,
              status: payment.status,
              amount: payment.amount,
              tenderedAmount: payment.tenderedAmount,
              changeAmount: payment.changeAmount,
              reference: payment.reference,
              completedAt: payment.completedAt
            })),
            customer: {
              officialCustomerId: saleWithDetails.officialCustomerId,
              name: saleWithDetails.customerNameSnapshot,
              phone: saleWithDetails.customerPhoneSnapshot,
              email: saleWithDetails.customerEmailSnapshot
            },
            receiptEmail: saleWithDetails.receiptEmail,
            receiptEmailStatus: saleWithDetails.receiptEmailStatus,
            grossTotal: saleWithDetails.grossTotal,
            discountTotal: saleWithDetails.discountTotal,
            netTotal: saleWithDetails.netTotal,
            status: saleWithDetails.status,
            soldAt: saleWithDetails.soldAt,
            items: saleWithDetails.items.map((item) => ({
              id: item.id,
              productId: item.productId,
              productSizeId: item.productSizeId,
              productSizeLabel: item.productSize?.label ?? null,
              productDisplayName: getSizedDisplayName(
                item.product,
                item.productSize?.label ?? null
              ),
              qty: item.qty,
              unitSellPrice: item.unitSellPrice,
              lineTotal: item.lineTotal,
              discountTotal: item.discountTotal,
              netTotal: item.netTotal
            }))
          }
        });
      }

      return res.status(201).json({
        message: "Sale completed successfully",
        sale: {
          ...saleWithDetails,
          items: saleWithDetails.items.map((item) => ({
            ...item,
            productSizeLabel: item.productSize?.label ?? null,
            productDisplayName: getSizedDisplayName(
              item.product,
              item.productSize?.label ?? null
            )
          }))
        }
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Failed to complete sale";

      /*
       * Handle concurrent idempotent requests.
       */
      if (
        idempotencyKey &&
        (
          message === "IDEMPOTENT_SALE_ALREADY_EXISTS" ||
          message.includes("Unique constraint")
        )
      ) {
        const existingSale = await prisma.salesOrder.findUnique({
          where: { idempotencyKey },
          include: {
            salesChannel: true,
            posSession: true,
            payments: true,
            items: {
              include: {
                product: true,
                productSize: true
              }
            }
          }
        });

        if (existingSale) {
          return res.status(200).json({
            message: "Sale was already completed",
            idempotentReplay: true,
            sale: existingSale
          });
        }
      }

      if (message === "NO_OPEN_POS_SESSION") {
        return res.status(409).json({
          message: "You must open a POS session before completing a sale.",
          code: "NO_OPEN_POS_SESSION"
        });
      }

      if (message === "POS_SESSION_BUSINESS_DATE_MISMATCH") {
        return res.status(409).json({
          message:
            "Your POS session belongs to a different business date. Complete day end and open a new session.",
          code: "POS_SESSION_BUSINESS_DATE_MISMATCH"
        });
      }

      return res.status(400).json({ message });
    }
  }
);

export default router;
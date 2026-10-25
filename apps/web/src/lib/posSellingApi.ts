/** @format */

import { apiRequest } from "./api";

/* =========================================================
   COMMON
========================================================= */

export type PosPaymentMethod =
  | "CASH"
  | "CARD"
  | "BANK_TRANSFER"
  | "ONLINE"
  | "OTHER";

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function round3(value: number): number {
  return Number(value.toFixed(3));
}

/* =========================================================
   PRODUCTS
========================================================= */

export type PosProductSize = {
  id: string;
  label: string;

  serves?: string | null;

  price: number;

  officialSiteSizeId?: number | null;

  availableQty: number;

  inStock: boolean;

  isLowStock: boolean;
};

export type PosProduct = {
  id: string;

  officialSiteProductId?: string | number | null;

  name: string;

  variantName?: string | null;

  displayName: string;

  imageUrl?: string | null;

  sellPrice: number;

  sizes: PosProductSize[];

  availableQty: number;

  inStock: boolean;

  hasSizes?: boolean;

  lowStockThreshold?: number | null;

  isLowStock?: boolean;

  legacyAvailableQty?: number;

  officialSiteSyncedAt?: string | null;
};

/* =========================================================
   RAW API TYPES
========================================================= */

type RawPosProductSize = {
  id: string;

  label: string;

  serves?: string | null;

  price: number | string;

  officialSiteSizeId?: number | null;

  availableQty?: number | string | null;

  inStock?: boolean;

  isLowStock?: boolean;
};

type RawPosProduct = {
  id: string;

  officialSiteProductId?: string | number | null;

  name: string;

  variantName?: string | null;

  displayName?: string;

  imageUrl?: string | null;

  sellPrice: number | string;

  sizes?: RawPosProductSize[];

  availableQty?: number | string | null;

  inStock?: boolean;

  hasSizes?: boolean;

  lowStockThreshold?: number | string | null;

  isLowStock?: boolean;

  legacyAvailableQty?: number | string | null;

  officialSiteSyncedAt?: string | null;
};

export type PosProductListResponse = {
  products: RawPosProduct[];

  count?: number;

  generatedAt?: string;

  [key: string]: unknown;
};

/* =========================================================
   NORMALIZE PRODUCT SIZES
========================================================= */

function normalizeProductSize(
  size: RawPosProductSize,
  lowStockThreshold: number | null
): PosProductSize {
  const availableQty = Math.max(
    0,
    round3(toNumber(size.availableQty))
  );

  const inStock = availableQty > 0;

  const isLowStock =
    size.isLowStock ??
    (lowStockThreshold !== null &&
      availableQty > 0 &&
      availableQty <= lowStockThreshold);

  return {
    id: size.id,

    label: size.label,

    serves: size.serves ?? null,

    price: toNumber(size.price),

    officialSiteSizeId: size.officialSiteSizeId ?? null,

    availableQty,

    inStock,

    isLowStock
  };
}

/* =========================================================
   NORMALIZE PRODUCT
========================================================= */

function normalizeProduct(
  product: RawPosProduct
): PosProduct {
  const lowStockThreshold =
    product.lowStockThreshold === null ||
    product.lowStockThreshold === undefined
      ? null
      : toNumber(product.lowStockThreshold);

  const sizes = (product.sizes ?? []).map((size) =>
    normalizeProductSize(size, lowStockThreshold)
  );

  const hasSizes = sizes.length > 0;

  /*
   * Products with sizes use the combined stock
   * of their active sizes.
   *
   * Legacy stock without a size must not be
   * counted as stock for Regular, Large, etc.
   */
  const availableQty = hasSizes
    ? round3(
        sizes.reduce(
          (total, size) => total + size.availableQty,
          0
        )
      )
    : Math.max(
        0,
        round3(toNumber(product.availableQty))
      );

  const inStock = availableQty > 0;

  const isLowStock = hasSizes
    ? sizes.some((size) => size.isLowStock)
    : product.isLowStock ??
      (lowStockThreshold !== null &&
        availableQty > 0 &&
        availableQty <= lowStockThreshold);

  const displayName =
    product.displayName?.trim() ||
    (product.variantName
      ? `${product.name} - ${product.variantName}`
      : product.name);

  return {
    id: product.id,

    officialSiteProductId:
      product.officialSiteProductId ?? null,

    name: product.name,

    variantName: product.variantName ?? null,

    displayName,

    imageUrl: product.imageUrl ?? null,

    sellPrice: toNumber(product.sellPrice),

    sizes,

    availableQty,

    inStock,

    hasSizes,

    lowStockThreshold,

    isLowStock,

    legacyAvailableQty: Math.max(
      0,
      round3(toNumber(product.legacyAvailableQty))
    ),

    officialSiteSyncedAt:
      product.officialSiteSyncedAt ?? null
  };
}

/* =========================================================
   GET POS PRODUCTS
========================================================= */

export async function getPosProducts() {
  const response = await apiRequest<PosProductListResponse>(
    "/pos-catalogue/products"
  );

  return {
    ...response,

    products: (response.products ?? []).map(
      normalizeProduct
    )
  };
}

/* =========================================================
   CUSTOMERS
========================================================= */

export type PosCustomer = {
  id: number;

  name: string;

  phone?: string | null;

  phone_normalized?: string | null;

  email?: string | null;

  default_delivery_address?: string | null;

  is_active?: boolean;

  [key: string]: unknown;
};

export type PosCustomerLookupResponse = {
  found: boolean;

  customer: PosCustomer | null;
};

export async function lookupPosCustomer(
  phone: string
) {
  return apiRequest<PosCustomerLookupResponse>(
    `/pos-customers/lookup?phone=${encodeURIComponent(
      phone.trim()
    )}`
  );
}

/* =========================================================
   REGISTER CUSTOMER
========================================================= */

export type RegisterPosCustomerPayload = {
  name: string;

  phone: string;

  email?: string | null;

  defaultDeliveryAddress?: string | null;
};

export type RegisterPosCustomerResponse = {
  message: string;

  customer: PosCustomer;
};

export async function registerPosCustomer(
  payload: RegisterPosCustomerPayload
) {
  return apiRequest<RegisterPosCustomerResponse>(
    "/pos-customers",
    {
      method: "POST",

      body: JSON.stringify(payload)
    }
  );
}

/* =========================================================
   SALE INPUT
========================================================= */

export type PosSaleItemInput = {
  productId: string;

  productSizeId?: string | null;

  qty: number;
};

export type CompletePosSalePayload = {
  salesChannelId?: string | null;

  officialCustomerId?: number | null;

  receiptEmail?: string | null;

  discountTotal: number;

  approvalId?: string | null;

  idempotencyKey?: string | null;

  payment?: {
    method: PosPaymentMethod;
    tenderedAmount?: number | null;
    reference?: string | null;
  };
  payments?: Array<{
    method: PosPaymentMethod;
    amount: number;
    tenderedAmount?: number | null;
    reference?: string | null;
  }>;

  items: PosSaleItemInput[];
};

/* =========================================================
   RECEIPT PAYMENT
========================================================= */

export type PosReceiptPayment = {
  id?: string;

  paymentNo?: string;

  method: PosPaymentMethod;

  status?: string;

  amount: number | string;

  tenderedAmount?: number | string | null;

  changeAmount?: number | string | null;

  reference?: string | null;

  completedAt?: string | null;
};

/* =========================================================
   RECEIPT ITEMS
========================================================= */

export type PosReceiptItem = {
  id?: string;

  productId: string;

  productSizeId?: string | null;

  productSizeLabel?: string | null;

  productDisplayName?: string;

  product?: {
    name?: string;

    variantName?: string | null;
  };

  qty: number | string;

  unitSellPrice: number | string;

  lineTotal: number | string;

  discountTotal: number | string;

  netTotal: number | string;
};

/* =========================================================
   COMPLETED SALE
========================================================= */

export type CompletedPosSale = {
  id: string;

  orderNo: string;

  posSession?: {
    id: string;

    sessionNo: string;

    businessDate: string;
  } | null;

  salesChannel?:
    | string
    | {
        id?: string;

        name?: string;
      }
    | null;

  paymentMethod: PosPaymentMethod;

  payments: PosReceiptPayment[];

  customer?: {
    officialCustomerId?: number | null;

    name?: string | null;

    phone?: string | null;

    email?: string | null;
  } | null;

  officialCustomerId?: number | null;

  customerNameSnapshot?: string | null;

  customerPhoneSnapshot?: string | null;

  customerEmailSnapshot?: string | null;

  receiptEmail?: string | null;

  receiptEmailStatus?: string | null;

  grossTotal: number | string;

  discountTotal: number | string;

  netTotal: number | string;

  cogsTotal?: number | string;

  profitTotal?: number | string;

  status: string;

  soldAt: string;

  items: PosReceiptItem[];

  [key: string]: unknown;
};

export type CompletePosSaleResponse = {
  message: string;

  idempotentReplay?: boolean;

  sale: CompletedPosSale;
};

/* =========================================================
   COMPLETE POS SALE
========================================================= */

export async function completePosSale(
  payload: CompletePosSalePayload
) {
  return apiRequest<CompletePosSaleResponse>(
    "/sales",
    {
      method: "POST",

      body: JSON.stringify(payload)
    }
  );
}
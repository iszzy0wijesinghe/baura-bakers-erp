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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/* =========================================================
   PRODUCTS
========================================================= */

export type PosProduct = {
  id: string;
  officialSiteProductId?: string | number | null;

  name: string;
  variantName?: string | null;
  displayName: string;

  imageUrl?: string | null;

  sellPrice: number;
  availableQty: number;

  inStock: boolean;

  lowStockThreshold?: number | null;
  isLowStock?: boolean;

  officialSiteSyncedAt?: string | null;
};

type RawPosProduct = {
  id: string;

  officialSiteProductId?: string | number | null;

  name: string;

  variantName?: string | null;

  displayName?: string;

  imageUrl?: string | null;

  sellPrice:
    | number
    | string;

  availableQty:
    | number
    | string;

  inStock?: boolean;

  lowStockThreshold?:
    | number
    | string
    | null;

  isLowStock?: boolean;

  officialSiteSyncedAt?: string | null;
};

export type PosProductListResponse = {
  products: RawPosProduct[];

  [key: string]: unknown;
};

function normalizeProduct(
  product: RawPosProduct,
): PosProduct {
  const availableQty =
    toNumber(
      product.availableQty,
    );

  const lowStockThreshold =
    product.lowStockThreshold ===
      null ||
    product.lowStockThreshold ===
      undefined
      ? null
      : toNumber(
          product.lowStockThreshold,
        );

  return {
    id:
      product.id,

    officialSiteProductId:
      product.officialSiteProductId ??
      null,

    name:
      product.name,

    variantName:
      product.variantName ??
      null,

    displayName:
      product.displayName ||
      (
        product.variantName
          ? `${product.name} - ${product.variantName}`
          : product.name
      ),

    imageUrl:
      product.imageUrl ??
      null,

    sellPrice:
      toNumber(
        product.sellPrice,
      ),

    availableQty,

    inStock:
      product.inStock ??
      availableQty > 0,

    lowStockThreshold,

    isLowStock:
      product.isLowStock ??
      (
        lowStockThreshold !==
          null &&
        availableQty <=
          lowStockThreshold
      ),

    officialSiteSyncedAt:
      product.officialSiteSyncedAt ??
      null,
  };
}

export async function getPosProducts() {
  const response =
    await apiRequest<PosProductListResponse>(
      "/pos-catalogue/products",
    );

  return {
    ...response,

    products:
      (
        response.products ||
        []
      ).map(
        normalizeProduct,
      ),
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
  phone: string,
) {
  return apiRequest<PosCustomerLookupResponse>(
    `/pos-customers/lookup?phone=${encodeURIComponent(
      phone.trim(),
    )}`,
  );
}

export type RegisterPosCustomerPayload = {
  name: string;
  phone: string;

  email?:
    | string
    | null;

  defaultDeliveryAddress?:
    | string
    | null;
};

export type RegisterPosCustomerResponse = {
  message: string;
  customer: PosCustomer;
};

export async function registerPosCustomer(
  payload:
    RegisterPosCustomerPayload,
) {
  return apiRequest<RegisterPosCustomerResponse>(
    "/pos-customers",
    {
      method: "POST",

      body:
        JSON.stringify(
          payload,
        ),
    },
  );
}

/* =========================================================
   SALE
========================================================= */

export type PosSaleItemInput = {
  productId: string;
  qty: number;
};

export type CompletePosSalePayload = {
  salesChannelId?:
    | string
    | null;

  officialCustomerId?:
    | number
    | null;

  receiptEmail?:
    | string
    | null;

  discountTotal: number;

  approvalId?:
    | string
    | null;

  idempotencyKey?:
    | string
    | null;

  payment: {
    method:
      PosPaymentMethod;

    tenderedAmount?:
      | number
      | null;

    reference?:
      | string
      | null;
  };

  items:
    PosSaleItemInput[];
};

export type PosReceiptPayment = {
  id?: string;

  paymentNo?: string;

  method:
    PosPaymentMethod;

  status?: string;

  amount:
    | number
    | string;

  tenderedAmount?:
    | number
    | string
    | null;

  changeAmount?:
    | number
    | string
    | null;

  reference?:
    | string
    | null;

  completedAt?:
    | string
    | null;
};

export type PosReceiptItem = {
  id?: string;

  productId: string;

  productDisplayName?: string;

  product?: {
    name?: string;
    variantName?: string | null;
  };

  qty:
    | number
    | string;

  unitSellPrice:
    | number
    | string;

  lineTotal:
    | number
    | string;

  discountTotal:
    | number
    | string;

  netTotal:
    | number
    | string;
};

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

  paymentMethod:
    PosPaymentMethod;

  payments:
    PosReceiptPayment[];

  customer?: {
    officialCustomerId?:
      | number
      | null;

    name?:
      | string
      | null;

    phone?:
      | string
      | null;

    email?:
      | string
      | null;
  } | null;

  officialCustomerId?:
    | number
    | null;

  customerNameSnapshot?:
    | string
    | null;

  customerPhoneSnapshot?:
    | string
    | null;

  customerEmailSnapshot?:
    | string
    | null;

  receiptEmail?:
    | string
    | null;

  receiptEmailStatus?:
    | string
    | null;

  grossTotal:
    | number
    | string;

  discountTotal:
    | number
    | string;

  netTotal:
    | number
    | string;

  status: string;

  soldAt: string;

  items:
    PosReceiptItem[];

  [key: string]: unknown;
};

export type CompletePosSaleResponse = {
  message: string;

  idempotentReplay?: boolean;

  sale:
    CompletedPosSale;
};

export async function completePosSale(
  payload:
    CompletePosSalePayload,
) {
  return apiRequest<CompletePosSaleResponse>(
    "/sales",
    {
      method: "POST",

      body:
        JSON.stringify(
          payload,
        ),
    },
  );
}
import {
  env,
} from "../config/env";

/* =======================================================
   SHARED TYPES
======================================================= */

export type OfficialSiteProductSize = {
  id: number;
  label: string;
  serves: string | null;
  price_lkr: number;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
};

export type OfficialSiteProductImage = {
  id: number;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
};

export type OfficialSiteProductCategory = {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
};

export type OfficialSiteProduct = {
  id: number;
  slug: string;
  name: string;
  slogan: string | null;
  short_description: string | null;
  description: string | null;
  thumbnail_url: string | null;
  is_combo: boolean;
  sort_order: number;
  is_active: boolean;

  category:
    | OfficialSiteProductCategory
    | null;

  subcategory:
    | OfficialSiteProductCategory
    | null;

  sizes:
    OfficialSiteProductSize[];

  images:
    OfficialSiteProductImage[];

  created_at: string;
  updated_at: string;
};

export type OfficialSiteCustomer = {
  id: number;
  name: string;
  phone: string | null;
  phone_normalized: string | null;
  email: string | null;
  default_delivery_address:
    | string
    | null;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateOfficialSiteCustomerInput = {
  name: string;
  phone: string;
  email?: string | null;
  default_delivery_address?:
    | string
    | null;
};

/* =======================================================
   RESPONSE TYPES
======================================================= */

type ProductsResponse = {
  products:
    OfficialSiteProduct[];

  pagination: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    has_more: boolean;
  };

  meta?: {
    source?: string;
    generated_at?: string;
  };
};

type CustomerLookupResponse = {
  found: boolean;

  customer:
    | OfficialSiteCustomer
    | null;
};

type CustomerResponse = {
  customer:
    OfficialSiteCustomer;
};

type CreateCustomerResponse = {
  message: string;

  customer:
    OfficialSiteCustomer;
};

type OfficialSiteErrorPayload = {
  message?: unknown;
  code?: unknown;
  errors?: unknown;
  customer?: unknown;
};

/* =======================================================
   ERROR
======================================================= */

export class OfficialSiteApiError extends Error {
  readonly status: number;

  readonly code:
    | string
    | null;

  readonly errors:
    unknown;

  readonly payload:
    OfficialSiteErrorPayload | null;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string | null;
      errors?: unknown;
      payload?:
        | OfficialSiteErrorPayload
        | null;
    },
  ) {
    super(message);

    this.name =
      "OfficialSiteApiError";

    this.status =
      options.status;

    this.code =
      options.code ?? null;

    this.errors =
      options.errors ?? null;

    this.payload =
      options.payload ?? null;
  }
}

/* =======================================================
   HTTP HELPERS
======================================================= */

function buildUrl(
  path: string,
): string {
  const base =
    env.OFFICIAL_SITE_API_URL
      .replace(
        /\/+$/,
        "",
      );

  const normalizedPath =
    path.startsWith("/")
      ? path
      : `/${path}`;

  return `${base}${normalizedPath}`;
}

async function readJson(
  response: Response,
): Promise<unknown> {
  const text =
    await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(
      text,
    ) as unknown;
  } catch {
    return null;
  }
}

async function request<T>(
  path: string,
  options?: {
    method?:
      | "GET"
      | "POST";

    body?: unknown;

    timeoutMs?: number;
  },
): Promise<T> {
  const method =
    options?.method ??
    "GET";

  const headers:
    Record<string, string> = {
      Accept:
        "application/json",

      Authorization:
        `Bearer ${env.ERP_INTEGRATION_TOKEN}`,
  };

  let body:
    | string
    | undefined;

  if (
    options?.body !==
    undefined
  ) {
    headers[
      "Content-Type"
    ] =
      "application/json";

    body =
      JSON.stringify(
        options.body,
      );
  }

  let response:
    Response;

  try {
    response =
      await fetch(
        buildUrl(path),
        {
          method,
          headers,
          body,

          signal:
            AbortSignal.timeout(
              options?.timeoutMs ??
                15_000,
            ),
        },
      );
  } catch (error) {
    console.error(
      "Official-site API request failed:",
      error,
    );

    throw new OfficialSiteApiError(
      "Official site service is temporarily unavailable.",
      {
        status:
          503,

        code:
          "OFFICIAL_SITE_UNAVAILABLE",
      },
    );
  }

  const payload =
    await readJson(
      response,
    );

  if (
    !response.ok
  ) {
    const errorPayload =
      payload &&
      typeof payload ===
        "object"
        ? payload as OfficialSiteErrorPayload
        : null;

    const message =
      typeof errorPayload
        ?.message ===
        "string" &&
      errorPayload.message
        .trim()
        ? errorPayload.message
        : `Official site API returned ${response.status}`;

    const code =
      typeof errorPayload
        ?.code ===
        "string"
        ? errorPayload.code
        : null;

    throw new OfficialSiteApiError(
      message,
      {
        status:
          response.status,

        code,

        errors:
          errorPayload
            ?.errors ??
          null,

        payload:
          errorPayload,
      },
    );
  }

  if (
    payload === null
  ) {
    throw new OfficialSiteApiError(
      "Official site API returned an invalid response.",
      {
        status:
          502,

        code:
          "INVALID_OFFICIAL_SITE_RESPONSE",
      },
    );
  }

  return payload as T;
}

/* =======================================================
   PRODUCTS
======================================================= */

export async function getOfficialSiteProducts(): Promise<
  OfficialSiteProduct[]
> {
  const products:
    OfficialSiteProduct[] =
      [];

  let page =
    1;

  while (true) {
    const response =
      await request<ProductsResponse>(
        `/api/v1/integrations/erp/products?page=${page}&per_page=100`,
      );

    products.push(
      ...response.products,
    );

    if (
      !response.pagination
        .has_more
    ) {
      break;
    }

    page +=
      1;

    if (
      page > 1000
    ) {
      throw new Error(
        "Official product pagination exceeded the safety limit.",
      );
    }
  }

  return products;
}

/* =======================================================
   CUSTOMERS
======================================================= */

export async function findOfficialSiteCustomerByPhone(
  phone: string,
): Promise<
  OfficialSiteCustomer | null
> {
  const normalizedInput =
    phone.trim();

  if (!normalizedInput) {
    throw new OfficialSiteApiError(
      "Customer phone number is required.",
      {
        status:
          400,

        code:
          "PHONE_REQUIRED",
      },
    );
  }

  const query =
    new URLSearchParams({
      phone:
        normalizedInput,
    });

  const response =
    await request<CustomerLookupResponse>(
      `/api/v1/integrations/erp/customers?${query.toString()}`,
    );

  if (
    !response.found
  ) {
    return null;
  }

  return (
    response.customer ??
    null
  );
}

export async function getOfficialSiteCustomer(
  customerId: number,
): Promise<
  OfficialSiteCustomer
> {
  const response =
    await request<CustomerResponse>(
      `/api/v1/integrations/erp/customers/${customerId}`,
    );

  return response.customer;
}

export async function createOfficialSiteCustomer(
  input:
    CreateOfficialSiteCustomerInput,
): Promise<
  OfficialSiteCustomer
> {
  const response =
    await request<CreateCustomerResponse>(
      "/api/v1/integrations/erp/customers",
      {
        method:
          "POST",

        body: {
          name:
            input.name.trim(),

          phone:
            input.phone.trim(),

          email:
            input.email
              ?.trim() ||
            null,

          default_delivery_address:
            input
              .default_delivery_address
              ?.trim() ||
            null,
        },
      },
    );

  return response.customer;
}
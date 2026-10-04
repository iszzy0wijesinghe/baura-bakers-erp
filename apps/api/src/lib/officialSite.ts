import {
  env,
} from "../config/env";

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

type ProductsResponse = {
  products: OfficialSiteProduct[];

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

async function request<T>(
  path: string,
): Promise<T> {
  const response =
    await fetch(
      buildUrl(path),
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json",

          Authorization:
            `Bearer ${env.ERP_INTEGRATION_TOKEN}`,
        },

        signal:
          AbortSignal.timeout(
            15_000,
          ),
      },
    );

  if (
    !response.ok
  ) {
    let message =
      `Official site API returned ${response.status}`;

    try {
      const payload =
        await response.json() as {
          message?: unknown;
        };

      if (
        typeof payload.message ===
          "string" &&
        payload.message.trim()
      ) {
        message =
          payload.message;
      }
    } catch {
      // Keep generic message.
    }

    throw new Error(
      message,
    );
  }

  return await response.json() as T;
}

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
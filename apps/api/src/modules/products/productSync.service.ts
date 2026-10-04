import {
  Prisma,
} from "@prisma/client";

import {
  getOfficialSiteProducts,
  type OfficialSiteProduct,
} from "../../lib/officialSite";

import {
  prisma,
} from "../../lib/prisma";

/* =======================================================
   OFFICIAL PRODUCT HELPERS
======================================================= */

function getPrimarySize(
  product: OfficialSiteProduct,
) {
  const activeSizes =
    [...product.sizes]
      .filter(
        (size) =>
          size.is_active,
      )
      .sort(
        (
          first,
          second,
        ) =>
          first.sort_order -
          second.sort_order,
      );

  return (
    activeSizes[0] ??
    product.sizes[0] ??
    null
  );
}

function getProductImage(
  product: OfficialSiteProduct,
): string | null {
  const thumbnail =
    product.thumbnail_url
      ?.trim();

  if (thumbnail) {
    return thumbnail;
  }

  const firstImage =
    [...product.images]
      .filter(
        (image) =>
          Boolean(
            image.image_url
              ?.trim(),
          ),
      )
      .sort(
        (
          first,
          second,
        ) =>
          first.sort_order -
          second.sort_order,
      )[0];

  return (
    firstImage
      ?.image_url
      ?.trim() ||
    null
  );
}

function getVariantName(
  product: OfficialSiteProduct,
): string | null {
  const size =
    getPrimarySize(
      product,
    );

  const label =
    size?.label
      ?.trim();

  return label || null;
}

function getSellPrice(
  product: OfficialSiteProduct,
): Prisma.Decimal {
  const size =
    getPrimarySize(
      product,
    );

  return new Prisma.Decimal(
    size?.price_lkr ?? 0,
  );
}

/* =======================================================
   SYNC
======================================================= */

export async function syncOfficialSiteProducts() {
  const officialProducts =
    await getOfficialSiteProducts();

  const syncedAt =
    new Date();

  let created = 0;
  let updated = 0;
  let deactivated = 0;

  const officialProductIds =
    officialProducts.map(
      (product) =>
        product.id,
    );

  /*
   * Synchronize canonical product information.
   *
   * ERP-owned operational data such as:
   *
   * - recipes
   * - stock thresholds
   * - production history
   * - finished stock
   * - sales
   *
   * is intentionally not modified here.
   */
  for (
    const officialProduct
    of officialProducts
  ) {
    const existing =
      await prisma.product.findUnique({
        where: {
          officialSiteProductId:
            officialProduct.id,
        },

        select: {
          id: true,
        },
      });

    const synchronizedData = {
      name:
        officialProduct.name
          .trim(),

      variantName:
        getVariantName(
          officialProduct,
        ),

      imageUrl:
        getProductImage(
          officialProduct,
        ),

      sellPrice:
        getSellPrice(
          officialProduct,
        ),

      isActive:
        officialProduct
          .is_active,

      officialSiteSyncedAt:
        syncedAt,
    };

    if (existing) {
      await prisma.product.update({
        where: {
          id:
            existing.id,
        },

        data:
          synchronizedData,
      });

      updated += 1;

      continue;
    }

    await prisma.product.create({
      data: {
        officialSiteProductId:
          officialProduct.id,

        ...synchronizedData,
      },
    });

    created += 1;
  }

  /*
   * If an already-linked website product no longer appears
   * in the canonical website response, do NOT delete it.
   *
   * Historical ERP records may depend on that Product row.
   * We only make it unavailable for new operations.
   *
   * IMPORTANT:
   * Only website-linked products are affected.
   * Existing legacy ERP-only products are untouched while
   * we complete the migration.
   */
  if (
    officialProductIds.length >
    0
  ) {
    const result =
      await prisma.product.updateMany({
        where: {
          officialSiteProductId: {
            not: null,

            notIn:
              officialProductIds,
          },

          isActive:
            true,
        },

        data: {
          isActive:
            false,
        },
      });

    deactivated =
      result.count;
  }

  return {
    received:
      officialProducts.length,

    created,

    updated,

    deactivated,

    syncedAt,
  };
}
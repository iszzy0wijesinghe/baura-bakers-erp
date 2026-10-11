import { Prisma } from "@prisma/client";

import {
  getOfficialSiteProducts,
  type OfficialSiteProduct
} from "../../lib/officialSite";
import { prisma } from "../../lib/prisma";

function getPrimarySize(product: OfficialSiteProduct) {
  const sortedSizes = [...product.sizes].sort(
    (first, second) => first.sort_order - second.sort_order
  );

  return sortedSizes.find((size) => size.is_active) ?? sortedSizes[0] ?? null;
}

function getProductImage(product: OfficialSiteProduct): string | null {
  const thumbnail = product.thumbnail_url?.trim();

  if (thumbnail) {
    return thumbnail;
  }

  const firstImage = [...product.images]
    .filter((image) => Boolean(image.image_url?.trim()))
    .sort((first, second) => first.sort_order - second.sort_order)[0];

  return firstImage?.image_url?.trim() || null;
}

function parseOfficialDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid official website date: ${value}`);
  }

  return date;
}

function validateCatalogue(products: OfficialSiteProduct[]) {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error(
      "Official website returned an empty or invalid catalogue. Synchronization cancelled."
    );
  }

  const productIds = new Set<number>();
  const sizeIds = new Set<number>();

  for (const product of products) {
    if (!Number.isSafeInteger(product.id) || product.id <= 0) {
      throw new Error("Official catalogue contains an invalid product ID.");
    }

    if (productIds.has(product.id)) {
      throw new Error(`Duplicate official product ID: ${product.id}`);
    }

    productIds.add(product.id);

    if (!product.name?.trim()) {
      throw new Error(`Official product ${product.id} has no name.`);
    }

    if (
      !Array.isArray(product.sizes) ||
      !Array.isArray(product.images)
    ) {
      throw new Error(
        `Official product ${product.id} has invalid sizes or images.`
      );
    }

    for (const size of product.sizes) {
      if (!Number.isSafeInteger(size.id) || size.id <= 0) {
        throw new Error(
          `Official product ${product.id} contains an invalid size ID.`
        );
      }

      if (sizeIds.has(size.id)) {
        throw new Error(`Duplicate official size ID: ${size.id}`);
      }

      sizeIds.add(size.id);

      if (!size.label?.trim()) {
        throw new Error(`Official size ${size.id} has no label.`);
      }

      const price = Number(size.price_lkr);

      if (!Number.isFinite(price) || price < 0) {
        throw new Error(`Invalid price for official size ${size.id}.`);
      }

      if (!Number.isSafeInteger(size.sort_order)) {
        throw new Error(`Invalid sort order for official size ${size.id}.`);
      }

      parseOfficialDate(size.updated_at);
    }
  }
}

export async function syncOfficialSiteProducts() {
  const officialProducts = await getOfficialSiteProducts();

  validateCatalogue(officialProducts);

  const syncedAt = new Date();
  const officialProductIds = officialProducts.map((product) => product.id);

  let created = 0;
  let updated = 0;
  let deactivated = 0;
  let sizesCreated = 0;
  let sizesUpdated = 0;
  let sizesDeactivated = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const officialProduct of officialProducts) {
        const primarySize = getPrimarySize(officialProduct);

        const synchronizedData = {
          name: officialProduct.name.trim(),
          variantName: primarySize?.label?.trim() || null,
          imageUrl: getProductImage(officialProduct),
          sellPrice: new Prisma.Decimal(
            primarySize?.price_lkr ?? 0
          ),
          isActive: officialProduct.is_active,
          officialSiteSyncedAt: syncedAt
        };

        const existingProduct = await tx.product.findUnique({
          where: {
            officialSiteProductId: officialProduct.id
          },
          select: {
            id: true
          }
        });

        const product = existingProduct
          ? await tx.product.update({
              where: {
                id: existingProduct.id
              },
              data: synchronizedData
            })
          : await tx.product.create({
              data: {
                officialSiteProductId: officialProduct.id,
                ...synchronizedData
              }
            });

        if (existingProduct) {
          updated++;
        } else {
          created++;
        }

        const officialSizeIds: number[] = [];

        for (const size of officialProduct.sizes) {
          officialSizeIds.push(size.id);

          const existingSize = await tx.productSize.findUnique({
            where: {
              officialSiteSizeId: size.id
            },
            select: {
              id: true,
              productId: true
            }
          });

          if (existingSize && existingSize.productId !== product.id) {
            throw new Error(
              `Official size ${size.id} belongs to a different ERP product. Synchronization cancelled.`
            );
          }

          const sizeData = {
            label: size.label.trim(),
            serves: size.serves ?? null,
            price: new Prisma.Decimal(size.price_lkr),
            sortOrder: size.sort_order,
            isActive: officialProduct.is_active && size.is_active,
            officialSiteUpdatedAt: parseOfficialDate(size.updated_at),
            syncedAt
          };

          if (existingSize) {
            await tx.productSize.update({
              where: {
                id: existingSize.id
              },
              data: sizeData
            });

            sizesUpdated++;
          } else {
            await tx.productSize.create({
              data: {
                productId: product.id,
                officialSiteSizeId: size.id,
                ...sizeData
              }
            });

            sizesCreated++;
          }
        }

        const removedSizes = await tx.productSize.updateMany({
          where: {
            productId: product.id,
            officialSiteSizeId: {
              notIn: officialSizeIds
            },
            isActive: true
          },
          data: {
            isActive: false,
            syncedAt
          }
        });

        sizesDeactivated += removedSizes.count;
      }

      const missingProducts = await tx.product.findMany({
        where: {
          officialSiteProductId: {
            not: null,
            notIn: officialProductIds
          },
          isActive: true
        },
        select: {
          id: true
        }
      });

      if (missingProducts.length > 0) {
        const missingProductIds = missingProducts.map(
          (product) => product.id
        );

        const result = await tx.product.updateMany({
          where: {
            id: {
              in: missingProductIds
            }
          },
          data: {
            isActive: false,
            officialSiteSyncedAt: syncedAt
          }
        });

        deactivated = result.count;

        const removedSizes = await tx.productSize.updateMany({
          where: {
            productId: {
              in: missingProductIds
            },
            isActive: true
          },
          data: {
            isActive: false,
            syncedAt
          }
        });

        sizesDeactivated += removedSizes.count;
      }
    },
    {
      maxWait: 10000,
      timeout: 120000
    }
  );

  return {
    received: officialProducts.length,
    created,
    updated,
    deactivated,
    sizesCreated,
    sizesUpdated,
    sizesDeactivated,
    syncedAt
  };
}
-- Additive migration: no existing product, stock or sale rows are removed.
CREATE TABLE `ProductSize` (
  `id` CHAR(36) NOT NULL,
  `productId` CHAR(36) NOT NULL,
  `officialSiteSizeId` INTEGER NOT NULL,
  `label` VARCHAR(255) NOT NULL,
  `serves` VARCHAR(255) NULL,
  `price` DECIMAL(12,2) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `officialSiteUpdatedAt` DATETIME(3) NULL,
  `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ProductSize_officialSiteSizeId_key`(`officialSiteSizeId`),
  INDEX `ProductSize_productId_isActive_sortOrder_idx`(`productId`, `isActive`, `sortOrder`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `ProductSize` ADD CONSTRAINT `ProductSize_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `SaleItem` ADD COLUMN `productSizeId` CHAR(36) NULL;
CREATE INDEX `SaleItem_productSizeId_idx` ON `SaleItem`(`productSizeId`);
ALTER TABLE `SaleItem` ADD CONSTRAINT `SaleItem_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

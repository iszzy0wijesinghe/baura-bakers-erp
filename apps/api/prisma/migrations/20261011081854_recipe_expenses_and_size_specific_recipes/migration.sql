/*
  Warnings:

  - A unique constraint covering the columns `[productId,productSizeId,ingredientId]` on the table `ProductRecipeItem` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `ProductRecipeItem` DROP FOREIGN KEY `ProductRecipeItem_productId_fkey`;

-- DropIndex
DROP INDEX `ProductRecipeItem_productId_ingredientId_key` ON `ProductRecipeItem`;

-- AlterTable
ALTER TABLE `ProductRecipeItem` ADD COLUMN `productSizeId` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `ProductionBatch` ADD COLUMN `expenseCostTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `productSizeId` CHAR(36) NULL,
    ADD COLUMN `totalProductionCost` DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `ProductRecipeExpense` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `productSizeId` CHAR(36) NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('ELECTRICITY', 'GAS', 'LABOUR', 'PACKAGING', 'DECORATION', 'TRANSPORT', 'OTHER') NOT NULL,
    `calculationMethod` ENUM('PER_BATCH', 'PER_UNIT', 'QUANTITY_BASED') NOT NULL DEFAULT 'PER_BATCH',
    `quantity` DECIMAL(12, 3) NOT NULL DEFAULT 1,
    `rate` DECIMAL(14, 2) NOT NULL,
    `description` VARCHAR(500) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProductRecipeExpense_productId_idx`(`productId`),
    INDEX `ProductRecipeExpense_productSizeId_idx`(`productSizeId`),
    INDEX `ProductRecipeExpense_category_idx`(`category`),
    INDEX `ProductRecipeExpense_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductionExpense` (
    `id` CHAR(36) NOT NULL,
    `productionBatchId` CHAR(36) NOT NULL,
    `recipeExpenseId` CHAR(36) NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` ENUM('ELECTRICITY', 'GAS', 'LABOUR', 'PACKAGING', 'DECORATION', 'TRANSPORT', 'OTHER') NOT NULL,
    `calculationMethod` ENUM('PER_BATCH', 'PER_UNIT', 'QUANTITY_BASED') NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `rate` DECIMAL(14, 2) NOT NULL,
    `totalAmount` DECIMAL(14, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductionExpense_productionBatchId_idx`(`productionBatchId`),
    INDEX `ProductionExpense_recipeExpenseId_idx`(`recipeExpenseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ProductRecipeItem_productId_productSizeId_idx` ON `ProductRecipeItem`(`productId`, `productSizeId`);

-- CreateIndex
CREATE UNIQUE INDEX `ProductRecipeItem_productId_productSizeId_ingredientId_key` ON `ProductRecipeItem`(`productId`, `productSizeId`, `ingredientId`);

-- CreateIndex
CREATE INDEX `ProductionBatch_productSizeId_idx` ON `ProductionBatch`(`productSizeId`);

-- AddForeignKey
ALTER TABLE `ProductRecipeItem` ADD CONSTRAINT `ProductRecipeItem_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductRecipeItem`
ADD CONSTRAINT `ProductRecipeItem_productId_fkey`
FOREIGN KEY (`productId`)
REFERENCES `Product`(`id`)
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionBatch` ADD CONSTRAINT `ProductionBatch_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductRecipeExpense` ADD CONSTRAINT `ProductRecipeExpense_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductRecipeExpense` ADD CONSTRAINT `ProductRecipeExpense_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionExpense` ADD CONSTRAINT `ProductionExpense_productionBatchId_fkey` FOREIGN KEY (`productionBatchId`) REFERENCES `ProductionBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionExpense` ADD CONSTRAINT `ProductionExpense_recipeExpenseId_fkey` FOREIGN KEY (`recipeExpenseId`) REFERENCES `ProductRecipeExpense`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

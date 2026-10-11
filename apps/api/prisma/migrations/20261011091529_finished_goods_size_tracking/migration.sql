-- AlterTable
ALTER TABLE `FinishedGoodsLot` ADD COLUMN `productSizeId` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `FinishedGoodsMovement` ADD COLUMN `productSizeId` CHAR(36) NULL;

-- CreateIndex
CREATE INDEX `FinishedGoodsLot_productId_productSizeId_remainingQty_idx` ON `FinishedGoodsLot`(`productId`, `productSizeId`, `remainingQty`);

-- CreateIndex
CREATE INDEX `FinishedGoodsMovement_productId_productSizeId_idx` ON `FinishedGoodsMovement`(`productId`, `productSizeId`);

-- AddForeignKey
ALTER TABLE `FinishedGoodsLot` ADD CONSTRAINT `FinishedGoodsLot_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinishedGoodsMovement` ADD CONSTRAINT `FinishedGoodsMovement_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

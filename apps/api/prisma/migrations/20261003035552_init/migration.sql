-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Role` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Role_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRole` (
    `userId` CHAR(36) NOT NULL,
    `roleId` CHAR(36) NOT NULL,

    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Supplier` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `taxId` VARCHAR(191) NULL,
    `paymentTermsDays` INTEGER NOT NULL DEFAULT 0,
    `creditLimit` DECIMAL(14, 2) NULL,
    `notes` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Supplier_code_key`(`code`),
    INDEX `Supplier_name_idx`(`name`),
    INDEX `Supplier_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ingredient` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NULL,
    `imageUrl` VARCHAR(1000) NULL,
    `packageQty` DECIMAL(12, 3) NOT NULL,
    `packageUnit` ENUM('G', 'KG', 'ML', 'L', 'UNIT') NOT NULL,
    `baseQty` DECIMAL(12, 3) NOT NULL,
    `baseUnit` ENUM('G', 'ML', 'UNIT') NOT NULL,
    `lowStockAlertQty` DECIMAL(12, 3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Ingredient_name_idx`(`name`),
    INDEX `Ingredient_brand_idx`(`brand`),
    INDEX `Ingredient_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseCarter` (
    `id` CHAR(36) NOT NULL,
    `carterNo` VARCHAR(191) NOT NULL,
    `purchasedAt` DATETIME(3) NOT NULL,
    `supplierName` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PurchaseCarter_carterNo_key`(`carterNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseCarterItem` (
    `id` CHAR(36) NOT NULL,
    `carterId` CHAR(36) NOT NULL,
    `ingredientId` CHAR(36) NOT NULL,
    `loadedQty` DECIMAL(12, 3) NOT NULL,
    `pricePerPackage` DECIMAL(12, 2) NOT NULL,
    `totalBaseQty` DECIMAL(12, 3) NOT NULL,
    `totalPrice` DECIMAL(12, 2) NOT NULL,
    `unitCostBase` DECIMAL(12, 6) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PurchaseCarterItem_carterId_idx`(`carterId`),
    INDEX `PurchaseCarterItem_ingredientId_idx`(`ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GoodsReceipt` (
    `id` CHAR(36) NOT NULL,
    `grnNo` VARCHAR(191) NOT NULL,
    `supplierId` CHAR(36) NOT NULL,
    `supplierInvoiceNo` VARCHAR(191) NULL,
    `invoiceDate` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `status` ENUM('DRAFT', 'POSTED', 'VOID') NOT NULL DEFAULT 'DRAFT',
    `notes` VARCHAR(191) NULL,
    `subtotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `createdById` CHAR(36) NOT NULL,
    `postedById` CHAR(36) NULL,
    `postedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `GoodsReceipt_grnNo_key`(`grnNo`),
    INDEX `GoodsReceipt_supplierId_idx`(`supplierId`),
    INDEX `GoodsReceipt_receivedAt_idx`(`receivedAt`),
    INDEX `GoodsReceipt_status_idx`(`status`),
    UNIQUE INDEX `GoodsReceipt_supplierId_supplierInvoiceNo_key`(`supplierId`, `supplierInvoiceNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GoodsReceiptItem` (
    `id` CHAR(36) NOT NULL,
    `goodsReceiptId` CHAR(36) NOT NULL,
    `ingredientId` CHAR(36) NOT NULL,
    `orderedPackageQty` DECIMAL(12, 3) NULL,
    `receivedPackageQty` DECIMAL(12, 3) NOT NULL,
    `acceptedBaseQty` DECIMAL(12, 3) NOT NULL,
    `rejectedBaseQty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `pricePerPackage` DECIMAL(14, 2) NOT NULL,
    `totalPrice` DECIMAL(14, 2) NOT NULL,
    `unitCostBase` DECIMAL(14, 6) NOT NULL,
    `lotNumber` VARCHAR(191) NULL,
    `expiryDate` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `GoodsReceiptItem_goodsReceiptId_idx`(`goodsReceiptId`),
    INDEX `GoodsReceiptItem_ingredientId_idx`(`ingredientId`),
    INDEX `GoodsReceiptItem_expiryDate_idx`(`expiryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IngredientStockLot` (
    `id` CHAR(36) NOT NULL,
    `carterItemId` CHAR(36) NULL,
    `goodsReceiptItemId` CHAR(36) NULL,
    `ingredientId` CHAR(36) NOT NULL,
    `receivedBaseQty` DECIMAL(12, 3) NOT NULL,
    `remainingBaseQty` DECIMAL(12, 3) NOT NULL,
    `baseUnit` ENUM('G', 'ML', 'UNIT') NOT NULL,
    `unitCostBase` DECIMAL(12, 6) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lotNumber` VARCHAR(191) NULL,
    `expiryDate` DATETIME(3) NULL,

    UNIQUE INDEX `IngredientStockLot_goodsReceiptItemId_key`(`goodsReceiptItemId`),
    INDEX `IngredientStockLot_ingredientId_remainingBaseQty_idx`(`ingredientId`, `remainingBaseQty`),
    INDEX `IngredientStockLot_receivedAt_idx`(`receivedAt`),
    INDEX `IngredientStockLot_expiryDate_idx`(`expiryDate`),
    INDEX `IngredientStockLot_lotNumber_idx`(`lotNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockMovement` (
    `id` CHAR(36) NOT NULL,
    `ingredientId` CHAR(36) NOT NULL,
    `stockLotId` CHAR(36) NULL,
    `movementType` ENUM('PURCHASE', 'PRODUCTION', 'SALE', 'WASTE', 'ADJUSTMENT', 'RETURN') NOT NULL,
    `refType` VARCHAR(191) NULL,
    `refId` VARCHAR(191) NULL,
    `qtyDelta` DECIMAL(12, 3) NOT NULL,
    `unitCostBase` DECIMAL(12, 6) NULL,
    `costAmount` DECIMAL(12, 2) NULL,
    `note` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockMovement_ingredientId_idx`(`ingredientId`),
    INDEX `StockMovement_movementType_idx`(`movementType`),
    INDEX `StockMovement_occurredAt_idx`(`occurredAt`),
    INDEX `StockMovement_refType_refId_idx`(`refType`, `refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `variantName` VARCHAR(191) NULL,
    `imageUrl` VARCHAR(1000) NULL,
    `sellPrice` DECIMAL(12, 2) NOT NULL,
    `finishedStockAlertQty` DECIMAL(12, 3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Product_name_idx`(`name`),
    INDEX `Product_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductRecipeItem` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `ingredientId` CHAR(36) NOT NULL,
    `imageUrl` VARCHAR(1000) NULL,
    `requiredBaseQty` DECIMAL(12, 3) NOT NULL,
    `baseUnit` ENUM('G', 'ML', 'UNIT') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductRecipeItem_productId_idx`(`productId`),
    INDEX `ProductRecipeItem_ingredientId_idx`(`ingredientId`),
    UNIQUE INDEX `ProductRecipeItem_productId_ingredientId_key`(`productId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductionBatch` (
    `id` CHAR(36) NOT NULL,
    `batchNo` VARCHAR(191) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `plannedQty` DECIMAL(12, 3) NOT NULL,
    `producedQty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `rejectedQty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'POSTED', 'VOID') NOT NULL DEFAULT 'DRAFT',
    `productionDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiryDate` DATETIME(3) NULL,
    `ingredientCostTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `unitCost` DECIMAL(14, 6) NOT NULL DEFAULT 0,
    `notes` VARCHAR(191) NULL,
    `createdById` CHAR(36) NOT NULL,
    `postedById` CHAR(36) NULL,
    `postedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductionBatch_batchNo_key`(`batchNo`),
    INDEX `ProductionBatch_productId_idx`(`productId`),
    INDEX `ProductionBatch_productionDate_idx`(`productionDate`),
    INDEX `ProductionBatch_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductionConsumption` (
    `id` CHAR(36) NOT NULL,
    `productionBatchId` CHAR(36) NOT NULL,
    `ingredientId` CHAR(36) NOT NULL,
    `stockLotId` CHAR(36) NOT NULL,
    `consumedBaseQty` DECIMAL(12, 3) NOT NULL,
    `unitCostBase` DECIMAL(14, 6) NOT NULL,
    `costAmount` DECIMAL(14, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductionConsumption_productionBatchId_idx`(`productionBatchId`),
    INDEX `ProductionConsumption_ingredientId_idx`(`ingredientId`),
    INDEX `ProductionConsumption_stockLotId_idx`(`stockLotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinishedGoodsLot` (
    `id` CHAR(36) NOT NULL,
    `productionBatchId` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `producedQty` DECIMAL(12, 3) NOT NULL,
    `remainingQty` DECIMAL(12, 3) NOT NULL,
    `unitCost` DECIMAL(14, 6) NOT NULL,
    `producedAt` DATETIME(3) NOT NULL,
    `expiryDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FinishedGoodsLot_productionBatchId_key`(`productionBatchId`),
    INDEX `FinishedGoodsLot_productId_remainingQty_idx`(`productId`, `remainingQty`),
    INDEX `FinishedGoodsLot_producedAt_idx`(`producedAt`),
    INDEX `FinishedGoodsLot_expiryDate_idx`(`expiryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinishedGoodsMovement` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `stockLotId` CHAR(36) NULL,
    `movementType` ENUM('PRODUCTION', 'SALE', 'WASTE', 'ADJUSTMENT', 'RETURN') NOT NULL,
    `refType` VARCHAR(191) NULL,
    `refId` VARCHAR(191) NULL,
    `qtyDelta` DECIMAL(12, 3) NOT NULL,
    `unitCost` DECIMAL(14, 6) NULL,
    `costAmount` DECIMAL(14, 2) NULL,
    `note` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FinishedGoodsMovement_productId_idx`(`productId`),
    INDEX `FinishedGoodsMovement_stockLotId_idx`(`stockLotId`),
    INDEX `FinishedGoodsMovement_movementType_idx`(`movementType`),
    INDEX `FinishedGoodsMovement_occurredAt_idx`(`occurredAt`),
    INDEX `FinishedGoodsMovement_refType_refId_idx`(`refType`, `refId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesChannel` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SalesChannel_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SalesOrder` (
    `id` CHAR(36) NOT NULL,
    `orderNo` VARCHAR(191) NOT NULL,
    `salesChannelId` CHAR(36) NULL,
    `saleType` ENUM('POS', 'MANUAL') NOT NULL DEFAULT 'POS',
    `paymentMethod` ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER') NOT NULL DEFAULT 'CASH',
    `grossTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discountTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `netTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cogsTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `profitTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` ENUM('COMPLETED', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'COMPLETED',
    `createdById` CHAR(36) NULL,
    `soldAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SalesOrder_orderNo_key`(`orderNo`),
    INDEX `SalesOrder_soldAt_idx`(`soldAt`),
    INDEX `SalesOrder_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SaleItem` (
    `id` CHAR(36) NOT NULL,
    `salesOrderId` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `qty` DECIMAL(12, 3) NOT NULL,
    `unitSellPrice` DECIMAL(12, 2) NOT NULL,
    `lineTotal` DECIMAL(12, 2) NOT NULL,
    `discountTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `netTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cogsTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `profitTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SaleItem_salesOrderId_idx`(`salesOrderId`),
    INDEX `SaleItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SaleItemFifoConsumption` (
    `id` CHAR(36) NOT NULL,
    `saleItemId` CHAR(36) NOT NULL,
    `stockLotId` CHAR(36) NOT NULL,
    `ingredientId` CHAR(36) NOT NULL,
    `consumedBaseQty` DECIMAL(12, 3) NOT NULL,
    `unitCostBase` DECIMAL(12, 6) NOT NULL,
    `costAmount` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SaleItemFifoConsumption_saleItemId_idx`(`saleItemId`),
    INDEX `SaleItemFifoConsumption_stockLotId_idx`(`stockLotId`),
    INDEX `SaleItemFifoConsumption_ingredientId_idx`(`ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SaleFinishedGoodsConsumption` (
    `id` CHAR(36) NOT NULL,
    `saleItemId` CHAR(36) NOT NULL,
    `finishedGoodsLotId` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `consumedQty` DECIMAL(12, 3) NOT NULL,
    `unitCost` DECIMAL(14, 6) NOT NULL,
    `costAmount` DECIMAL(14, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SaleFinishedGoodsConsumption_saleItemId_idx`(`saleItemId`),
    INDEX `SaleFinishedGoodsConsumption_finishedGoodsLotId_idx`(`finishedGoodsLotId`),
    INDEX `SaleFinishedGoodsConsumption_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DocumentSequence` (
    `key` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `nextValue` INTEGER NOT NULL DEFAULT 1,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` CHAR(36) NOT NULL,
    `userId` CHAR(36) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `beforeJson` JSON NULL,
    `afterJson` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_userId_idx`(`userId`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BackupSetting` (
    `id` VARCHAR(191) NOT NULL,
    `frequency` ENUM('MANUAL', 'DAILY', 'WEEKLY', 'MONTHLY') NOT NULL DEFAULT 'MANUAL',
    `localBackupEnabled` BOOLEAN NOT NULL DEFAULT true,
    `localBackupPath` VARCHAR(191) NOT NULL DEFAULT './backups',
    `googleDriveEnabled` BOOLEAN NOT NULL DEFAULT false,
    `googleAccountEmail` VARCHAR(191) NULL,
    `googleDriveFolderId` VARCHAR(191) NULL,
    `googleDriveRefreshToken` VARCHAR(191) NULL,
    `googleDriveAccessToken` VARCHAR(191) NULL,
    `googleDriveTokenExpiry` DATETIME(3) NULL,
    `googleDriveConnectedAt` DATETIME(3) NULL,
    `googleOauthState` VARCHAR(191) NULL,
    `lastBackupAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BackupHistory` (
    `id` VARCHAR(191) NOT NULL,
    `target` ENUM('LOCAL', 'GOOGLE_DRIVE') NOT NULL,
    `status` ENUM('SUCCESS', 'FAILED', 'RUNNING') NOT NULL DEFAULT 'RUNNING',
    `fileName` VARCHAR(191) NULL,
    `filePath` VARCHAR(191) NULL,
    `googleDriveFileId` VARCHAR(191) NULL,
    `googleAccountEmail` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    `errorMessage` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseCarter` ADD CONSTRAINT `PurchaseCarter_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseCarterItem` ADD CONSTRAINT `PurchaseCarterItem_carterId_fkey` FOREIGN KEY (`carterId`) REFERENCES `PurchaseCarter`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseCarterItem` ADD CONSTRAINT `PurchaseCarterItem_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoodsReceipt` ADD CONSTRAINT `GoodsReceipt_supplierId_fkey` FOREIGN KEY (`supplierId`) REFERENCES `Supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoodsReceipt` ADD CONSTRAINT `GoodsReceipt_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoodsReceipt` ADD CONSTRAINT `GoodsReceipt_postedById_fkey` FOREIGN KEY (`postedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoodsReceiptItem` ADD CONSTRAINT `GoodsReceiptItem_goodsReceiptId_fkey` FOREIGN KEY (`goodsReceiptId`) REFERENCES `GoodsReceipt`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoodsReceiptItem` ADD CONSTRAINT `GoodsReceiptItem_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IngredientStockLot` ADD CONSTRAINT `IngredientStockLot_carterItemId_fkey` FOREIGN KEY (`carterItemId`) REFERENCES `PurchaseCarterItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IngredientStockLot` ADD CONSTRAINT `IngredientStockLot_goodsReceiptItemId_fkey` FOREIGN KEY (`goodsReceiptItemId`) REFERENCES `GoodsReceiptItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IngredientStockLot` ADD CONSTRAINT `IngredientStockLot_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `IngredientStockLot`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductRecipeItem` ADD CONSTRAINT `ProductRecipeItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductRecipeItem` ADD CONSTRAINT `ProductRecipeItem_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionBatch` ADD CONSTRAINT `ProductionBatch_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionBatch` ADD CONSTRAINT `ProductionBatch_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionBatch` ADD CONSTRAINT `ProductionBatch_postedById_fkey` FOREIGN KEY (`postedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionConsumption` ADD CONSTRAINT `ProductionConsumption_productionBatchId_fkey` FOREIGN KEY (`productionBatchId`) REFERENCES `ProductionBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionConsumption` ADD CONSTRAINT `ProductionConsumption_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionConsumption` ADD CONSTRAINT `ProductionConsumption_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `IngredientStockLot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinishedGoodsLot` ADD CONSTRAINT `FinishedGoodsLot_productionBatchId_fkey` FOREIGN KEY (`productionBatchId`) REFERENCES `ProductionBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinishedGoodsLot` ADD CONSTRAINT `FinishedGoodsLot_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinishedGoodsMovement` ADD CONSTRAINT `FinishedGoodsMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinishedGoodsMovement` ADD CONSTRAINT `FinishedGoodsMovement_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `FinishedGoodsLot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_salesChannelId_fkey` FOREIGN KEY (`salesChannelId`) REFERENCES `SalesChannel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleItem` ADD CONSTRAINT `SaleItem_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleItem` ADD CONSTRAINT `SaleItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleItemFifoConsumption` ADD CONSTRAINT `SaleItemFifoConsumption_saleItemId_fkey` FOREIGN KEY (`saleItemId`) REFERENCES `SaleItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleItemFifoConsumption` ADD CONSTRAINT `SaleItemFifoConsumption_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `IngredientStockLot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleItemFifoConsumption` ADD CONSTRAINT `SaleItemFifoConsumption_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleFinishedGoodsConsumption` ADD CONSTRAINT `SaleFinishedGoodsConsumption_saleItemId_fkey` FOREIGN KEY (`saleItemId`) REFERENCES `SaleItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleFinishedGoodsConsumption` ADD CONSTRAINT `SaleFinishedGoodsConsumption_finishedGoodsLotId_fkey` FOREIGN KEY (`finishedGoodsLotId`) REFERENCES `FinishedGoodsLot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleFinishedGoodsConsumption` ADD CONSTRAINT `SaleFinishedGoodsConsumption_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

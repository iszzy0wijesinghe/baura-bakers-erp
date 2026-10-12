-- CreateTable
CREATE TABLE `User` (
    `id` CHAR(36) NOT NULL,
    `officialSiteUserId` INTEGER NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_officialSiteUserId_key`(`officialSiteUserId`),
    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_isActive_idx`(`isActive`),
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
CREATE TABLE `CarterPurchaseExpense` (
    `id` CHAR(36) NOT NULL,
    `carterId` CHAR(36) NOT NULL,
    `itemId` CHAR(36) NULL,
    `category` ENUM('TRANSPORT', 'DELIVERY', 'PACKAGING', 'HANDLING', 'OTHER') NOT NULL,
    `treatment` ENUM('INVENTORY', 'OPERATING') NOT NULL DEFAULT 'INVENTORY',
    `description` VARCHAR(500) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `createdById` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CarterPurchaseExpense_carterId_idx`(`carterId`),
    INDEX `CarterPurchaseExpense_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CarterExpenseAllocation` (
    `id` CHAR(36) NOT NULL,
    `expenseId` CHAR(36) NOT NULL,
    `itemId` CHAR(36) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CarterExpenseAllocation_itemId_idx`(`itemId`),
    UNIQUE INDEX `CarterExpenseAllocation_expenseId_itemId_key`(`expenseId`, `itemId`),
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
    `invalidatedAt` DATETIME(3) NULL,
    `invalidReason` VARCHAR(500) NULL,
    `invalidatedById` CHAR(36) NULL,

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
    `officialSiteProductId` INTEGER NULL,
    `name` VARCHAR(191) NOT NULL,
    `variantName` VARCHAR(191) NULL,
    `imageUrl` VARCHAR(1000) NULL,
    `sellPrice` DECIMAL(12, 2) NOT NULL,
    `finishedStockAlertQty` DECIMAL(12, 3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `officialSiteSyncedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Product_officialSiteProductId_key`(`officialSiteProductId`),
    INDEX `Product_name_idx`(`name`),
    INDEX `Product_isActive_idx`(`isActive`),
    INDEX `Product_officialSiteProductId_idx`(`officialSiteProductId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductSize` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `officialSiteSizeId` INTEGER NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `serves` VARCHAR(255) NULL,
    `price` DECIMAL(12, 2) NOT NULL,
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

-- CreateTable
CREATE TABLE `ProductRecipeItem` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `productSizeId` CHAR(36) NULL,
    `ingredientId` CHAR(36) NOT NULL,
    `imageUrl` VARCHAR(1000) NULL,
    `requiredBaseQty` DECIMAL(12, 3) NOT NULL,
    `baseUnit` ENUM('G', 'ML', 'UNIT') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductRecipeItem_productId_productSizeId_idx`(`productId`, `productSizeId`),
    INDEX `ProductRecipeItem_ingredientId_idx`(`ingredientId`),
    UNIQUE INDEX `ProductRecipeItem_productId_productSizeId_ingredientId_key`(`productId`, `productSizeId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductionBatch` (
    `id` CHAR(36) NOT NULL,
    `batchNo` VARCHAR(191) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `productSizeId` CHAR(36) NULL,
    `plannedQty` DECIMAL(12, 3) NOT NULL,
    `producedQty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `rejectedQty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `status` ENUM('DRAFT', 'POSTED', 'VOID') NOT NULL DEFAULT 'DRAFT',
    `productionDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiryDate` DATETIME(3) NULL,
    `ingredientCostTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `expenseCostTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `totalProductionCost` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `unitCost` DECIMAL(14, 6) NOT NULL DEFAULT 0,
    `notes` VARCHAR(191) NULL,
    `createdById` CHAR(36) NOT NULL,
    `postedById` CHAR(36) NULL,
    `postedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductionBatch_batchNo_key`(`batchNo`),
    INDEX `ProductionBatch_productId_idx`(`productId`),
    INDEX `ProductionBatch_productSizeId_idx`(`productSizeId`),
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
    `productSizeId` CHAR(36) NULL,
    `producedQty` DECIMAL(12, 3) NOT NULL,
    `remainingQty` DECIMAL(12, 3) NOT NULL,
    `unitCost` DECIMAL(14, 6) NOT NULL,
    `producedAt` DATETIME(3) NOT NULL,
    `expiryDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FinishedGoodsLot_productionBatchId_key`(`productionBatchId`),
    INDEX `FinishedGoodsLot_productId_productSizeId_remainingQty_idx`(`productId`, `productSizeId`, `remainingQty`),
    INDEX `FinishedGoodsLot_productId_remainingQty_idx`(`productId`, `remainingQty`),
    INDEX `FinishedGoodsLot_producedAt_idx`(`producedAt`),
    INDEX `FinishedGoodsLot_expiryDate_idx`(`expiryDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinishedGoodsMovement` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `productSizeId` CHAR(36) NULL,
    `stockLotId` CHAR(36) NULL,
    `movementType` ENUM('PRODUCTION', 'SALE', 'WASTE', 'ADJUSTMENT', 'RETURN') NOT NULL,
    `refType` VARCHAR(191) NULL,
    `refId` VARCHAR(191) NULL,
    `qtyDelta` DECIMAL(12, 3) NOT NULL,
    `unitCost` DECIMAL(14, 6) NULL,
    `costAmount` DECIMAL(14, 2) NULL,
    `note` VARCHAR(191) NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FinishedGoodsMovement_productId_productSizeId_idx`(`productId`, `productSizeId`),
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
    `posSessionId` CHAR(36) NULL,
    `saleType` ENUM('POS', 'MANUAL') NOT NULL DEFAULT 'POS',
    `paymentMethod` ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER') NOT NULL DEFAULT 'CASH',
    `grossTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discountTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `netTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cogsTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `profitTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `status` ENUM('COMPLETED', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'COMPLETED',
    `createdById` CHAR(36) NULL,
    `officialCustomerId` INTEGER NULL,
    `customerNameSnapshot` VARCHAR(191) NULL,
    `customerPhoneSnapshot` VARCHAR(32) NULL,
    `customerEmailSnapshot` VARCHAR(191) NULL,
    `receiptEmail` VARCHAR(191) NULL,
    `receiptEmailStatus` ENUM('NOT_REQUESTED', 'PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'NOT_REQUESTED',
    `receiptEmailSentAt` DATETIME(3) NULL,
    `receiptEmailLastError` VARCHAR(1000) NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `originalSaleId` CHAR(36) NULL,
    `reversalReason` VARCHAR(500) NULL,
    `reversedAt` DATETIME(3) NULL,
    `soldAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SalesOrder_orderNo_key`(`orderNo`),
    UNIQUE INDEX `SalesOrder_idempotencyKey_key`(`idempotencyKey`),
    INDEX `SalesOrder_posSessionId_idx`(`posSessionId`),
    INDEX `SalesOrder_officialCustomerId_idx`(`officialCustomerId`),
    INDEX `SalesOrder_originalSaleId_idx`(`originalSaleId`),
    INDEX `SalesOrder_soldAt_idx`(`soldAt`),
    INDEX `SalesOrder_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SaleItem` (
    `id` CHAR(36) NOT NULL,
    `salesOrderId` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `productSizeId` CHAR(36) NULL,
    `qty` DECIMAL(12, 3) NOT NULL,
    `unitSellPrice` DECIMAL(12, 2) NOT NULL,
    `lineTotal` DECIMAL(12, 2) NOT NULL,
    `discountTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `netTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cogsTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `profitTotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SaleItem_salesOrderId_idx`(`salesOrderId`),
    INDEX `SaleItem_productSizeId_idx`(`productSizeId`),
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
CREATE TABLE `BusinessWeeklySchedule` (
    `id` CHAR(36) NOT NULL,
    `weekday` TINYINT UNSIGNED NOT NULL,
    `isOpen` BOOLEAN NOT NULL DEFAULT true,
    `openingTime` VARCHAR(5) NULL,
    `closingTime` VARCHAR(5) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BusinessWeeklySchedule_weekday_key`(`weekday`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BusinessCalendarException` (
    `id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `type` ENUM('CLOSED', 'SPECIAL_HOURS') NOT NULL,
    `openingTime` VARCHAR(5) NULL,
    `closingTime` VARCHAR(5) NULL,
    `reason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BusinessCalendarException_date_key`(`date`),
    INDEX `BusinessCalendarException_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PosSession` (
    `id` CHAR(36) NOT NULL,
    `sessionNo` VARCHAR(191) NOT NULL,
    `businessDate` DATE NOT NULL,
    `status` ENUM('OPEN', 'CLOSING', 'PENDING_APPROVAL', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `openedById` CHAR(36) NOT NULL,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `openingFloat` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `openingNote` VARCHAR(500) NULL,
    `closingStartedAt` DATETIME(3) NULL,
    `closedById` CHAR(36) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PosSession_sessionNo_key`(`sessionNo`),
    INDEX `PosSession_businessDate_idx`(`businessDate`),
    INDEX `PosSession_status_idx`(`status`),
    INDEX `PosSession_openedById_status_idx`(`openedById`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PosPayment` (
    `id` CHAR(36) NOT NULL,
    `paymentNo` VARCHAR(191) NOT NULL,
    `salesOrderId` CHAR(36) NOT NULL,
    `method` ENUM('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER') NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'VOIDED', 'REFUNDED') NOT NULL DEFAULT 'COMPLETED',
    `amount` DECIMAL(14, 2) NOT NULL,
    `tenderedAmount` DECIMAL(14, 2) NULL,
    `changeAmount` DECIMAL(14, 2) NULL,
    `reference` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `createdById` CHAR(36) NULL,
    `completedAt` DATETIME(3) NULL,
    `voidedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PosPayment_paymentNo_key`(`paymentNo`),
    UNIQUE INDEX `PosPayment_idempotencyKey_key`(`idempotencyKey`),
    INDEX `PosPayment_salesOrderId_idx`(`salesOrderId`),
    INDEX `PosPayment_method_idx`(`method`),
    INDEX `PosPayment_status_idx`(`status`),
    INDEX `PosPayment_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PosCashMovement` (
    `id` CHAR(36) NOT NULL,
    `posSessionId` CHAR(36) NOT NULL,
    `type` ENUM('OPENING_FLOAT', 'CASH_IN', 'CASH_OUT', 'REFUND', 'ADJUSTMENT') NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `reason` VARCHAR(500) NULL,
    `reference` VARCHAR(191) NULL,
    `createdById` CHAR(36) NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PosCashMovement_posSessionId_occurredAt_idx`(`posSessionId`, `occurredAt`),
    INDEX `PosCashMovement_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PosCashDenominationCount` (
    `id` CHAR(36) NOT NULL,
    `posSessionId` CHAR(36) NOT NULL,
    `countType` ENUM('OPENING', 'CLOSING') NOT NULL,
    `denominationValue` DECIMAL(14, 2) NOT NULL,
    `quantity` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `amount` DECIMAL(14, 2) NOT NULL,
    `countedById` CHAR(36) NOT NULL,
    `countedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PosCashDenominationCount_posSessionId_countType_idx`(`posSessionId`, `countType`),
    UNIQUE INDEX `PosCashDenominationCount_posSessionId_countType_denomination_key`(`posSessionId`, `countType`, `denominationValue`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PosDayEnd` (
    `id` CHAR(36) NOT NULL,
    `posSessionId` CHAR(36) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `grossSalesTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `discountTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `netSalesTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `cashSalesTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `cardSalesTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `bankTransferTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `otherPaymentTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `refundTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `voidTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `cashInTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `cashOutTotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `expectedCash` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `countedCash` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `variance` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `invoiceCount` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `varianceReason` VARCHAR(500) NULL,
    `cashierNote` VARCHAR(500) NULL,
    `managerNote` VARCHAR(500) NULL,
    `submittedById` CHAR(36) NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedById` CHAR(36) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PosDayEnd_posSessionId_key`(`posSessionId`),
    INDEX `PosDayEnd_status_idx`(`status`),
    INDEX `PosDayEnd_submittedAt_idx`(`submittedAt`),
    INDEX `PosDayEnd_approvedAt_idx`(`approvedAt`),
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
CREATE TABLE `PosApproval` (
    `id` CHAR(36) NOT NULL,
    `type` ENUM('MANUAL_DISCOUNT', 'CANCEL_SALE', 'REFUND', 'RETURN') NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'USED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `requestedById` CHAR(36) NOT NULL,
    `approvedById` CHAR(36) NULL,
    `saleId` CHAR(36) NULL,
    `amount` DECIMAL(12, 2) NULL,
    `reason` VARCHAR(500) NULL,
    `contextJson` JSON NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `approvedAt` DATETIME(3) NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PosApproval_requestedById_idx`(`requestedById`),
    INDEX `PosApproval_approvedById_idx`(`approvedById`),
    INDEX `PosApproval_saleId_idx`(`saleId`),
    INDEX `PosApproval_status_idx`(`status`),
    INDEX `PosApproval_type_idx`(`type`),
    INDEX `PosApproval_expiresAt_idx`(`expiresAt`),
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

-- CreateTable
CREATE TABLE `FinanceFiscalYear` (
    `id` CHAR(36) NOT NULL,
    `label` VARCHAR(30) NOT NULL,
    `startsOn` DATE NOT NULL,
    `endsOn` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FinanceFiscalYear_label_key`(`label`),
    INDEX `FinanceFiscalYear_startsOn_endsOn_idx`(`startsOn`, `endsOn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancePeriod` (
    `id` CHAR(36) NOT NULL,
    `fiscalYearId` CHAR(36) NOT NULL,
    `number` INTEGER NOT NULL,
    `startsOn` DATE NOT NULL,
    `endsOn` DATE NOT NULL,
    `status` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `closedAt` DATETIME(3) NULL,
    `closedById` CHAR(36) NULL,

    INDEX `FinancePeriod_startsOn_endsOn_status_idx`(`startsOn`, `endsOn`, `status`),
    UNIQUE INDEX `FinancePeriod_fiscalYearId_number_key`(`fiscalYearId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinanceAccount` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(30) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `type` ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE') NOT NULL,
    `normalBalance` ENUM('DEBIT', 'CREDIT') NOT NULL,
    `parentId` CHAR(36) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `allowPosting` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FinanceAccount_code_key`(`code`),
    INDEX `FinanceAccount_type_isActive_idx`(`type`, `isActive`),
    INDEX `FinanceAccount_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinanceJournal` (
    `id` CHAR(36) NOT NULL,
    `journalNo` VARCHAR(40) NOT NULL,
    `fiscalYearId` CHAR(36) NOT NULL,
    `periodId` CHAR(36) NOT NULL,
    `accountingDate` DATE NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `status` ENUM('DRAFT', 'POSTED', 'REVERSED') NOT NULL DEFAULT 'DRAFT',
    `sourceType` VARCHAR(60) NULL,
    `sourceId` VARCHAR(100) NULL,
    `sourceEvent` VARCHAR(60) NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `reversalOfId` CHAR(36) NULL,
    `createdById` CHAR(36) NULL,
    `postedById` CHAR(36) NULL,
    `postedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FinanceJournal_journalNo_key`(`journalNo`),
    UNIQUE INDEX `FinanceJournal_idempotencyKey_key`(`idempotencyKey`),
    UNIQUE INDEX `FinanceJournal_reversalOfId_key`(`reversalOfId`),
    INDEX `FinanceJournal_accountingDate_status_idx`(`accountingDate`, `status`),
    INDEX `FinanceJournal_periodId_status_idx`(`periodId`, `status`),
    INDEX `FinanceJournal_sourceType_sourceId_idx`(`sourceType`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinanceJournalLine` (
    `id` CHAR(36) NOT NULL,
    `journalId` CHAR(36) NOT NULL,
    `lineNo` INTEGER NOT NULL,
    `accountId` CHAR(36) NOT NULL,
    `description` VARCHAR(500) NULL,
    `debit` DECIMAL(18, 2) NOT NULL DEFAULT 0,
    `credit` DECIMAL(18, 2) NOT NULL DEFAULT 0,

    INDEX `FinanceJournalLine_accountId_idx`(`accountId`),
    UNIQUE INDEX `FinanceJournalLine_journalId_lineNo_key`(`journalId`, `lineNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRole` ADD CONSTRAINT `UserRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CarterPurchaseExpense` ADD CONSTRAINT `CarterPurchaseExpense_carterId_fkey` FOREIGN KEY (`carterId`) REFERENCES `PurchaseCarter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CarterPurchaseExpense` ADD CONSTRAINT `CarterPurchaseExpense_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `PurchaseCarterItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CarterExpenseAllocation` ADD CONSTRAINT `CarterExpenseAllocation_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `CarterPurchaseExpense`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CarterExpenseAllocation` ADD CONSTRAINT `CarterExpenseAllocation_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `PurchaseCarterItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE `ProductSize` ADD CONSTRAINT `ProductSize_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductRecipeItem` ADD CONSTRAINT `ProductRecipeItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductRecipeItem` ADD CONSTRAINT `ProductRecipeItem_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductRecipeItem` ADD CONSTRAINT `ProductRecipeItem_ingredientId_fkey` FOREIGN KEY (`ingredientId`) REFERENCES `Ingredient`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionBatch` ADD CONSTRAINT `ProductionBatch_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionBatch` ADD CONSTRAINT `ProductionBatch_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE `FinishedGoodsLot` ADD CONSTRAINT `FinishedGoodsLot_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinishedGoodsMovement` ADD CONSTRAINT `FinishedGoodsMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinishedGoodsMovement` ADD CONSTRAINT `FinishedGoodsMovement_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinishedGoodsMovement` ADD CONSTRAINT `FinishedGoodsMovement_stockLotId_fkey` FOREIGN KEY (`stockLotId`) REFERENCES `FinishedGoodsLot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_salesChannelId_fkey` FOREIGN KEY (`salesChannelId`) REFERENCES `SalesChannel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_posSessionId_fkey` FOREIGN KEY (`posSessionId`) REFERENCES `PosSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_originalSaleId_fkey` FOREIGN KEY (`originalSaleId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleItem` ADD CONSTRAINT `SaleItem_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleItem` ADD CONSTRAINT `SaleItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SaleItem` ADD CONSTRAINT `SaleItem_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE `PosSession` ADD CONSTRAINT `PosSession_openedById_fkey` FOREIGN KEY (`openedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosSession` ADD CONSTRAINT `PosSession_closedById_fkey` FOREIGN KEY (`closedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosPayment` ADD CONSTRAINT `PosPayment_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosPayment` ADD CONSTRAINT `PosPayment_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosCashMovement` ADD CONSTRAINT `PosCashMovement_posSessionId_fkey` FOREIGN KEY (`posSessionId`) REFERENCES `PosSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosCashMovement` ADD CONSTRAINT `PosCashMovement_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosCashDenominationCount` ADD CONSTRAINT `PosCashDenominationCount_posSessionId_fkey` FOREIGN KEY (`posSessionId`) REFERENCES `PosSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosCashDenominationCount` ADD CONSTRAINT `PosCashDenominationCount_countedById_fkey` FOREIGN KEY (`countedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosDayEnd` ADD CONSTRAINT `PosDayEnd_posSessionId_fkey` FOREIGN KEY (`posSessionId`) REFERENCES `PosSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosDayEnd` ADD CONSTRAINT `PosDayEnd_submittedById_fkey` FOREIGN KEY (`submittedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosDayEnd` ADD CONSTRAINT `PosDayEnd_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosApproval` ADD CONSTRAINT `PosApproval_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosApproval` ADD CONSTRAINT `PosApproval_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosApproval` ADD CONSTRAINT `PosApproval_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductRecipeExpense` ADD CONSTRAINT `ProductRecipeExpense_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductRecipeExpense` ADD CONSTRAINT `ProductRecipeExpense_productSizeId_fkey` FOREIGN KEY (`productSizeId`) REFERENCES `ProductSize`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionExpense` ADD CONSTRAINT `ProductionExpense_productionBatchId_fkey` FOREIGN KEY (`productionBatchId`) REFERENCES `ProductionBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionExpense` ADD CONSTRAINT `ProductionExpense_recipeExpenseId_fkey` FOREIGN KEY (`recipeExpenseId`) REFERENCES `ProductRecipeExpense`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancePeriod` ADD CONSTRAINT `FinancePeriod_fiscalYearId_fkey` FOREIGN KEY (`fiscalYearId`) REFERENCES `FinanceFiscalYear`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinanceAccount` ADD CONSTRAINT `FinanceAccount_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `FinanceAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinanceJournal` ADD CONSTRAINT `FinanceJournal_fiscalYearId_fkey` FOREIGN KEY (`fiscalYearId`) REFERENCES `FinanceFiscalYear`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinanceJournal` ADD CONSTRAINT `FinanceJournal_periodId_fkey` FOREIGN KEY (`periodId`) REFERENCES `FinancePeriod`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinanceJournal` ADD CONSTRAINT `FinanceJournal_reversalOfId_fkey` FOREIGN KEY (`reversalOfId`) REFERENCES `FinanceJournal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinanceJournalLine` ADD CONSTRAINT `FinanceJournalLine_journalId_fkey` FOREIGN KEY (`journalId`) REFERENCES `FinanceJournal`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinanceJournalLine` ADD CONSTRAINT `FinanceJournalLine_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `FinanceAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


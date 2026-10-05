/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `SalesOrder` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `SalesOrder` ADD COLUMN `customerEmailSnapshot` VARCHAR(191) NULL,
    ADD COLUMN `customerNameSnapshot` VARCHAR(191) NULL,
    ADD COLUMN `customerPhoneSnapshot` VARCHAR(32) NULL,
    ADD COLUMN `idempotencyKey` VARCHAR(191) NULL,
    ADD COLUMN `officialCustomerId` INTEGER NULL,
    ADD COLUMN `originalSaleId` CHAR(36) NULL,
    ADD COLUMN `posSessionId` CHAR(36) NULL,
    ADD COLUMN `receiptEmail` VARCHAR(191) NULL,
    ADD COLUMN `receiptEmailLastError` VARCHAR(1000) NULL,
    ADD COLUMN `receiptEmailSentAt` DATETIME(3) NULL,
    ADD COLUMN `receiptEmailStatus` ENUM('NOT_REQUESTED', 'PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'NOT_REQUESTED',
    ADD COLUMN `reversalReason` VARCHAR(500) NULL,
    ADD COLUMN `reversedAt` DATETIME(3) NULL;

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

-- CreateIndex
CREATE UNIQUE INDEX `SalesOrder_idempotencyKey_key` ON `SalesOrder`(`idempotencyKey`);

-- CreateIndex
CREATE INDEX `SalesOrder_posSessionId_idx` ON `SalesOrder`(`posSessionId`);

-- CreateIndex
CREATE INDEX `SalesOrder_officialCustomerId_idx` ON `SalesOrder`(`officialCustomerId`);

-- CreateIndex
CREATE INDEX `SalesOrder_originalSaleId_idx` ON `SalesOrder`(`originalSaleId`);

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_posSessionId_fkey` FOREIGN KEY (`posSessionId`) REFERENCES `PosSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SalesOrder` ADD CONSTRAINT `SalesOrder_originalSaleId_fkey` FOREIGN KEY (`originalSaleId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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

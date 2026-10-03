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

-- AddForeignKey
ALTER TABLE `PosApproval` ADD CONSTRAINT `PosApproval_requestedById_fkey` FOREIGN KEY (`requestedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosApproval` ADD CONSTRAINT `PosApproval_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PosApproval` ADD CONSTRAINT `PosApproval_saleId_fkey` FOREIGN KEY (`saleId`) REFERENCES `SalesOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

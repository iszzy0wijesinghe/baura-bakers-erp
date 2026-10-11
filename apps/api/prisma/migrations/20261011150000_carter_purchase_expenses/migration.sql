CREATE TABLE `CarterPurchaseExpense` (
  `id` CHAR(36) NOT NULL,
  `carterId` CHAR(36) NOT NULL,
  `itemId` CHAR(36) NULL,
  `category` ENUM('TRANSPORT','DELIVERY','PACKAGING','HANDLING','OTHER') NOT NULL,
  `treatment` ENUM('INVENTORY','OPERATING') NOT NULL DEFAULT 'INVENTORY',
  `description` VARCHAR(500) NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `createdById` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `CarterPurchaseExpense_carterId_idx` (`carterId`),
  INDEX `CarterPurchaseExpense_itemId_idx` (`itemId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CarterPurchaseExpense_carterId_fkey` FOREIGN KEY (`carterId`) REFERENCES `PurchaseCarter`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CarterPurchaseExpense_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `PurchaseCarterItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CarterExpenseAllocation` (
  `id` CHAR(36) NOT NULL,
  `expenseId` CHAR(36) NOT NULL,
  `itemId` CHAR(36) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CarterExpenseAllocation_expenseId_itemId_key` (`expenseId`,`itemId`),
  INDEX `CarterExpenseAllocation_itemId_idx` (`itemId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `CarterExpenseAllocation_expenseId_fkey` FOREIGN KEY (`expenseId`) REFERENCES `CarterPurchaseExpense`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `CarterExpenseAllocation_itemId_fkey` FOREIGN KEY (`itemId`) REFERENCES `PurchaseCarterItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

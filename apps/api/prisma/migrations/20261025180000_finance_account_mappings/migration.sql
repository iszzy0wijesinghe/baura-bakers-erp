CREATE TABLE `FinanceAccountMapping` (
  `id` CHAR(36) NOT NULL,
  `key` VARCHAR(100) NOT NULL,
  `accountId` CHAR(36) NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `FinanceAccountMapping_key_key`(`key`),
  INDEX `FinanceAccountMapping_accountId_idx`(`accountId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `FinanceAccountMapping_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `FinanceAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Idempotent initial mappings, keyed by existing account codes. No existing account is modified.
-- Only the current safe cash/revenue/COGS/inventory mappings are prefilled.
-- Card/online/bank mappings require a conscious administrator choice.
INSERT INTO `FinanceAccountMapping` (`id`,`key`,`accountId`,`isActive`,`createdAt`,`updatedAt`)
SELECT UUID(), src.mappingKey, a.id, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM (
 SELECT 'POS_PAYMENT_CASH' AS mappingKey, '1010' AS accountCode
 UNION ALL SELECT 'POS_SALES_REVENUE','4000'
 UNION ALL SELECT 'POS_COGS','5000'
 UNION ALL SELECT 'POS_FINISHED_GOODS_INVENTORY','1310'
) AS src
JOIN `FinanceAccount` a ON a.code=src.accountCode
WHERE NOT EXISTS (SELECT 1 FROM `FinanceAccountMapping` m WHERE m.`key`=src.mappingKey);

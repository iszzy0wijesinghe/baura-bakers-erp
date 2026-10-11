ALTER TABLE `PurchaseCarterItem` ADD COLUMN `invalidatedAt` DATETIME(3) NULL, ADD COLUMN `invalidReason` VARCHAR(500) NULL, ADD COLUMN `invalidatedById` CHAR(36) NULL;

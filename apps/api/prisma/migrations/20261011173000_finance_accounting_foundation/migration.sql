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


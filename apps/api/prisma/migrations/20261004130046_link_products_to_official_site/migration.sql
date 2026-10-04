/*
  Warnings:

  - A unique constraint covering the columns `[officialSiteProductId]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Product` ADD COLUMN `officialSiteProductId` INTEGER NULL,
    ADD COLUMN `officialSiteSyncedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Product_officialSiteProductId_key` ON `Product`(`officialSiteProductId`);

-- CreateIndex
CREATE INDEX `Product_officialSiteProductId_idx` ON `Product`(`officialSiteProductId`);

/*
  Warnings:

  - A unique constraint covering the columns `[officialSiteUserId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `User` ADD COLUMN `officialSiteUserId` INTEGER NULL,
    MODIFY `passwordHash` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_officialSiteUserId_key` ON `User`(`officialSiteUserId`);

-- CreateIndex
CREATE INDEX `User_isActive_idx` ON `User`(`isActive`);

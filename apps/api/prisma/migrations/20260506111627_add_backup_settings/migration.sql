-- CreateEnum
CREATE TYPE "BackupFrequency" AS ENUM ('MANUAL', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "BackupTarget" AS ENUM ('LOCAL', 'GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('SUCCESS', 'FAILED', 'RUNNING');

-- CreateTable
CREATE TABLE "BackupSetting" (
    "id" TEXT NOT NULL,
    "frequency" "BackupFrequency" NOT NULL DEFAULT 'MANUAL',
    "localBackupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "localBackupPath" TEXT NOT NULL DEFAULT './backups',
    "googleDriveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "googleAccountEmail" TEXT,
    "googleDriveFolderId" TEXT,
    "lastBackupAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupHistory" (
    "id" TEXT NOT NULL,
    "target" "BackupTarget" NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'RUNNING',
    "fileName" TEXT,
    "filePath" TEXT,
    "googleDriveFileId" TEXT,
    "googleAccountEmail" TEXT,
    "sizeBytes" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupHistory_pkey" PRIMARY KEY ("id")
);

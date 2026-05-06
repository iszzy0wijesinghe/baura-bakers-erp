-- AlterTable
ALTER TABLE "BackupSetting" ADD COLUMN     "googleDriveAccessToken" TEXT,
ADD COLUMN     "googleDriveConnectedAt" TIMESTAMP(3),
ADD COLUMN     "googleDriveRefreshToken" TEXT,
ADD COLUMN     "googleDriveTokenExpiry" TIMESTAMP(3),
ADD COLUMN     "googleOauthState" TEXT;

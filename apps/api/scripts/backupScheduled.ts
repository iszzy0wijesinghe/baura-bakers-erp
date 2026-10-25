/** Run from apps/api with: npx tsx src/scripts/backupScheduled.ts
 * Schedule via OS cron/systemd; independent of browser sessions.
 * LOCAL BACKUP ONLY: Google Drive scheduler integration is not implemented here.
 */
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { createBackupFileName, createDatabaseDump } from "../src/lib/mysqlBackup";

async function main() {
  const setting = await prisma.backupSetting.findFirst();
  if (!setting || setting.frequency === "MANUAL" || !setting.localBackupEnabled) {
    console.log("Scheduled local backup skipped: disabled or manual setting.");
    return;
  }
  const now = new Date();
  const elapsed = setting.lastBackupAt ? now.getTime() - setting.lastBackupAt.getTime() : Infinity;
  const minInterval = setting.frequency === "DAILY" ? 20 * 3600000
    : setting.frequency === "WEEKLY" ? 6 * 86400000 : 27 * 86400000;
  if (elapsed < minInterval) { console.log("Scheduled local backup not due."); return; }
  const dir = path.resolve(process.env.BAURA_BACKUP_DIR || "./backups");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const filename = createBackupFileName();
  const destination = path.join(dir, filename);
  const history = await prisma.backupHistory.create({data: {
    target: "LOCAL", status: "RUNNING", fileName: filename, filePath: destination
  }});
  try {
    await createDatabaseDump(destination);
    const stat = fs.statSync(destination);
    if (stat.size === 0) throw new Error("Backup file is empty");
    fs.chmodSync(destination, 0o600);
    await prisma.backupHistory.update({where: {id: history.id}, data: {
      status: "SUCCESS", sizeBytes: stat.size, completedAt: new Date()
    }});
    await prisma.backupSetting.update({where: {id: setting.id}, data: {lastBackupAt: new Date()}});
    console.log(`Local backup completed: ${destination} (${stat.size} bytes)`);
  } catch (error) {
    await prisma.backupHistory.update({where: {id: history.id}, data: {
      status: "FAILED", errorMessage: String(error).slice(0, 1000), completedAt: new Date()
    }});
    try { fs.rmSync(destination, {force: true}); } catch { /* ignore cleanup */ }
    throw error;
  }
}
main().catch(error => {console.error(error); process.exitCode = 1;})
  .finally(async () => {await prisma.$disconnect();});

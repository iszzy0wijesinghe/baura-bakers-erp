import { Router } from "express";
import { execFile } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { google } from "googleapis";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();
const execFileAsync = promisify(execFile);

const backupSettingSchema = z.object({
  frequency: z.enum(["MANUAL", "DAILY", "WEEKLY", "MONTHLY"]),
  localBackupEnabled: z.boolean(),
  localBackupPath: z.string().trim().min(1, "Local backup path is required"),
  googleDriveEnabled: z.boolean(),
  googleAccountEmail: z.string().email().optional().nullable(),
  googleDriveFolderId: z.string().trim().optional().nullable()
});

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  return databaseUrl;
}

function getPgDumpDatabaseUrl() {
  const databaseUrl = getDatabaseUrl();
  const url = new URL(databaseUrl);

  // Prisma supports ?schema=public, but pg_dump does not.
  url.searchParams.delete("schema");

  return url.toString();
}

function getGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google Drive OAuth is not configured. Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI."
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function ensureBackupFolder(folderPath: string) {
  const resolvedPath = path.isAbsolute(folderPath)
    ? folderPath
    : path.resolve(process.cwd(), folderPath);

  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(resolvedPath, { recursive: true });
  }

  return resolvedPath;
}

function createBackupFileName() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");

  return `baura-db-backup-${timestamp}.dump`;
}

function cleanBackupSetting(setting: Awaited<ReturnType<typeof getOrCreateBackupSetting>>) {
  return {
    id: setting.id,
    frequency: setting.frequency,
    localBackupEnabled: setting.localBackupEnabled,
    localBackupPath: setting.localBackupPath,
    googleDriveEnabled: setting.googleDriveEnabled,
    googleAccountEmail: setting.googleAccountEmail,
    googleDriveFolderId: setting.googleDriveFolderId,
    googleDriveConnectedAt: setting.googleDriveConnectedAt,
    isGoogleDriveConnected: Boolean(setting.googleDriveRefreshToken),
    lastBackupAt: setting.lastBackupAt,
    createdAt: setting.createdAt,
    updatedAt: setting.updatedAt
  };
}

async function getOrCreateBackupSetting() {
  const existing = await prisma.backupSetting.findFirst({
    orderBy: {
      createdAt: "asc"
    }
  });

  if (existing) return existing;

  return prisma.backupSetting.create({
    data: {
      frequency: "MANUAL",
      localBackupEnabled: true,
      localBackupPath: "./backups",
      googleDriveEnabled: false
    }
  });
}

async function createDatabaseDump(filePath: string) {
  const databaseUrl = getPgDumpDatabaseUrl();
  const pgDumpPath = process.env.PG_DUMP_PATH || "pg_dump";

  await execFileAsync(pgDumpPath, [
    "--format=custom",
    "--file",
    filePath,
    databaseUrl
  ]);
}

async function uploadBackupToGoogleDrive({
  filePath,
  fileName,
  folderId,
  refreshToken,
  accessToken,
  tokenExpiry
}: {
  filePath: string;
  fileName: string;
  folderId: string | null;
  refreshToken: string;
  accessToken: string | null;
  tokenExpiry: Date | null;
}) {
  const auth = getGoogleOAuthClient();

  auth.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken || undefined,
    expiry_date: tokenExpiry ? tokenExpiry.getTime() : undefined
  });

  const drive = google.drive({
    version: "v3",
    auth
  });

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: folderId ? [folderId] : undefined
    },
    media: {
      mimeType: "application/octet-stream",
      body: fs.createReadStream(filePath)
    },
    fields: "id, name, size, webViewLink"
  });

  const credentials = auth.credentials;

  return {
    fileId: response.data.id || null,
    fileName: response.data.name || fileName,
    sizeBytes: response.data.size ? Number(response.data.size) : null,
    accessToken: credentials.access_token || null,
    tokenExpiry: credentials.expiry_date
      ? new Date(credentials.expiry_date)
      : null
  };
}

/**
 * Public callback.
 * Google redirects here without your JWT Authorization header.
 */
router.get("/google-drive/callback", async (req, res) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";

    if (!code || !state) {
      return res.status(400).send("Missing Google OAuth code or state.");
    }

    const setting = await prisma.backupSetting.findFirst({
      where: {
        googleOauthState: state
      }
    });

    if (!setting) {
      return res.status(400).send("Invalid Google OAuth state.");
    }

    const auth = getGoogleOAuthClient();
    const tokenResponse = await auth.getToken(code);

    auth.setCredentials(tokenResponse.tokens);

    const oauth2 = google.oauth2({
      version: "v2",
      auth
    });

    const userInfo = await oauth2.userinfo.get();

    const refreshToken =
      tokenResponse.tokens.refresh_token || setting.googleDriveRefreshToken;

    if (!refreshToken) {
      return res.status(400).send(
        "Google did not return a refresh token. Remove app access from your Google Account permissions and connect again."
      );
    }

    await prisma.backupSetting.update({
      where: {
        id: setting.id
      },
      data: {
        googleDriveEnabled: true,
        googleAccountEmail: userInfo.data.email || setting.googleAccountEmail,
        googleDriveRefreshToken: refreshToken,
        googleDriveAccessToken: tokenResponse.tokens.access_token || null,
        googleDriveTokenExpiry: tokenResponse.tokens.expiry_date
          ? new Date(tokenResponse.tokens.expiry_date)
          : null,
        googleDriveConnectedAt: new Date(),
        googleOauthState: null
      }
    });

    return res.send(`
      <!doctype html>
      <html>
        <head>
          <title>Google Drive Connected</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: #FFF8F0;
              color: #5A2E18;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
            }
            .card {
              max-width: 480px;
              border-radius: 28px;
              background: white;
              padding: 32px;
              box-shadow: 0 16px 40px rgba(90,46,24,.12);
              text-align: center;
            }
            h1 {
              margin: 0 0 12px;
            }
            p {
              color: rgba(90,46,24,.72);
              line-height: 1.6;
            }
            a {
              display: inline-block;
              margin-top: 16px;
              background: #5A2E18;
              color: #FFF8F0;
              text-decoration: none;
              padding: 12px 18px;
              border-radius: 16px;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Google Drive Connected</h1>
            <p>Your Google Drive account was connected successfully. You can close this tab and return to Baura Bakery ERP Settings.</p>
            <a href="http://localhost:5173/dashboard/settings">Back to Settings</a>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Google Drive OAuth callback failed:", err);

    return res.status(500).send(
      err instanceof Error ? err.message : "Google Drive connection failed."
    );
  }
});

router.use(authMiddleware);

router.get("/backup", async (_req, res) => {
  const setting = await getOrCreateBackupSetting();

  return res.json({
    backupSetting: cleanBackupSetting(setting)
  });
});

router.put("/backup", async (req, res) => {
  const parsed = backupSettingSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      message: "Invalid backup settings",
      errors: parsed.error.flatten()
    });
  }

  const existing = await getOrCreateBackupSetting();

  const setting = await prisma.backupSetting.update({
    where: {
      id: existing.id
    },
    data: {
      frequency: parsed.data.frequency,
      localBackupEnabled: parsed.data.localBackupEnabled,
      localBackupPath: parsed.data.localBackupPath,
      googleDriveEnabled: parsed.data.googleDriveEnabled,
      googleAccountEmail: parsed.data.googleAccountEmail || null,
      googleDriveFolderId: parsed.data.googleDriveFolderId || null
    }
  });

  return res.json({
    backupSetting: cleanBackupSetting(setting)
  });
});

router.get("/google-drive/auth-url", async (_req, res) => {
  const setting = await getOrCreateBackupSetting();
  const auth = getGoogleOAuthClient();
  const state = crypto.randomBytes(24).toString("hex");

  await prisma.backupSetting.update({
    where: {
      id: setting.id
    },
    data: {
      googleOauthState: state
    }
  });

  const authUrl = auth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    state,
    scope: [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email"
    ]
  });

  return res.json({
    authUrl
  });
});

router.post("/google-drive/disconnect", async (_req, res) => {
  const setting = await getOrCreateBackupSetting();

  const updated = await prisma.backupSetting.update({
    where: {
      id: setting.id
    },
    data: {
      googleDriveEnabled: false,
      googleAccountEmail: null,
      googleDriveRefreshToken: null,
      googleDriveAccessToken: null,
      googleDriveTokenExpiry: null,
      googleDriveConnectedAt: null,
      googleOauthState: null
    }
  });

  return res.json({
    backupSetting: cleanBackupSetting(updated)
  });
});

router.get("/backups/history", async (_req, res) => {
  const history = await prisma.backupHistory.findMany({
    orderBy: {
      startedAt: "desc"
    },
    take: 100
  });

  return res.json({
    history
  });
});

router.post("/backups/run", async (_req, res) => {
  const setting = await getOrCreateBackupSetting();

  if (!setting.localBackupEnabled && !setting.googleDriveEnabled) {
    return res.status(400).json({
      message: "No backup target enabled"
    });
  }

  if (setting.googleDriveEnabled && !setting.googleDriveRefreshToken) {
    return res.status(400).json({
      message: "Google Drive is enabled but not connected. Connect Google Drive first."
    });
  }

  const backupFolder = ensureBackupFolder(setting.localBackupPath || "./backups");
  const fileName = createBackupFileName();
  const filePath = path.join(backupFolder, fileName);

  let localHistoryId: string | null = null;
  let driveHistoryId: string | null = null;

  try {
    if (setting.localBackupEnabled) {
      const localHistory = await prisma.backupHistory.create({
        data: {
          target: "LOCAL",
          status: "RUNNING",
          fileName,
          filePath
        }
      });

      localHistoryId = localHistory.id;
    }

    if (setting.googleDriveEnabled) {
      const driveHistory = await prisma.backupHistory.create({
        data: {
          target: "GOOGLE_DRIVE",
          status: "RUNNING",
          fileName,
          googleAccountEmail: setting.googleAccountEmail
        }
      });

      driveHistoryId = driveHistory.id;
    }

    await createDatabaseDump(filePath);

    const stat = fs.statSync(filePath);

    let localBackup = null;
    let driveBackup = null;

    if (localHistoryId) {
      localBackup = await prisma.backupHistory.update({
        where: {
          id: localHistoryId
        },
        data: {
          status: "SUCCESS",
          fileName,
          filePath,
          sizeBytes: stat.size,
          completedAt: new Date()
        }
      });
    }

    if (driveHistoryId && setting.googleDriveRefreshToken) {
      const uploaded = await uploadBackupToGoogleDrive({
        filePath,
        fileName,
        folderId: setting.googleDriveFolderId,
        refreshToken: setting.googleDriveRefreshToken,
        accessToken: setting.googleDriveAccessToken,
        tokenExpiry: setting.googleDriveTokenExpiry
      });

      driveBackup = await prisma.backupHistory.update({
        where: {
          id: driveHistoryId
        },
        data: {
          status: "SUCCESS",
          fileName: uploaded.fileName,
          filePath: setting.googleDriveFolderId
            ? `Google Drive folder: ${setting.googleDriveFolderId}`
            : "Google Drive / My Drive",
          googleDriveFileId: uploaded.fileId,
          googleAccountEmail: setting.googleAccountEmail,
          sizeBytes: uploaded.sizeBytes || stat.size,
          completedAt: new Date()
        }
      });

      await prisma.backupSetting.update({
        where: {
          id: setting.id
        },
        data: {
          googleDriveAccessToken: uploaded.accessToken,
          googleDriveTokenExpiry: uploaded.tokenExpiry
        }
      });
    }

    await prisma.backupSetting.update({
      where: {
        id: setting.id
      },
      data: {
        lastBackupAt: new Date()
      }
    });

    return res.status(201).json({
      message: "Database backup completed successfully",
      localBackup,
      driveBackup,
      backup: driveBackup || localBackup
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create database backup";

    if (localHistoryId) {
      await prisma.backupHistory.update({
        where: {
          id: localHistoryId
        },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: message
        }
      });
    }

    if (driveHistoryId) {
      await prisma.backupHistory.update({
        where: {
          id: driveHistoryId
        },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: message
        }
      });
    }

    return res.status(500).json({
      message
    });
  }
});

export default router;
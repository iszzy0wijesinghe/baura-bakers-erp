import { Router } from "express";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { google } from "googleapis";
import { z } from "zod";

import { prisma } from "../../lib/prisma";
import {
  authMiddleware,
  requireRoles
} from "../../middleware/auth.middleware";
import {
  env,
  isGoogleDriveConfigured
} from "../../config/env";
import {
  createBackupFileName,
  createDatabaseDump
} from "../../lib/mysqlBackup";

const router = Router();

const backupSettingSchema =
  z.object({
    frequency: z.enum([
      "MANUAL",
      "DAILY",
      "WEEKLY",
      "MONTHLY"
    ]),

    localBackupEnabled:
      z.boolean(),

    localBackupPath: z
      .string()
      .trim()
      .min(
        1,
        "Local backup path is required"
      ),

    googleDriveEnabled:
      z.boolean(),

    googleAccountEmail: z
      .string()
      .email()
      .optional()
      .nullable(),

    googleDriveFolderId: z
      .string()
      .trim()
      .optional()
      .nullable()
  });

function getGoogleOAuthClient() {
  if (
    !isGoogleDriveConfigured()
  ) {
    throw new Error(
      "Google Drive OAuth is not configured."
    );
  }

  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID!,
    env.GOOGLE_CLIENT_SECRET!,
    env.GOOGLE_REDIRECT_URI!
  );
}

function ensureBackupFolder(
  folderPath: string
) {
  const resolvedPath =
    path.isAbsolute(folderPath)
      ? folderPath
      : path.resolve(
          process.cwd(),
          folderPath
        );

  fs.mkdirSync(
    resolvedPath,
    {
      recursive: true
    }
  );

  return resolvedPath;
}

async function getOrCreateBackupSetting() {
  const existing =
    await prisma.backupSetting.findFirst({
      orderBy: {
        createdAt: "asc"
      }
    });

  if (existing) {
    return existing;
  }

  return prisma.backupSetting.create({
    data: {
      frequency: "MANUAL",
      localBackupEnabled: true,
      localBackupPath:
        "./backups",
      googleDriveEnabled: false
    }
  });
}

function cleanBackupSetting(
  setting: Awaited<
    ReturnType<
      typeof getOrCreateBackupSetting
    >
  >
) {
  return {
    id: setting.id,

    frequency:
      setting.frequency,

    localBackupEnabled:
      setting.localBackupEnabled,

    localBackupPath:
      setting.localBackupPath,

    googleDriveEnabled:
      setting.googleDriveEnabled,

    googleAccountEmail:
      setting.googleAccountEmail,

    googleDriveFolderId:
      setting.googleDriveFolderId,

    googleDriveConnectedAt:
      setting.googleDriveConnectedAt,

    isGoogleDriveConnected:
      Boolean(
        setting.googleDriveRefreshToken
      ),

    isGoogleDriveConfigured:
      isGoogleDriveConfigured(),

    lastBackupAt:
      setting.lastBackupAt,

    createdAt:
      setting.createdAt,

    updatedAt:
      setting.updatedAt
  };
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
  const auth =
    getGoogleOAuthClient();

  auth.setCredentials({
    refresh_token:
      refreshToken,

    access_token:
      accessToken || undefined,

    expiry_date:
      tokenExpiry
        ? tokenExpiry.getTime()
        : undefined
  });

  const drive = google.drive({
    version: "v3",
    auth
  });

  const response =
    await drive.files.create({
      requestBody: {
        name: fileName,
        parents: folderId
          ? [folderId]
          : undefined
      },

      media: {
        mimeType:
          "application/sql",

        body:
          fs.createReadStream(
            filePath
          )
      },

      fields:
        "id, name, size, webViewLink"
    });

  const credentials =
    auth.credentials;

  return {
    fileId:
      response.data.id || null,

    fileName:
      response.data.name ||
      fileName,

    sizeBytes:
      response.data.size
        ? Number(
            response.data.size
          )
        : null,

    accessToken:
      credentials.access_token ||
      null,

    tokenExpiry:
      credentials.expiry_date
        ? new Date(
            credentials.expiry_date
          )
        : null
  };
}

/*
 * Public OAuth callback.
 * Google redirects here without
 * the user's ERP JWT.
 */
router.get(
  "/google-drive/callback",
  async (req, res) => {
    try {
      if (
        !isGoogleDriveConfigured()
      ) {
        return res
          .status(503)
          .send(
            "Google Drive backup is not configured on this ERP server."
          );
      }

      const code =
        typeof req.query.code ===
        "string"
          ? req.query.code
          : "";

      const state =
        typeof req.query.state ===
        "string"
          ? req.query.state
          : "";

      if (!code || !state) {
        return res
          .status(400)
          .send(
            "Missing Google OAuth code or state."
          );
      }

      const setting =
        await prisma.backupSetting.findFirst(
          {
            where: {
              googleOauthState:
                state
            }
          }
        );

      if (!setting) {
        return res
          .status(400)
          .send(
            "Invalid or expired Google OAuth state."
          );
      }

      const auth =
        getGoogleOAuthClient();

      const tokenResponse =
        await auth.getToken(code);

      auth.setCredentials(
        tokenResponse.tokens
      );

      const oauth2 =
        google.oauth2({
          version: "v2",
          auth
        });

      const userInfo =
        await oauth2.userinfo.get();

      const refreshToken =
        tokenResponse.tokens
          .refresh_token ||
        setting.googleDriveRefreshToken;

      if (!refreshToken) {
        return res
          .status(400)
          .send(
            "Google did not provide a refresh token. Disconnect the app from your Google Account and connect again."
          );
      }

      await prisma.backupSetting.update(
        {
          where: {
            id: setting.id
          },

          data: {
            googleDriveEnabled:
              true,

            googleAccountEmail:
              userInfo.data.email ||
              setting.googleAccountEmail,

            googleDriveRefreshToken:
              refreshToken,

            googleDriveAccessToken:
              tokenResponse.tokens
                .access_token ||
              null,

            googleDriveTokenExpiry:
              tokenResponse.tokens
                .expiry_date
                ? new Date(
                    tokenResponse
                      .tokens
                      .expiry_date
                  )
                : null,

            googleDriveConnectedAt:
              new Date(),

            googleOauthState:
              null
          }
        }
      );

      return res.send(`
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Google Drive Connected</title>
            <style>
              * {
                box-sizing: border-box;
              }

              body {
                margin: 0;
                min-height: 100vh;
                display: grid;
                place-items: center;
                padding: 24px;
                background: #f5f2eb;
                color: #372619;
                font-family:
                  Inter,
                  -apple-system,
                  BlinkMacSystemFont,
                  "Segoe UI",
                  sans-serif;
              }

              main {
                width: min(460px, 100%);
                padding: 32px;
                border: 1px solid #ded8cf;
                border-radius: 12px;
                background: #fff;
              }

              h1 {
                margin: 0;
                font-size: 24px;
              }

              p {
                margin: 12px 0 0;
                color: #6d6259;
                line-height: 1.6;
              }

              a {
                display: inline-block;
                margin-top: 24px;
                padding: 10px 16px;
                border-radius: 8px;
                background: #372619;
                color: white;
                text-decoration: none;
                font-weight: 600;
              }
            </style>
          </head>

          <body>
            <main>
              <h1>Google Drive connected</h1>

              <p>
                Database backups can now be uploaded to this Google Drive account.
              </p>

              <a href="${env.FRONTEND_URL}/dashboard/settings">
                Return to ERP
              </a>
            </main>
          </body>
        </html>
      `);
    } catch (error) {
      console.error(
        "Google OAuth callback error:",
        error
      );

      return res
        .status(500)
        .send(
          "Google Drive connection failed."
        );
    }
  }
);

router.use(authMiddleware);

router.use(
  requireRoles("ADMIN")
);

router.get(
  "/backup",
  async (_req, res) => {
    const setting =
      await getOrCreateBackupSetting();

    return res.json({
      backupSetting:
        cleanBackupSetting(
          setting
        )
    });
  }
);

router.put(
  "/backup",
  async (req, res) => {
    const parsed =
      backupSettingSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return res
        .status(400)
        .json({
          message:
            "Invalid backup settings",

          errors:
            parsed.error.flatten()
        });
    }

    if (
      parsed.data
        .googleDriveEnabled &&
      !isGoogleDriveConfigured()
    ) {
      return res
        .status(400)
        .json({
          message:
            "Google Drive OAuth is not configured on this server."
        });
    }

    const existing =
      await getOrCreateBackupSetting();

    const setting =
      await prisma.backupSetting.update(
        {
          where: {
            id: existing.id
          },

          data: {
            frequency:
              parsed.data.frequency,

            localBackupEnabled:
              parsed.data
                .localBackupEnabled,

            localBackupPath:
              parsed.data
                .localBackupPath,

            googleDriveEnabled:
              parsed.data
                .googleDriveEnabled,

            googleAccountEmail:
              parsed.data
                .googleAccountEmail ||
              null,

            googleDriveFolderId:
              parsed.data
                .googleDriveFolderId ||
              null
          }
        }
      );

    return res.json({
      backupSetting:
        cleanBackupSetting(
          setting
        )
    });
  }
);

router.get(
  "/google-drive/auth-url",
  async (_req, res) => {
    if (
      !isGoogleDriveConfigured()
    ) {
      return res
        .status(503)
        .json({
          message:
            "Google Drive backup is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI to apps/api/.env."
        });
    }

    const setting =
      await getOrCreateBackupSetting();

    const auth =
      getGoogleOAuthClient();

    const state =
      crypto
        .randomBytes(32)
        .toString("hex");

    await prisma.backupSetting.update(
      {
        where: {
          id: setting.id
        },

        data: {
          googleOauthState:
            state
        }
      }
    );

    const authUrl =
      auth.generateAuthUrl({
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
  }
);

router.post(
  "/google-drive/disconnect",
  async (_req, res) => {
    const setting =
      await getOrCreateBackupSetting();

    const updated =
      await prisma.backupSetting.update(
        {
          where: {
            id: setting.id
          },

          data: {
            googleDriveEnabled:
              false,

            googleAccountEmail:
              null,

            googleDriveRefreshToken:
              null,

            googleDriveAccessToken:
              null,

            googleDriveTokenExpiry:
              null,

            googleDriveConnectedAt:
              null,

            googleOauthState:
              null
          }
        }
      );

    return res.json({
      backupSetting:
        cleanBackupSetting(
          updated
        )
    });
  }
);

router.get(
  "/backups/history",
  async (_req, res) => {
    const history =
      await prisma.backupHistory.findMany(
        {
          orderBy: {
            startedAt: "desc"
          },

          take: 100
        }
      );

    return res.json({
      history
    });
  }
);

router.post(
  "/backups/run",
  async (_req, res) => {
    const setting =
      await getOrCreateBackupSetting();

    if (
      !setting.localBackupEnabled &&
      !setting.googleDriveEnabled
    ) {
      return res
        .status(400)
        .json({
          message:
            "Enable at least one backup destination."
        });
    }

    if (
      setting.googleDriveEnabled &&
      !isGoogleDriveConfigured()
    ) {
      return res
        .status(400)
        .json({
          message:
            "Google Drive OAuth is not configured on this server."
        });
    }

    if (
      setting.googleDriveEnabled &&
      !setting.googleDriveRefreshToken
    ) {
      return res
        .status(400)
        .json({
          message:
            "Google Drive is enabled but not connected."
        });
    }

    const fileName =
      createBackupFileName();

    let temporaryFolder:
      | string
      | null = null;

    const backupFolder =
      setting.localBackupEnabled
        ? ensureBackupFolder(
            setting.localBackupPath ||
              "./backups"
          )
        : (() => {
            temporaryFolder =
              fs.mkdtempSync(
                path.join(
                  os.tmpdir(),
                  "baura-backup-"
                )
              );

            return temporaryFolder;
          })();

    const filePath =
      path.join(
        backupFolder,
        fileName
      );

    let localHistoryId:
      | string
      | null = null;

    let driveHistoryId:
      | string
      | null = null;

    try {
      if (
        setting.localBackupEnabled
      ) {
        const localHistory =
          await prisma.backupHistory.create(
            {
              data: {
                target: "LOCAL",
                status: "RUNNING",
                fileName,
                filePath
              }
            }
          );

        localHistoryId =
          localHistory.id;
      }

      if (
        setting.googleDriveEnabled
      ) {
        const driveHistory =
          await prisma.backupHistory.create(
            {
              data: {
                target:
                  "GOOGLE_DRIVE",

                status: "RUNNING",

                fileName,

                googleAccountEmail:
                  setting.googleAccountEmail
              }
            }
          );

        driveHistoryId =
          driveHistory.id;
      }

      await createDatabaseDump(
        filePath
      );

      const stat =
        fs.statSync(filePath);

      let localBackup = null;
      let driveBackup = null;

      if (localHistoryId) {
        localBackup =
          await prisma.backupHistory.update(
            {
              where: {
                id: localHistoryId
              },

              data: {
                status: "SUCCESS",
                fileName,
                filePath,
                sizeBytes:
                  stat.size,
                completedAt:
                  new Date()
              }
            }
          );
      }

      if (
        driveHistoryId &&
        setting.googleDriveRefreshToken
      ) {
        const uploaded =
          await uploadBackupToGoogleDrive(
            {
              filePath,
              fileName,

              folderId:
                setting.googleDriveFolderId,

              refreshToken:
                setting.googleDriveRefreshToken,

              accessToken:
                setting.googleDriveAccessToken,

              tokenExpiry:
                setting.googleDriveTokenExpiry
            }
          );

        driveBackup =
          await prisma.backupHistory.update(
            {
              where: {
                id:
                  driveHistoryId
              },

              data: {
                status:
                  "SUCCESS",

                fileName:
                  uploaded.fileName,

                filePath:
                  setting.googleDriveFolderId
                    ? `Google Drive folder: ${setting.googleDriveFolderId}`
                    : "Google Drive / My Drive",

                googleDriveFileId:
                  uploaded.fileId,

                googleAccountEmail:
                  setting.googleAccountEmail,

                sizeBytes:
                  uploaded.sizeBytes ||
                  stat.size,

                completedAt:
                  new Date()
              }
            }
          );

        await prisma.backupSetting.update(
          {
            where: {
              id: setting.id
            },

            data: {
              googleDriveAccessToken:
                uploaded.accessToken,

              googleDriveTokenExpiry:
                uploaded.tokenExpiry
            }
          }
        );
      }

      await prisma.backupSetting.update(
        {
          where: {
            id: setting.id
          },

          data: {
            lastBackupAt:
              new Date()
          }
        }
      );

      return res
        .status(201)
        .json({
          message:
            "MySQL backup completed successfully.",

          localBackup,
          driveBackup
        });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Database backup failed";

      if (localHistoryId) {
        await prisma.backupHistory.update(
          {
            where: {
              id:
                localHistoryId
            },

            data: {
              status: "FAILED",
              completedAt:
                new Date(),
              errorMessage:
                message
            }
          }
        );
      }

      if (driveHistoryId) {
        await prisma.backupHistory.update(
          {
            where: {
              id:
                driveHistoryId
            },

            data: {
              status: "FAILED",
              completedAt:
                new Date(),
              errorMessage:
                message
            }
          }
        );
      }

      return res
        .status(500)
        .json({
          message
        });
    } finally {
      if (temporaryFolder) {
        fs.rmSync(
          temporaryFolder,
          {
            recursive: true,
            force: true
          }
        );
      }
    }
  }
);

export default router;
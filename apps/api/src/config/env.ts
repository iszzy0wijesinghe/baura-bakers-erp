import "dotenv/config";
import { z } from "zod";

const optionalString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();

    return trimmed.length === 0
      ? undefined
      : trimmed;
  },
  z.string().optional(),
);

const envSchema = z.object({
  NODE_ENV: z
    .enum([
      "development",
      "test",
      "production",
    ])
    .default("development"),

  DATABASE_URL: z
    .string()
    .min(
      1,
      "DATABASE_URL is required",
    ),

  JWT_SECRET: z
    .string()
    .min(
      64,
      "JWT_SECRET must contain at least 64 characters",
    ),

  JWT_EXPIRES_IN: z
    .string()
    .default("4h"),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(4000),

  FRONTEND_URL: z
    .string()
    .min(1)
    .default(
      "http://localhost:5173",
    ),

  OFFICIAL_SITE_API_URL: z
    .string()
    .url(
      "OFFICIAL_SITE_API_URL must be a valid URL",
    ),

  ERP_INTEGRATION_TOKEN: z
    .string()
    .min(
      32,
      "ERP_INTEGRATION_TOKEN must contain at least 32 characters",
    ),

  LOGIN_RATE_LIMIT_WINDOW_MINUTES:
    z.coerce
      .number()
      .int()
      .positive()
      .default(15),

  LOGIN_RATE_LIMIT_MAX_ATTEMPTS:
    z.coerce
      .number()
      .int()
      .positive()
      .default(10),

  MYSQLDUMP_PATH:
    optionalString,

  GOOGLE_CLIENT_ID:
    optionalString,

  GOOGLE_CLIENT_SECRET:
    optionalString,

  GOOGLE_REDIRECT_URI:
    optionalString,
});

const parsed =
  envSchema.safeParse(
    process.env,
  );

if (!parsed.success) {
  console.error(
    "Invalid environment configuration:",
  );

  console.error(
    parsed.error.flatten()
      .fieldErrors,
  );

  throw new Error(
    "Invalid environment configuration",
  );
}

export const env =
  parsed.data;

export const isProduction =
  env.NODE_ENV ===
  "production";

export function isGoogleDriveConfigured() {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_REDIRECT_URI,
  );
}
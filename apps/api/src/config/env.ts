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
  z.string().optional()
);

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),

  JWT_SECRET: z
    .string()
    .min(
      32,
      "JWT_SECRET must contain at least 32 characters"
    ),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(4000),

  FRONTEND_URL: z
    .string()
    .url()
    .default("http://localhost:5173"),

  MYSQLDUMP_PATH: optionalString,

  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalString
});

const parsed = envSchema.safeParse(
  process.env
);

if (!parsed.success) {
  console.error(
    "Invalid environment configuration:"
  );

  console.error(
    parsed.error.flatten().fieldErrors
  );

  throw new Error(
    "Invalid environment configuration"
  );
}

export const env = parsed.data;

export function isGoogleDriveConfigured() {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_REDIRECT_URI
  );
}
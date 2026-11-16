import { env } from "../config/env";

export function officialSiteUrl(path: string): string {
  const configuredBase = env.OFFICIAL_SITE_API_URL.trim();

  if (!configuredBase) {
    throw new Error("OFFICIAL_SITE_API_URL is not configured.");
  }

  const base = new URL(
    configuredBase.endsWith("/")
      ? configuredBase
      : `${configuredBase}/`,
  );

  const relativePath = path.replace(/^\/+/, "");
  const basePath = base.pathname.replace(/\/+$/, "");

  const baseIncludesApiVersion = /(?:^|\/)api\/v1$/.test(basePath);

  const normalizedPath = baseIncludesApiVersion
    ? relativePath.replace(/^api\/v1\//, "")
    : relativePath;

  return new URL(normalizedPath, base).toString();
}

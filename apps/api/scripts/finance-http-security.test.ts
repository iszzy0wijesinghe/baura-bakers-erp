/** @format */

import assert from "node:assert/strict";
import { test } from "node:test";

/** Read-only HTTP authorization regression suite. No finance records are written. */
const base = (
  process.env.FINANCE_HTTP_BASE_URL ?? "http://127.0.0.1:3000/api/finance"
).replace(/\/$/, "");
const lowToken = process.env.FINANCE_READONLY_TOKEN;
const privilegedToken = process.env.FINANCE_ADMIN_TOKEN;
const timeoutMs = 8000;

async function request(path: string, method = "GET", token?: string) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
    },
    // Intentionally invalid request body; all write requests should be blocked by auth or feature flag.
    ...(method !== "GET" ? { body: JSON.stringify({}) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.text();
  return { status: response.status, body };
}

const endpoints: Array<[string, string]> = [
  ["GET", "/years"],
  ["GET", "/accounts"],
  ["GET", "/journals"],
  ["GET", "/periods"],
  ["GET", "/trial-balance"],
  ["POST", "/journals/post"],
  ["POST", "/years/initialize"],
  ["POST", "/periods/nonexistent-id/close"],
  ["POST", "/journals/nonexistent-id/reverse"],
];

for (const [method, path] of endpoints) {
  test(`anonymous ${method} ${path} is rejected (401)`, async () => {
    const { status, body } = await request(path, method);
    assert.equal(
      status,
      401,
      `Expected 401 from ${method} ${path}, got ${status}: ${body.slice(0, 250)}`,
    );
  });
}

test("malformed bearer token cannot read finance accounts", async () => {
  const { status, body } = await request(
    "/accounts",
    "GET",
    "not-a-valid-token",
  );
  assert.equal(
    status,
    401,
    `Expected 401, got ${status}: ${body.slice(0, 250)}`,
  );
});

if (lowToken) {
  for (const path of [
    "/journals/post",
    "/years/initialize",
    "/periods/nonexistent-id/close",
    "/journals/nonexistent-id/reverse",
  ]) {
    test(`read-only user cannot POST ${path} (403)`, async () => {
      const { status, body } = await request(path, "POST", lowToken);
      assert.equal(
        status,
        403,
        `Expected 403, got ${status}: ${body.slice(0, 250)}`,
      );
    });
  }
} else {
  console.log(
    "SKIP role-based 403 tests: FINANCE_READONLY_TOKEN not supplied.",
  );
}

if (privilegedToken) {
  for (const path of [
    "/journals/post",
    "/periods/nonexistent-id/close",
    "/journals/nonexistent-id/reverse",
  ]) {
    test(`authorized user cannot POST ${path} while posting is disabled (503)`, async () => {
      const { status, body } = await request(path, "POST", privilegedToken);
      assert.equal(
        status,
        503,
        `Expected 503, got ${status}: ${body.slice(0, 250)}`,
      );
    });
  }
} else {
  console.log(
    "SKIP authenticated feature-flag tests: FINANCE_ADMIN_TOKEN not supplied.",
  );
}

console.log(
  `Testing ${base}. Start the API first; keep FINANCE_POSTING_ENABLED=false and FINANCE_OPERATIONS_ENABLED=false.`,
);

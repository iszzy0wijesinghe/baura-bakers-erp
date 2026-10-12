/** @format */

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import financeRouter from "../src/modules/finance/finance.routes";

const originalPosting = process.env.FINANCE_POSTING_ENABLED;
const originalOperations = process.env.FINANCE_OPERATIONS_ENABLED;
process.env.FINANCE_POSTING_ENABLED = "false";
process.env.FINANCE_OPERATIONS_ENABLED = "false";

const app = express();
app.use(express.json());
app.use("/api/finance", financeRouter);
let server: ReturnType<typeof app.listen> | undefined;
let base = "";
let identity: { id: string; email: string; officialSiteUserId: number };

function sign(permissions: string[]) {
  return jwt.sign(
    {
      type: "access",
      email: identity.email,
      officialSiteUserId: identity.officialSiteUserId,
      permissions: ["erp.access", ...permissions],
    },
    env.JWT_SECRET,
    {
      subject: identity.id,
      algorithm: "HS256",
      issuer: "baura-erp-api",
      audience: "baura-erp",
      expiresIn: "5m",
    },
  );
}

before(async () => {
  const user = await prisma.user.findFirst({
    where: { isActive: true, officialSiteUserId: { not: null } },
    select: { id: true, email: true, officialSiteUserId: true },
  });
  if (!user || user.officialSiteUserId === null) {
    throw new Error(
      "No active ERP user linked to the official site. Test requires an existing identity; no user will be created.",
    );
  }
  identity = {
    id: user.id,
    email: user.email,
    officialSiteUserId: user.officialSiteUserId,
  };
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server!.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Unable to bind HTTP test server");
  base = `http://127.0.0.1:${address.port}/api/finance`;
});

after(async () => {
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  if (originalPosting === undefined) delete process.env.FINANCE_POSTING_ENABLED;
  else process.env.FINANCE_POSTING_ENABLED = originalPosting;
  if (originalOperations === undefined)
    delete process.env.FINANCE_OPERATIONS_ENABLED;
  else process.env.FINANCE_OPERATIONS_ENABLED = originalOperations;
  await prisma.$disconnect();
});

async function expectStatus(
  method: "GET" | "POST",
  path: string,
  permissions: string[] | null,
  expected: number,
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(permissions === null
        ? {}
        : { Authorization: `Bearer ${sign(permissions)}` }),
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "POST" ? { body: "{}" } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.text();
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: expected ${expected}, received ${response.status}: ${body.slice(0, 350)}`,
  );
}

const reader = ["erp.finance.read"];
const admin = [
  "erp.finance.read",
  "erp.finance.manage",
  "erp.finance.journals.post",
  "erp.finance.journals.reverse",
  "erp.finance.periods.close",
];

test("anonymous accounts request returns 401", () =>
  expectStatus("GET", "/accounts", null, 401));
test("authenticated ERP user without finance permission returns 403", () =>
  expectStatus("GET", "/accounts", [], 403));
test("finance reader can read accounts", () =>
  expectStatus("GET", "/accounts", reader, 200));
test("finance admin can read accounts", () =>
  expectStatus("GET", "/accounts", admin, 200));

for (const path of [
  "/journals/post",
  "/operations/expenses",
  "/operations/transfers",
  "/years/initialize",
  "/periods/nonexistent-id/close",
  "/journals/nonexistent-id/reverse",
]) {
  test(`finance reader denied POST ${path}`, () =>
    expectStatus("POST", path, reader, 403));
}
for (const path of [
  "/journals/post",
  "/operations/expenses",
  "/operations/transfers",
  "/periods/nonexistent-id/close",
  "/journals/nonexistent-id/reverse",
]) {
  test(`finance admin blocked by disabled flag POST ${path}`, () =>
    expectStatus("POST", path, admin, 503));
}

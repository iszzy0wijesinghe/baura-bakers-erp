import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
const base = join(process.cwd(), "src/modules/finance");
const main = readFileSync(join(base, "finance.routes.ts"), "utf8");
const controls = readFileSync(join(base, "finance.controls.routes.ts"), "utf8");
const operations = readFileSync(join(base, "finance.operations.routes.ts"), "utf8");
test("auth middleware precedes controls and operations routers", () => {
  const auth = main.indexOf("router.use(authMiddleware)");
  assert.ok(auth >= 0);
  assert.ok(auth < main.indexOf("router.use(controlsRouter)"));
  assert.ok(auth < main.indexOf("router.use(operationsRouter)"));
});
test("journal posting is explicitly locked by backend flag", () => {
  assert.match(main, /process\.env\.FINANCE_POSTING_ENABLED === "true"/);
  assert.match(main, /router\.post\("\/journals\/post"[\s\S]*?if \(!postingEnabled\(\)\)/);
});
test("reversal and period closing are explicitly locked", () => {
  assert.match(controls, /router\.post\("\/periods\/:id\/close"[\s\S]*?if \(!postingEnabled\(\)\)/);
  assert.match(controls, /router\.post\("\/journals\/:id\/reverse"[\s\S]*?if \(!postingEnabled\(\)\)/);
});
test("expense and transfer posting are explicitly locked", () => {
  assert.match(operations, /process\.env\.FINANCE_OPERATIONS_ENABLED === "true"/);
  assert.match(operations, /if \(!enabled\(\)\)/);
});
test("period locks exist in posting, reversing and closing", () => {
  assert.match(main, /FinancePeriod[\s\S]*?FOR UPDATE/);
  assert.match(controls, /FinancePeriod[\s\S]*?FOR UPDATE/);
  assert.match(operations, /FinancePeriod[\s\S]*?FOR UPDATE/);
});

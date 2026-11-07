import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../src/page-runtime.js", import.meta.url), "utf8");

test("maintenance displays only the approved two text strings", () => {
  const screen = runtime.split("function renderMaintenanceScreen(")[1].split("function headerMarkup(")[0];
  assert.match(screen, /title\.textContent = "Em manutenção"/);
  assert.match(screen, /info\.textContent = "Aguarde um tempo\."/);
  assert.doesNotMatch(screen, /iconNode|maintenance_message|settings\.maintenance_message/);
  assert.match(screen, /document\.body\.append\(screen\)/);
});

test("only verified Peixinho bypasses the maintenance gate", () => {
  assert.match(runtime, /const maintenanceExempt = isAdmin && String\(profile\.username \|\| ""\)\.toLowerCase\(\) === "peixinho"/);
  assert.match(runtime, /await checkMaintenance\(\)/);
  assert.match(runtime, /if \(maintenanceBlocked\) \{/);
  assert.match(runtime, /window\.setInterval\(\(\) => \{ void checkMaintenance\(\); \}, 3000\)/);
  assert.match(runtime, /window\.location\.reload\(\)/);
});

test("failure to verify maintenance does not grant access", () => {
  assert.match(runtime, /if \(error \|\| !data \|\| typeof data\.maintenance_mode !== "boolean"\)/);
  assert.match(runtime, /catch \(error\) \{\s*\/\/ Never expose application content/);
  assert.doesNotMatch(runtime, /continuing with page access/);
  assert.ok(runtime.indexOf("await checkMaintenance()") < runtime.indexOf("await render({ root, client: supabase"));
});

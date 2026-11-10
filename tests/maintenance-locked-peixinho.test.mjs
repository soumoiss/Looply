import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const runtime = readFileSync(new URL("../src/page-runtime.js", import.meta.url), "utf8");
const gate = readFileSync(new URL("../src/maintenance-gate.js", import.meta.url), "utf8");
const decision = readFileSync(new URL("../src/maintenance-decision.js", import.meta.url), "utf8");

test("maintenance displays only the approved two text strings", () => {
  const screen = gate.split("function maintenanceScreen(reason = 'maintenance') {")[1].split("function loginOrEntryPage()")[0];
  assert.match(screen, /title\.textContent = reason === "suspended" \? "Acesso suspenso" : "Em manutenção"/);
  assert.match(screen, /info\.textContent = reason === "suspended" \? "Esta conta está suspensa\." : "Aguarde um tempo\."/);
  assert.doesNotMatch(screen, /iconNode|maintenance_message|settings\.maintenance_message/);
  assert.match(screen, /document\.body\.append\(screen\)/);
});

test("global maintenance is the sole gate and doesn't double-block Peixinho", () => {
  assert.match(gate, /await evaluateMaintenanceAccess\(/);
  assert.match(decision, /"looply_maintenance_admin_bypass"/);
  assert.match(decision, /"v3_self_is_admin"/);
  assert.match(decision, /\/v3_self_profile\?select=username/);
  assert.doesNotMatch(runtime, /maintenanceBlocked|renderMaintenanceScreen|checkMaintenance\(/);
  assert.match(runtime, /if \(!isAdmin\) isAdmin = await verifiedPeixinhoAdmin\(\)/);
});

test("session errors on login never hide the login form from Peixinho", () => {
  assert.match(gate, /if \(loginOrEntryPage\(\)\) return true;/);
  assert.match(gate, /if \(!allowed\) maintenanceScreen\(suspended \? "suspended" : "maintenance"\)/);
  assert.match(gate, /else if \(blocked\) window\.location\.reload\(\)/);
});

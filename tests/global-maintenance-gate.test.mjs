import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const read = relative => readFileSync(path.join(root, relative), "utf8");

test("maintenance is enforced at the production HTML entrypoint, not only a page component", () => {
  const build = read("scripts/build.mjs");
  const boot = read("src/maintenance-bootstrap.js");
  assert.match(build, /looply-maintenance-pending/);
  assert.match(build, /data-looply-entry/);
  assert.match(build, /src\/maintenance-bootstrap\.js/);
  assert.match(boot, /await startMaintenanceGate\(\)/);
  assert.match(boot, /await import\(url\.href\)/);
  for (const page of ["home.html", "chat.html", "conversa.html", "cartas.html",
      "musicas.html", "admin.html", "login.html", "index.html", "why-now.html"]) {
    const built = path.join(root, "dist", page);
    assert.ok(existsSync(built), page);
    const html = readFileSync(built, "utf8");
    assert.match(html, /looply-maintenance-conceal/, page);
    assert.match(html, /src\/maintenance-bootstrap\.js/, page);
    assert.doesNotMatch(html, /<script\s+type="module"\s+src="(?:assets\/js\/|src\/neon-production-)/, page);
  }
});

test("maintenance and service outage display separately without constant Neon polling", () => {
  const gate = read("src/maintenance-gate.js");
  assert.match(gate, /title\.textContent = reason === "suspended" \? "Acesso suspenso" : reason === "service" \? "Serviço indisponível" : "Em manutenção"/);
  assert.match(gate, /info\.textContent = reason === "suspended" \? "Esta conta está suspensa\." : reason === "service"/);
  assert.match(gate, /const CHECK_EVERY_MS = 60000/);
  assert.match(gate, /if \(!allowed\) maintenanceScreen\(suspended \? "suspended" : serviceUnavailable \? "service" : "maintenance"\)/);
  assert.match(gate, /else if \(blocked\) window\.location\.reload\(\)/);
  assert.match(gate, /await evaluateMaintenanceAccess\(/);
  assert.match(read("src/maintenance-decision.js"), /"looply_maintenance_status"/);
  assert.match(read("src/maintenance-decision.js"), /"looply_maintenance_admin_bypass"/);
});

test("server-side RLS maintenance bypass requires real admin identity plus Peixinho", () => {
  const sql = read("migrations/20261107_maintenance_lock.sql");
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.looply_maintenance_admin_bypass/);
  assert.match(sql, /auth\.uid\(\) IS NOT NULL AND EXISTS/);
  assert.match(sql, /looply_migration\.verified_identity_links/);
  assert.match(sql, /account\.role = 'admin'/);
  assert.match(sql, /pg_catalog\.lower\(profile\.username\) = 'peixinho'/);
  assert.match(sql, /AS RESTRICTIVE FOR ALL TO authenticated/);
  assert.match(sql, /c\.relname <> 'app_settings'/);
  assert.doesNotMatch(sql, /DELETE FROM public\./i);
});

test("Peixinho exception uses a single server-verified global gate", () => {
  const app = read("src/maintenance-gate.js");
  const runtime = read("src/page-runtime.js");
  assert.match(app, /await evaluateMaintenanceAccess\(/);
  assert.match(runtime, /await verifiedPeixinhoAdmin\(\)/);
  assert.doesNotMatch(runtime, /checkMaintenance\(|renderMaintenanceScreen\(|maintenanceBlocked/);
  assert.match(read("migrations/20261107_maintenance_lock.sql"), /exempt := public\.looply_maintenance_admin_bypass\(\)/);
});

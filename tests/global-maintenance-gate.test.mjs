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

test("maintenance renders only the requested text and checks every second", () => {
  const gate = read("src/maintenance-gate.js");
  assert.match(gate, /title\.textContent = "Em manutenção"/);
  assert.match(gate, /info\.textContent = "Aguarde um tempo\."/);
  assert.match(gate, /const CHECK_EVERY_MS = 1000/);
  assert.match(gate, /if \(!allowed\) maintenanceScreen\(\)/);
  assert.match(gate, /else if \(blocked\) window\.location\.reload\(\)/);
  assert.match(gate, /await neon\.rpc\("looply_maintenance_status"\)/);
});

test("server-side RLS maintenance bypass requires real admin identity plus Peixinho", () => {
  const sql = read("migrations/20261107_maintenance_lock.sql");
  assert.match(sql, /auth\.uid\(\) IS NOT NULL AND public\.v3_self_is_admin\(\)/);
  assert.match(sql, /pg_catalog\.lower\(p\.username\) = 'peixinho'/);
  assert.match(sql, /AS RESTRICTIVE FOR ALL TO authenticated/);
  assert.match(sql, /c\.relname <> 'app_settings'/);
  assert.doesNotMatch(sql, /DELETE FROM public\./i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("new themes and fonts are applied from the profile and the service worker refreshes stale assets", async () => {
  const [theme, bootstrap, settings, css, worker] = await Promise.all([
    read("src/theme.js"),
    read("src/theme-bootstrap.js"),
    read("assets/js/settings.js"),
    read("assets/css/app.css"),
    read("sw.js")
  ]);
  for (const value of ["aurora", "coral", "menta", "sunset", "grafite", "syne", "playfair", "fraunces"]) {
    assert.match(bootstrap, new RegExp(value));
  }
  assert.match(bootstrap, /grafite/);
  assert.match(settings, /themeIds\.base/);
  assert.match(settings, /fontGroups\.expressive/);
  assert.match(css, /--looply-font-family/);
  assert.match(worker, /looply-shell-v(?:1[4-9]|[2-9][0-9])-[a-z0-9-]+/);
  assert.match(worker, /caches\.delete/);
  assert.ok(worker.includes('fetch(event.request, { cache: "no-cache" })'));
  assert.ok(worker.includes('return cached || Response.error()'));
});

test("ADM can provision a normal account without a manual password and delete feed or story content", async () => {
  const [admin, social, stories, home] = await Promise.all([
    read("supabase/functions/looply-admin/index.ts"),
    read("src/social.js"),
    read("src/stories.js"),
    read("assets/js/home.js")
  ]);
  assert.match(admin, /temporaryPassword\(\)/);
  assert.match(admin, /auth\.admin\.createUser/);
  assert.match(admin, /temporaryPassword: suppliedPassword \? null : password/);
  assert.match(social, /contentType: "post"/);
  assert.match(stories, /contentType: "story"/);
  assert.match(home, /isAdmin/);
});


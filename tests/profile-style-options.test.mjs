import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");

test("profile style settings expose curated fonts and palettes", async () => {
  const [settings, theme, bootstrap, migration, css] = await Promise.all([
    read("assets/js/settings.js"),
    read("src/theme.js"),
    read("src/theme-bootstrap.js"),
    read("supabase/migrations/20261020120000_expand_profile_style_options.sql"),
    read("assets/css/app.css")
  ]);
  for (const value of ["manrope", "dm_sans", "jakarta", "space_grotesk", "cormorant", "playfair", "fraunces", "caveat", "syne"]) {
    assert.match(settings, new RegExp(`value="${value}"`));
    assert.match(theme, new RegExp(`${value}:`));
    assert.match(migration, new RegExp(`'${value}'`));
  }
  for (const value of ["aurora", "coral", "menta", "sunset", "grafite"]) {
    assert.match(settings, new RegExp(`value="${value}"`));
    assert.match(theme, new RegExp(`${value}:`));
    assert.match(bootstrap, new RegExp(`${value}:`));
    assert.match(migration, new RegExp(`'${value}'`));
  }
  assert.match(css, /fonts\.googleapis\.com\/css2/);
});

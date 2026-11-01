import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const tokens = read("assets/css/app.css");
const styles = read("assets/css/theme-complete.css");

test("Prompt 002 preserves semantic theme aliases and user-selected theme source", () => {
  for (const pair of [
    ["--looply-ds-brand", "var(--primary)"],
    ["--looply-ds-surface-raised", "var(--surface-strong)"],
    ["--looply-ds-control-radius", "var(--radius-sm)"],
    ["--looply-ds-card-radius", "var(--radius-md)"],
    ["--looply-ds-chip-radius", "var(--pill)"],
    ["--looply-ds-dialog-radius", "var(--radius-lg)"],
  ]) assert.ok(tokens.includes(pair[0] + ": " + pair[1]), pair[0]);
  assert.match(read("src/theme.js"), /lilas/);
  assert.match(read("src/theme.js"), /grafite/);
});

test("Prompt 002 styles use scoped theme tokens and preserve motion accessibility", () => {
  assert.match(styles, /LOOPLY · PROMPT 002/);
  assert.match(styles, /html\[data-theme\] \.looply-page/);
  assert.match(styles, /--looply-ui-focus-ring/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /\[aria-disabled="true"\]/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  const block = styles.split("LOOPLY · PROMPT 002")[1];
  assert.ok(!block.includes(".story-studio") && !block.includes(".modal-carta") && !block.includes(".gallery-viewer"), "special editor and viewer surfaces must remain excluded");
});

test("All principal authenticated routes load the shared stylesheet without changing modules", () => {
  const pages = ["home","cartas","musicas","galeria","chat","conversa","perfil","usuarios","notificacoes","configuracoes","admin"];
  for (const name of pages) assert.ok(read(name + ".html").includes("assets/css/theme-complete.css"), name);
  assert.match(read("src/primary-navigation.js"), /primaryDestinations/);
});

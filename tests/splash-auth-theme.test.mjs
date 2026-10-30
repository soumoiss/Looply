import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(projectRoot, path), "utf8");

test("the initial route is a seven-second themed splash with an accessible animated logo", async () => {
  const [page, script, css] = await Promise.all([
    read("index.html"), read("src/splash.js"), read("assets/css/splash.css")
  ]);
  assert.match(page, /class="splash-screen"/);
  assert.match(page, /data-splash-logo/);
  assert.match(page, /MoissWorld/);
  assert.doesNotMatch(page, /Preparando seu espaço|conectando memórias/);
  assert.match(css, /\.splash-footer span\s*\{[^}]*font-family:\s*["']Cabin Sketch/);
  assert.match(script, /const SPLASH_DURATION_MS = 7000/);
  assert.match(script, /activeSession\(\)/);
  assert.doesNotMatch(script, /\.\/supabase\.js|supabase\.auth/);
  assert.match(script, /Promise\.all\(/);
  assert.match(script, /window\.location\.replace\(destination\)/);
  assert.match(script, /AudioContext|webkitAudioContext/);
  assert.match(script, /pointerdown|keydown/);
  assert.match(css, /@keyframes splash-logo-spin/);
  assert.match(css, /animation:[^;]*splash-logo-spin/);
  assert.match(css, /prefers-reduced-motion/);
});

test("public entrypoints use Neon Auth without exposing the retired Supabase project", async () => {
  const [client, config, loginEntry] = await Promise.all([
    read("src/neon-production-client.js"), read("config.js"), read("assets/js/login.js")
  ]);
  assert.match(client, /neon=createClient/);
  assert.match(client, /async function activeSession\(/);
  assert.match(loginEntry, /neon-production-login\.js/);
  assert.doesNotMatch(config, /supabaseUrl|publishableKey|supabase\.co/);
});

test("login and splash share the persisted global theme tokens", async () => {
  const [login, loginCss, theme] = await Promise.all([
    read("login.html"), read("assets/css/login.css"), read("src/theme.js")
  ]);
  assert.match(login, /assets\/css\/app\.css/);
  assert.match(login, /assets\/css\/login\.css/);
  assert.match(login, /assets\/js\/login\.js/);
  assert.match(loginCss, /var\(--primary\)/);
  assert.match(loginCss, /var\(--surface/);
  assert.match(theme, /localStorage\.getItem\(THEME_KEY\)/);
  assert.match(theme, /root\.dataset\.theme/);
});

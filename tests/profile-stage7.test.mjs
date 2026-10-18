import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("profile images are cropped to a real 512x512 square before upload", async () => {
  const source = await read("src/profiles.js");
  assert.match(source, /data-profile-crop-dialog/);
  assert.match(source, /data-crop-x/);
  assert.match(source, /data-crop-y/);
  assert.match(source, /canvas\.width=512;canvas\.height=512/);
  assert.match(source, /validatedBitmap\.width === 512 && validatedBitmap\.height === 512/);
  assert.match(source, /uploadData\.path !== newAvatarPath/);
});

test("missing avatars are routed to profile selection", async () => {
  const [runtime, source] = await Promise.all([read("src/page-runtime.js"), read("src/profiles.js")]);
  assert.match(runtime, /!profile\.avatar_path && page !== "profile"/);
  assert.match(runtime, /perfil\.html\?foto=obrigatoria/);
  assert.match(source, /avatar-required/);
  assert.match(source, /A foto atual foi preservada/);
  assert.match(source, /avatar-replacement-required/);
});

test("profile cleanup removes community search and personalization slogan", async () => {
  const source = await read("src/profiles.js");
  assert.doesNotMatch(source, /Encontre seus amigos|profile-people-search|Deixe seu perfil com a sua cara/);
  assert.match(source, /Editar perfil/);
});

test("avatar cropper exposes cancel/save controls and accessible labels", async () => {
  const [source, css] = await Promise.all([read("src/profiles.js"), read("assets/css/pages/profile.css")]);
  assert.match(source, /data-crop-cancel/);
  assert.match(source, /data-crop-save/);
  assert.match(source, /aria-label="Fechar recorte"/);
  assert.match(css, /\.profile-crop-dialog::backdrop/);
});

test("profile and account actions use consistent accessible SVG icons", async () => {
  const [profile, runtime, css] = await Promise.all([
    read("src/profiles.js"), read("src/page-runtime.js"), read("assets/css/pages/profile.css")
  ]);
  assert.match(profile, /for="profileAvatarGallery"/);
  assert.match(profile, /aria-label="Fechar recorte"/);
  assert.match(profile, /profile-visibility-badge"><svg/);
  assert.match(profile, /profile-overview-shortcut[^>]*><svg/);
  assert.match(runtime, /data-sign-out><svg/);
  assert.match(runtime, /configuracoes\.html"><svg/);
  assert.match(css, /account-menu-link svg/);
});

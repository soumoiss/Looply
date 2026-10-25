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
  assert.match(runtime, /configuracoes\.html">\$\{icon\("settings"\)\}/);
  assert.match(css, /account-menu-link svg/);
});

test("profile photo save errors distinguish invalid images, auth, storage permissions, and connectivity", async () => {
  const source = await read("src/profiles.js");
  assert.match(source, /function avatarSaveErrorMessage\(error\)/);
  assert.match(source, /status === 401/);
  assert.match(source, /status === 403/);
  assert.match(source, /status === 413/);
  assert.match(source, /error instanceof TypeError/);
  assert.match(source, /avatarSaveErrorMessage\(error\)/);
});

test("global back link follows its explicit home or chat destination", async () => {
  const runtime = await read("src/page-runtime.js");
  assert.match(runtime, /href="home\.html" data-page-back aria-label="Voltar para o início"/);
  assert.doesNotMatch(runtime, /window\.history\.back\(\)/);
  assert.match(runtime, /Keep this control deterministic/);
});

test("avatar validation respects the bucket read policy by updating the profile path before signing", async () => {
  const source = await read("src/profiles.js");
  const upload = source.indexOf('.storage.from("looply-avatars").upload(newAvatarPath');
  const profileUpdate = source.indexOf('.update(updates).eq("id", userId).select("id,avatar_path").maybeSingle()');
  const signedUrl = source.indexOf('cachedSignedUrl(client, "looply-avatars", newAvatarPath, 60)');
  assert.ok(upload >= 0 && profileUpdate > upload && signedUrl > profileUpdate);
  assert.match(source, /profile-update-not-confirmed/);
  assert.match(source, /Could not roll back profile avatar after storage validation failed/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Android packaging always identifies the exact 3.0.6 package under review", async () => {
  const [gradle, workflow] = await Promise.all([
    source("android/app/build.gradle.kts"),
    source(".github/workflows/android-apk.yml")
  ]);
  assert.match(gradle, /applicationId\s*=\s*"com\.looply\.app"/);
  assert.match(gradle, /versionCode\s*=\s*306\b/);
  assert.match(gradle, /versionName\s*=\s*"3\.0\.6"/);
  assert.match(workflow, /versionCode='305'/);
  assert.match(workflow, /versionName='3\.0\.6'/);
  assert.match(workflow, /name:\s*Looply-3\.0\.6-debug-apk/);
  assert.match(workflow, /name:\s*Looply-3\.0\.6-signed-release/);
  assert.doesNotMatch(workflow, /Looply-3\.0\.3-signed-release/);
});

test("No automatic GitHub Release of a debug preview during the six-stage work", async () => {
  const workflow = await source(".github/workflows/android-apk.yml");
  assert.doesNotMatch(workflow, /^\s*publish-preview-apk:/m);
  assert.doesNotMatch(workflow, /gh release (create|upload)/);
  assert.match(workflow, /secrets\.LOOPLY_ANDROID_KEYSTORE_B64/);
  assert.match(workflow, /secrets\.LOOPLY_ANDROID_KEY_ALIAS/);
  assert.match(workflow, /apksigner" verify --verbose/);
});

test("Android APK build explicitly checks its packaged local share route", async () => {
  const [workflow, build] = await Promise.all([
    source(".github/workflows/android-apk.yml"),
    source("scripts/build.mjs")
  ]);
  assert.match(workflow, /assets\/share\.html/);
  assert.match(workflow, /assets\/src\/neon-production-client\.js/);
  assert.match(build, /"share\.html"/);
});

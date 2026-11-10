import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Right Now opens a source sheet before requesting any camera", () => {
  const html = read("why-now.html");
  const sourceSheet = html.slice(html.indexOf("function openCreateSourcePicker()"),
    html.indexOf("function navCamera()"));
  for (const id of ["wn-source-app", "wn-source-photo", "wn-source-video",
    "wn-source-gallery", "wn-source-cancel"]) {
    assert.ok(sourceSheet.includes(id), id);
  }
  assert.ok(sourceSheet.includes("nativeCapture('image')"));
  assert.ok(sourceSheet.includes("nativeCapture('video')"));
  assert.ok(sourceSheet.includes("$('#file-picker').click()"));
  assert.ok(sourceSheet.includes("void openCamera()"));
  assert.match(html, /function navCamera\(\)\{openCreateSourcePicker\(\)\}/);
  assert.match(html, /capture="environment"/);
  assert.match(html, /createSourceSheetOpen=false;sheetClose\(\);\s*enterEditor/);
});

test("Both embedded create entry points open source chooser without auto-starting camera", () => {
  const adapter = read("src/why-now-embedded.js");
  const integration = read("src/why-now-integration.js");
  assert.match(adapter, /window\.whyNowOpenCreate=\(\)=>\{openCreateSourcePicker\(\);\};/);
  assert.match(adapter, /if \(data\.type === "open-create"\) \{\s*openCreateSourcePicker\(\);/);
  assert.match(adapter, /if \(!stories\.length && own\) \{ openCreateSourcePicker\(\); return; \}/);
  assert.match(integration, /\["create","camera","editor","viewer"\]/);
  assert.match(integration, /screen\(type==="open-create"\?"create":"viewer"\)/);
});

test("Inline Why Now JavaScript parses", () => {
  const html = read("why-now.html");
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script && script.length > 1000);
  const checked = spawnSync(process.execPath,
    ["--check", "--input-type=commonjs"], { input: script, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
});

test("Android WebView uses camera intents and FileProvider, preserving gallery picker", () => {
  const activity = read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const provider = read("android/app/src/main/res/xml/right_now_file_paths.xml");
  for (const fragment of [
    "params.isCaptureEnabled", "MediaStore.ACTION_IMAGE_CAPTURE",
    "MediaStore.ACTION_VIDEO_CAPTURE", "MediaStore.EXTRA_OUTPUT",
    "FileProvider.getUriForFile", "REQUEST_NATIVE_CAMERA",
    "cameraResult != null", "capturedFile?.length()",
    "params.createIntent()", "Intent.ACTION_GET_CONTENT",
  ]) assert.ok(activity.includes(fragment), fragment);
  assert.match(manifest, /android:authorities="\$\{applicationId\}\.fileprovider"/);
  assert.match(provider, /<cache-path name="right_now_camera" path="right-now-camera\/" \/>/);
});

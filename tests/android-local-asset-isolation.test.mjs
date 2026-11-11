import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("APK treats GitHub Pages as a virtual origin only, never a network asset fallback", async () => {
  const router = await read("android/app/src/main/java/com/soumoiss/looply/BundledAssetRouter.kt");
  assert.match(router, /WebViewAssetLoader\.AssetsPathHandler\(context\)/);
  assert.match(router, /\.addPathHandler\("\/Looply\/"/);
  assert.match(router, /val bundled = loader\.shouldInterceptRequest\(url\)/);
  assert.match(router, /return bundled\?\.takeIf \{ it\.data != null \} \?: localNotFound\(\)/);
  assert.match(router, /404,[\s\S]*"Not Found"/);
  assert.match(router, /"Cache-Control" to "no-store"/);
  assert.match(router, /if \(!url\.host\.equals\(LEGACY_VIRTUAL_HOST/);
  assert.match(router, /if \(!url\.scheme\.equals\("https"/);
});

test("MainActivity and WebView Service Workers both use the same local-only router", async () => {
  const main = await read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
  assert.match(main, /private val assetRouter by lazy \{ BundledAssetRouter\(this\) \}/);
  assert.match(main, /SERVICE_WORKER_BASIC_USAGE/);
  assert.match(main, /SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST/);
  assert.match(main, /ServiceWorkerControllerCompat\.getInstance\(\)\.setServiceWorkerClient/);
  assert.match(main, /assetRouter\.intercept\(request\.url\)/);
  assert.doesNotMatch(main, /assetLoader\.shouldInterceptRequest\(request\.url\)/);
  assert.match(main, /setOnClickListener \{ loadLooply\(\) \}/);
  assert.match(main, /webView\.loadUrl\(REMOTE_START_URL \+ "index\.html"\)/);
});

test("incoming Android sharesheet never downloads a missing local share page", async () => {
  const share = await read("android/app/src/main/java/com/soumoiss/looply/ShareReceiverActivity.kt");
  assert.match(share, /private fun localShareResponse\(url: Uri\)/);
  assert.match(share, /assets\.shouldInterceptRequest\(url\) \?: BundledAssetRouter\.localNotFound\(\)/);
  assert.match(share, /localShareResponse\(request\.url\)/);
  assert.doesNotMatch(share, /=\s*assets\.shouldInterceptRequest\(request\.url\)/);
});

test("local-only origin restriction does not weaken authenticated Android bridges", async () => {
  const paths = [
    "android/app/src/main/java/com/soumoiss/looply/NativeFeedBridge.kt",
    "android/app/src/main/java/com/soumoiss/looply/NativeCallAuthBridge.kt",
    "android/app/src/main/java/com/soumoiss/looply/ChatAvatarCache.kt"
  ];
  for (const path of paths) {
    const bridge = await read(path);
    assert.match(bridge, /isMainFrame/);
    assert.match(bridge, /https:\/\/soumoiss\.github\.io/);
  }
});

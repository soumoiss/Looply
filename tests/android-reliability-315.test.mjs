import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Android 15 media fixture is the first Debug-only WebView navigation", async () => {
  const activity = await read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
  const instrumentation = await read("android/app/src/androidTest/java/com/soumoiss/looply/RealWebViewIntegrationTest.kt");
  assert.match(activity, /BuildConfig\.DEBUG\s*&&\s*intent\.getBooleanExtra\(DEBUG_CAMERA_TEST, false\)/);
  assert.match(activity, /webView\.loadUrl\(DEBUG_CAMERA_FIXTURE_URL\)/);
  assert.match(activity, /appassets\.androidplatform\.net\/Looply\/assets\/test\/android-media-acceptance\.html/);
  assert.match(activity, /if \(debugCameraFixture\)\s*\{[\s\S]*?\}\s*else\s*\{\s*loadLooply\(\)/);
  assert.match(instrumentation, /putExtra\("looply\.debug\.MEDIA_ACCEPTANCE", true\)/);
  assert.match(instrumentation, /ActivityScenario\.launch<MainActivity>\(debugIntent\)/);
  assert.doesNotMatch(instrumentation, /web!!\.loadUrl\("https:\/\/soumoiss\.github\.io\/Looply\/assets\/test/);
});

test("offline cached feed opens immediately without initializing the browser", async () => {
  const main = await read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
  const start = main.indexOf("val nativeOffline = savedInstanceState");
  const layout = main.indexOf("createLayout()", start);
  assert.ok(start > 0 && layout > start, "offline fast path must precede layout and WebView");
  const fastPath = main.slice(start, layout);
  assert.match(fastPath, /NativeFeedStore\(this\)\.hasCachedPosts\(\)/);
  assert.match(fastPath, /!intent\.hasExtra\("looply_route"\)/);
  assert.match(fastPath, /!intent\.getBooleanExtra\(DEBUG_CAMERA_TEST, false\)/);
  assert.match(fastPath, /startActivity\(Intent\(this, NativeFeedActivity::class\.java\)/);
  assert.match(fastPath, /finish\(\)/);
  assert.match(fastPath, /return/);
});

test("explicit return from offline reader cannot loop back into reader", async () => {
  const feed = await read("android/app/src/main/java/com/soumoiss/looply/NativeFeedActivity.kt");
  const main = await read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
  assert.match(feed, /"looply\.native\.OFFLINE_ENTRY"/);
  assert.match(feed, /"looply\.native\.SKIP_OFFLINE_READER"/);
  assert.match(feed, /backToLooply\(\)/);
  assert.match(main, /!intent\.getBooleanExtra\(SKIP_NATIVE_OFFLINE, false\)/);
});

test("real SQLite instrumented coverage includes private posts, logout and account switching", async () => {
  const file = await read("android/app/src/androidTest/java/com/soumoiss/looply/NativeFeedStoreTest.kt");
  assert.match(file, /@Test fun publicPostsAreReadableWithoutNetwork/);
  assert.match(file, /@Test fun accessRestrictedPostsAreNeverCached/);
  assert.match(file, /@Test fun accountsAreIsolatedAndLogoutPurgesOfflineData/);
  assert.match(file, /@After fun cleanup\(\) = store\.clearAllOnLogout\(\)/);
});

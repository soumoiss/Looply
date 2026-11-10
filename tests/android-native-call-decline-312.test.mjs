import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source = path => readFile(new URL("../"+path, import.meta.url), "utf8");
const android = name => source("android/app/src/main/java/com/soumoiss/looply/"+name+".kt");

test("notification decline goes to a private Android receiver instead of launching WebView", async () => {
  const [service, receiver, manifest, screen] = await Promise.all([
    android("LooplyMessagingService"), android("NativeCallDeclineReceiver"),
    source("android/app/src/main/AndroidManifest.xml"), android("IncomingCallActivity")
  ]);
  assert.match(service,/if \(action == "decline"\)/);
  assert.match(service,/PendingIntent\.getBroadcast\(/);
  assert.match(service,/NativeCallDeclineReceiver::class\.java/);
  assert.match(service,/NotificationCompat\.CallStyle\.forIncomingCall/);
  assert.match(manifest,/<receiver\s+android:name="\.NativeCallDeclineReceiver"\s+android:exported="false"/);
  assert.match(screen,/sendBroadcast\(Intent\(this, NativeCallDeclineReceiver::class\.java\)/);
  assert.match(receiver,/class NativeCallDeclineReceiver : BroadcastReceiver/);
  assert.doesNotMatch(receiver, /MainActivity::class\.java|WebView|loadUrl\(/);
});

test("native decline checks pending expiry and current authenticated Neon offer before signaling", async () => {
  const s = await android("NativeCallDeclineReceiver");
  assert.match(s,/age !in 0\.\.35_000L/);
  assert.match(s,/prefs\.getString\("pending_incoming_call", null\) != conversation/);
  assert.match(s,/NativeCallSessionStore\.read\(app\)/);
  assert.match(s,/v23_fcm_pending_incoming_offer/);
  assert.match(s,/v3_call_signal_send/);
  assert.match(s,/offer\.optString\("callId"\)/);
  assert.match(s,/\.put\("callId", callId\)/);
  assert.match(s,/\.put\("type", "decline"\)/);
  assert.match(s,/HttpsURLConnection/);
  assert.doesNotMatch(s,/API_KEY|SERVICE_ACCOUNT|NEON_PUSH_DATABASE_URL/);
});

test("native call auth bridge stores access token only, encrypted with Android Keystore", async () => {
  const [bridge, store, js, manifest] = await Promise.all([
    android("NativeCallAuthBridge"), android("NativeCallSessionStore"),
    source("src/neon-production-client.js"),
    source("android/app/src/main/AndroidManifest.xml")
  ]);
  assert.match(bridge,/if \(!isMainFrame \|\| sourceOrigin\.toString\(\) != ORIGIN\)/);
  assert.match(bridge,/WEB_MESSAGE_LISTENER/);
  assert.match(store,/KeyStore\.getInstance\("AndroidKeyStore"\)/);
  assert.match(store,/AES\/GCM\/NoPadding/);
  assert.match(store,/GCMParameterSpec\(128,/);
  assert.doesNotMatch(store,/refresh_token|password|service_role/);
  assert.match(js,/syncNativeCallSession\(session\)/);
  assert.match(js,/type: "session", account, accessToken: token, expiresAtMs/);
  assert.match(js,/LooplyNativeCallAuth\?\.postMessage\(JSON\.stringify\(\{type:"clear"\}\)\)/);
  assert.match(manifest,/android:allowBackup="false"/);
});

test("native decline does not claim success if no valid session, no offer or backend failure", async () => {
  const s = await android("NativeCallDeclineReceiver");
  assert.match(s,/if \(session != null && sendDecline\(session\.accessToken, conversation\)\)/);
  assert.match(s,/else showFailure\(app, conversation\)/);
  assert.match(s,/if \(connection\.responseCode !in 200\.\.299\) return null/);
  assert.match(s,/\.cancel\(conversation\.hashCode\(\)\)/);
});

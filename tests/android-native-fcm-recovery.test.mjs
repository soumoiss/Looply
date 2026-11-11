import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("FCM token rotation schedules native JobScheduler even with WebView closed", async () => {
  const [job, service, manifest] = await Promise.all([
    source("android/app/src/main/java/com/soumoiss/looply/NativeFcmRecoveryJob.kt"),
    source("android/app/src/main/java/com/soumoiss/looply/LooplyMessagingService.kt"),
    source("android/app/src/main/AndroidManifest.xml"),
  ]);
  assert.match(job, /class NativeFcmRecoveryJob : JobService\(\)/);
  assert.match(job, /setRequiredNetworkType\(JobInfo\.NETWORK_TYPE_ANY\)/);
  assert.match(job, /setBackoffCriteria\(30_000, JobInfo\.BACKOFF_POLICY_EXPONENTIAL\)/);
  assert.match(job, /override fun onStopJob\(params: JobParameters\): Boolean/);
  assert.match(job, /return true\s+\}\s+override fun onDestroy/);
  assert.match(service, /override fun onNewToken\(token: String\)[\s\S]*NativeFcmRecoveryJob\.enqueue\(this\)/);
  assert.match(manifest, /android:name="\.NativeFcmRecoveryJob"[\s\S]*?android:permission="android\.permission\.BIND_JOB_SERVICE"[\s\S]*?android:exported="true"/);
});

test("native registration is authenticated by Neon and does not contain service credentials", async () => {
  const job = await source("android/app/src/main/java/com/soumoiss/looply/NativeFcmRecoveryJob.kt");
  assert.match(job, /NativeCallSessionStore\.read\(applicationContext\)/);
  assert.match(job, /rpc\/v16_register_android_fcm_token/);
  assert.match(job, /"Authorization", "Bearer " \+ session\.accessToken/);
  assert.match(job, /"p_device_id", deviceId/);
  assert.match(job, /"p_fcm_token", token/);
  assert.match(job, /response\.trim\(\) != "true"/);
  assert.match(job, /NativeCallSessionStore\.read\(applicationContext\)[\s\S]*?currentToken != token/);
  // Comments describe forbidden secrets; check executable source instead.
  const executable = job.split("\n").filter(line => {
    const trim = line.trimStart();
    return !trim.startsWith("*") && !trim.startsWith("//");
  }).join("\n");
  assert.doesNotMatch(executable, /service_account|private_key|NEON_PUSH_DATABASE_URL|refresh_token|password/i);
  assert.doesNotMatch(executable, /WebView|evaluateJavascript|loadUrl\(/);
});

test("logout cancels registration and a new Neon session retriggers pending token registration", async () => {
  const [bridge, job, main] = await Promise.all([
    source("android/app/src/main/java/com/soumoiss/looply/NativeCallAuthBridge.kt"),
    source("android/app/src/main/java/com/soumoiss/looply/NativeFcmRecoveryJob.kt"),
    source("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt"),
  ]);
  assert.match(bridge, /"clear" -> io\.execute \{[\s\S]*NativeCallSessionStore\.clear\(app\)[\s\S]*NativeFcmRecoveryJob\.clearOnLogout\(app\)/);
  assert.match(bridge, /if \(NativeCallSessionStore\.save\(app, account, token, expiresAt\)\) \{[\s\S]*?NativeFcmRecoveryJob\.enqueue\(app\)/);
  assert.match(job, /getSystemService\(JobScheduler::class\.java\)\.cancel\(JOB_ID\)/);
  assert.match(job, /remove\(REGISTRATION_DIGEST\)/);
  assert.match(main, /putString\("last_fcm_token", token\)\.apply\(\)\s*NativeFcmRecoveryJob\.enqueue\(this\)/);
});

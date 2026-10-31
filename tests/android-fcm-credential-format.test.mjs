import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, webcrypto } from "node:crypto";
import { decodeFcmPrivateKey, parseFcmServiceAccount } from "../backend/cloudflare/android-push-worker.mjs";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});
const raw = decodeFcmPrivateKey(privateKey);
const escaped = privateKey.replace(/\n/g, "\\n");
const twiceEscaped = escaped.replace(/\\/g, "\\\\");

test("FCM credentials accept standard Google PKCS8 PEM with newlines", async () => {
  const key=await webcrypto.subtle.importKey("pkcs8",raw,
    {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  assert.equal(key.algorithm.name,"RSASSA-PKCS1-v1_5");
});
test("FCM credentials accept escaped newlines from CI/CD JSON formatting", () => {
  assert.deepEqual(decodeFcmPrivateKey(escaped),raw);
  assert.deepEqual(decodeFcmPrivateKey(twiceEscaped),raw);
  assert.deepEqual(decodeFcmPrivateKey(privateKey.replace(/\n/g, "\r\n")),raw);
});
test("FCM service-account loader validates JSON and project without disclosing keys", () => {
  const object={project_id:"looplyv3",client_email:"worker@example.invalid",private_key:escaped};
  assert.deepEqual(parseFcmServiceAccount(JSON.stringify(object),"looplyv3"),object);
  assert.deepEqual(parseFcmServiceAccount(JSON.stringify(JSON.stringify(object)),"looplyv3"),object);
  assert.throws(()=>parseFcmServiceAccount(JSON.stringify(object),"wrong"),/fcm_project_mismatch/);
  assert.throws(()=>parseFcmServiceAccount("not json","looplyv3"),/fcm_service_account_invalid_json/);
  assert.throws(()=>decodeFcmPrivateKey("not-a-valid-private-key"),/fcm_private_key_too_short/);
  assert.throws(()=>decodeFcmPrivateKey("!".repeat(180)),/fcm_private_key_non_base64_characters/);
});

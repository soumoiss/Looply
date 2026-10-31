import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, webcrypto } from "node:crypto";
import worker, { decodeFcmPrivateKey, parseFcmServiceAccount } from "../backend/cloudflare/android-push-worker.mjs";

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

test("FCM PEM decoder normalizes excess transport padding without bypassing PKCS8 validation",async()=>{
  const extraPad=privateKey.replace(/-----END PRIVATE KEY-----/, "====\\n-----END PRIVATE KEY-----");
  assert.deepEqual(decodeFcmPrivateKey(extraPad),raw);
  const key=await webcrypto.subtle.importKey("pkcs8",decodeFcmPrivateKey(extraPad),
    {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  assert.equal(key.algorithm.name,"RSASSA-PKCS1-v1_5");
});

test("public Worker health never reports ready merely because secrets exist",async()=>{
  const request=new Request("https://example.invalid/health");
  const base={FCM_PROJECT_ID:"looplyv3",NEON_PUSH_DATABASE_URL:"postgresql://dummy@db.neon.tech/neondb"};
  const malformed=await (await worker.fetch(request,{
    ...base,FCM_SERVICE_ACCOUNT_JSON:JSON.stringify({
      project_id:"looplyv3",client_email:"fcm@example.invalid",private_key:"not-a-key"
    })
  })).json();
  assert.equal(malformed.ready,false);
  assert.equal(JSON.stringify(malformed).includes("private_key"),false);
  const valid=await (await worker.fetch(request,{
    ...base,FCM_SERVICE_ACCOUNT_JSON:JSON.stringify({
      project_id:"looplyv3",client_email:"fcm@example.invalid",private_key:privateKey
    })
  })).json();
  assert.equal(valid.ready,true);
});

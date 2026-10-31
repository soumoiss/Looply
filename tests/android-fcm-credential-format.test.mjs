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
  assert.equal(Object.hasOwn(malformed,"private_key"),false);
  assert.equal(Object.hasOwn(malformed,"client_email"),false);
  assert.match(malformed.status,/^fcm_[a-z_]+$/);
  const valid=await (await worker.fetch(request,{
    ...base,FCM_SERVICE_ACCOUNT_JSON:JSON.stringify({
      project_id:"looplyv3",client_email:"fcm@example.invalid",private_key:privateKey
    })
  })).json();
  assert.equal(valid.ready,true);
});

test("FCM secret loader accepts supported wrappers but refuses Android public config",()=>{
  const service={project_id:"looplyv3",client_email:"worker@example.invalid",private_key:escaped};
  for(const key of ["service_account","serviceAccount","credentials","FCM_SERVICE_ACCOUNT_JSON"]){
    assert.deepEqual(parseFcmServiceAccount(JSON.stringify({[key]:service}),"looplyv3"),service);
  }
  assert.equal(parseFcmServiceAccount(JSON.stringify({projectId:"looplyv3",
    clientEmail:"worker@example.invalid",privateKey:escaped}),"looplyv3").client_email,
    "worker@example.invalid");
  assert.throws(()=>parseFcmServiceAccount(JSON.stringify({
    project_info:{project_id:"looplyv3"},client:[{}]
  }),"looplyv3"),/fcm_android_config_not_service_account/);
  assert.throws(()=>parseFcmServiceAccount(JSON.stringify({project_id:"looplyv3",private_key:escaped}),
    "looplyv3"),/fcm_service_account_missing_client_email/);
  assert.throws(()=>parseFcmServiceAccount(JSON.stringify({project_id:"looplyv3",
    client_email:"worker@example.invalid"}),"looplyv3"),/fcm_service_account_missing_private_key/);
});

test("FCM health safely identifies invalid credential type without echoing secrets",async()=>{
  const {default:worker}=await import("../backend/cloudflare/android-push-worker.mjs");
  const json=JSON.stringify({project_info:{project_id:"looplyv3"},client:[{}]});
  const response=await worker.fetch(new Request("https://push.test/health"),{
    FCM_PROJECT_ID:"looplyv3",NEON_PUSH_DATABASE_URL:"postgresql://unused.invalid",
    FCM_SERVICE_ACCOUNT_JSON:json
  });
  const body=await response.json();
  assert.deepEqual(body,{service:"looply-android-fcm",ready:false,status:"fcm_android_config_not_service_account"});
  assert.equal(JSON.stringify(body).includes("project_info"),false);
});

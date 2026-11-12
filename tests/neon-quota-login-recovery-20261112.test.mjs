import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyNeonLoginFailure} from "../src/neon-login-errors.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("HTTP 402 quota Neon must never be reported as wrong password",()=>{
 const e={status:402,message:"Your account or project has exceeded the quota"};
 const r=classifyNeonLoginFailure(e);
 assert.equal(r.kind,"service_quota");
 assert.doesNotMatch(r.message,/incorret[oa]/i);
 assert.equal(classifyNeonLoginFailure({status:412,code:"GENERIC_QUOTA_EXCEEDED"}).kind,"service_quota");
 assert.equal(classifyNeonLoginFailure({message:"NeonDbError: SQLSTATE 53000"}).kind,"service_quota");
});
test("only explicitly rejected credentials become invalid credentials",()=>{
 assert.equal(classifyNeonLoginFailure({status:401,code:"INVALID_EMAIL_OR_PASSWORD"}).kind,"invalid_credentials");
 assert.equal(classifyNeonLoginFailure({status:400,message:"invalid credentials"}).kind,"invalid_credentials");
 for(const error of [
  {status:503,message:"upstream unavailable"},
  {status:500,message:"server error"},
  {status:401,message:"failed to refresh session"},
  {status:0,message:"Failed to fetch"},
  {status:412,message:"Service temporarily down"}
 ])assert.notEqual(classifyNeonLoginFailure(error).kind,"invalid_credentials");
});
test("a successful authentication followed by unavailable profile does not blame password",()=>{
 assert.equal(classifyNeonLoginFailure(new Error("profile query failed"),{authenticated:true}).kind,"profile_unavailable");
 assert.equal(classifyNeonLoginFailure({status:429}).kind,"rate_limited");
});
test("production login distinguishes provider errors, audits only confirmed bad passwords",()=>{
 const js=read("src/neon-production-login.js");
 assert.match(js,/if\(result\.error\)throw result\.error/);
 assert.match(js,/if\(!result\.data\?\.session\?\.access_token\)/);
 assert.match(js,/await selfProfile\(result\.data\.session\)/);
 assert.match(js,/classifyNeonLoginFailure\(e/);
 assert.match(js,/failure\.kind==="invalid_credentials"&&/);
 assert.doesNotMatch(js,/if\(result\.error\|\|!result\.data\?\.session\)throw Error\("Usuário ou senha incorretos/);
 assert.doesNotMatch(js,/\.auth\.signOut\(/);
});
test("splash preserves session on provider outage instead of silently logging out",()=>{
 const js=read("src/neon-production-splash.js");
 assert.match(js,/else if\(problem\)/);
 assert.match(js,/classifyNeonLoginFailure\(problem\)/);
 assert.match(js,/Tentar novamente/);
 assert.doesNotMatch(js,/auth\.signOut\(\)/);
});
test("quota safety: keep RLS and suspension, reduce check from 1s to 60s",()=>{
 const js=read("src/maintenance-gate.js");
 assert.match(js,/const CHECK_EVERY_MS = 60000/);
 assert.match(js,/const MIN_CHECK_GAP_MS = 5000/);
 assert.match(js,/v54_self_account_access/);
 assert.match(js,/await evaluateMaintenanceAccess\(/);
 assert.match(js,/serviceUnavailable \? "service" : "maintenance"/);
 assert.match(js,/accessResponse\.status === 402/);
 assert.match(js,/window\.location\.reload\(\)/);
 assert.doesNotMatch(js,/const CHECK_EVERY_MS = 1000/);
 assert.doesNotMatch(js,/sessionStorage\.clear\(|localStorage\.clear\(/);
});

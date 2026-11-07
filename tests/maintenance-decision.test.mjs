import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMaintenanceAccess } from "../src/maintenance-decision.js";

const session = { access_token: "neon-authenticated-test-token" };
const dataApiUrl = "https://neon.example/rest/v1";
function mockedNeon({ status, settings, bypass = false, admin = false, profiles = [{username:"other"}], outages = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    assert.equal(options.headers.authorization, "Bearer " + session.access_token);
    assert.equal(options.cache, "no-store");
    const key = path.includes("/rpc/") ? path.slice(path.lastIndexOf("/") + 1)
      : path.endsWith("/app_settings") ? "app_settings"
      : path.endsWith("/v3_self_profile") ? "v3_self_profile" : "";
    if (outages.includes(key)) return {ok:false,status:503,json:async()=>({})};
    if (key === "looply_maintenance_status") {
      if (!status) return {ok:false,status:404,json:async()=>({})};
      return {ok:true,json:async()=>status};
    }
    if (key === "app_settings") {
      return {ok:true,json:async()=>settings === undefined ? [] : [{maintenance_mode:settings}]};
    }
    if (key === "looply_maintenance_admin_bypass") return {ok:true,json:async()=>bypass};
    if (key === "v3_self_is_admin") return {ok:true,json:async()=>admin};
    if (key === "v3_self_profile") return {ok:true,json:async()=>profiles};
    throw new Error("Unexpected Data API call: "+url);
  };
  return {fetchImpl, calls};
}
const evaluate = fetchImpl => evaluateMaintenanceAccess({session,dataApiUrl,fetchImpl});

test("maintenance OFF: permit authenticated users even if the status RPC is unavailable", async () => {
  const {fetchImpl,calls} = mockedNeon({settings:false});
  assert.deepEqual(await evaluate(fetchImpl),{allowed:true,verifiedAdmin:false});
  assert.deepEqual(calls.map(x=>x.path.split("/").at(-1)),["looply_maintenance_status","app_settings"]);
});

test("maintenance ON: all ordinary users remain blocked, even with a Peixinho display name", async () => {
  const {fetchImpl} = mockedNeon({
    status:{enabled:true,exempt:false,blocked:true},bypass:false,
    admin:false,profiles:[{username:"peixinho"}]
  });
  assert.deepEqual(await evaluate(fetchImpl),{allowed:false,verifiedAdmin:false});
});

test("maintenance ON: Peixinho admin bypass from Neon RPC grants full entry", async () => {
  const {fetchImpl} = mockedNeon({
    status:{enabled:true,exempt:false,blocked:true},bypass:true
  });
  assert.deepEqual(await evaluate(fetchImpl),{allowed:true,verifiedAdmin:true});
});

test("maintenance ON: status RPC confirms the verified exempt admin", async () => {
  const {fetchImpl} = mockedNeon({status:{enabled:true,exempt:true,blocked:false}});
  assert.deepEqual(await evaluate(fetchImpl),{allowed:true,verifiedAdmin:true});
});

test("maintenance ON: legacy admin role plus original Peixinho profile recover schema-cache failures", async () => {
  const {fetchImpl} = mockedNeon({
    settings:true,admin:true,profiles:[{username:"Peixinho"}],
    outages:["looply_maintenance_status","looply_maintenance_admin_bypass"]
  });
  assert.deepEqual(await evaluate(fetchImpl),{allowed:true,verifiedAdmin:true});
});

test("maintenance ON: a different administrator cannot claim Peixinho bypass", async () => {
  const {fetchImpl} = mockedNeon({
    settings:true,admin:true,profiles:[{username:"another_admin"}],
    outages:["looply_maintenance_status","looply_maintenance_admin_bypass"]
  });
  assert.deepEqual(await evaluate(fetchImpl),{allowed:false,verifiedAdmin:false});
});

test("when all Neon verification routes fail, never grant a guessed admin exception", async () => {
  const {fetchImpl} = mockedNeon({
    outages:["looply_maintenance_status","app_settings","looply_maintenance_admin_bypass",
      "v3_self_is_admin","v3_self_profile"]
  });
  await assert.rejects(evaluate(fetchImpl),/maintenance_verification_unavailable/);
});

test("maintenance cannot authorize a missing session token", async () => {
  await assert.rejects(
    evaluateMaintenanceAccess({session:null,dataApiUrl,fetchImpl:()=>{ throw new Error("must not fetch"); }}),
    /maintenance_session_missing/
  );
});

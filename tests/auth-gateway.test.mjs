import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_AUTH_PROVIDER, normalizeLoginIdentity, authenticateOriginalAccount
} from "../src/auth-gateway.js";

const uuid = "11111111-1111-4111-8111-111111111111";

function mockClient(options = {}) {
  const calls = [];
  const session = { access_token: "test-token", refresh_token: "test-refresh" };
  const client = {
    auth: {
      async signInWithPassword(data) {
        calls.push(["email-signin", data.email]);
        return options.invalidEmail ? {error:{status:400}} : {data:{session}};
      },
      async setSession(data) {
        calls.push(["set-session",Boolean(data.access_token)]);
        return {data:{session}};
      },
      async getUser() {
        calls.push(["get-user"]);
        return {data:{user:{id:uuid}}};
      }
    },
    functions: {
      async invoke(name, payload) {
        calls.push(["username-gateway",name,payload.body.username]);
        return options.error ? {error:options.error} : {data:session};
      }
    },
    rpc(name, payload) {
      calls.push(["fallback-rpc",name,payload.p_username]);
      return Promise.resolve({data:"test@example.invalid"});
    },
    from(name) {
      assert.equal(name,"profiles");
      return {select(columns) {
        assert.match(columns,/username/);
        return {eq(field,id) {
          assert.equal(field,"id");
          assert.equal(id,uuid);
          return {async maybeSingle() {
            calls.push(["profile-query"]);
            return {data:options.mismatch
              ? {id:"22222222-2222-4222-8222-222222222222",username:"wrong"}
              : {id:uuid,username:"test_member",display_name:"Test Member",bio:"Olá"}};
          }};
        }};
      }};
    }
  };
  return {client,calls};
}

test("current auth is Supabase only, future adapter can be switched independently",()=>{
  assert.equal(ACTIVE_AUTH_PROVIDER,"supabase");
});

test("username and email input are normalized without storing credentials",()=>{
  assert.deepEqual(normalizeLoginIdentity("  PATATI  "),{type:"username",value:"patati"});
  assert.deepEqual(normalizeLoginIdentity("PERSON@EXAMPLE.COM"),{type:"email",value:"person@example.com"});
  assert.throws(()=>normalizeLoginIdentity("bad @name"),/invalid_identity/);
});

test("username flow confirms SDK session and loads only authenticated profile",async()=>{
  const {client,calls}=mockClient();
  const profile=await authenticateOriginalAccount(client,"TEST_MEMBER","entered-secret");
  assert.equal(profile.username,"test_member");
  assert.deepEqual(calls.map(v=>v[0]),["username-gateway","set-session","get-user","profile-query"]);
});

test("email flow uses Auth and loads existing profile",async()=>{
  const {client,calls}=mockClient();
  await authenticateOriginalAccount(client,"PERSON@EXAMPLE.COM","entered-secret");
  assert.deepEqual(calls.map(v=>v[0]),["email-signin","get-user","profile-query"]);
});

test("invalid credentials never load a profile",async()=>{
  const {client,calls}=mockClient({invalidEmail:true});
  await assert.rejects(authenticateOriginalAccount(client,"person@example.com","bad"),/invalid_credentials/);
  assert.deepEqual(calls.map(v=>v[0]),["email-signin"]);
});

test("unexpected profile identity never unlocks a different account",async()=>{
  const {client}=mockClient({mismatch:true});
  await assert.rejects(authenticateOriginalAccount(client,"person@example.com","entered-secret"),/profile_unavailable/);
});

test("Supabase gateway outage keeps the original password-checked database fallback",async()=>{
  const {client,calls}=mockClient({error:{name:"FunctionsFetchError"}});
  await authenticateOriginalAccount(client,"test_member","entered-secret");
  assert.deepEqual(calls.map(v=>v[0]),["username-gateway","fallback-rpc","email-signin","get-user","profile-query"]);
});

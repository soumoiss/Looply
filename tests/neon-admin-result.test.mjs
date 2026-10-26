import test from "node:test";
import assert from "node:assert/strict";
import { isExplicitAdminResult } from "../src/neon-admin-result.js";

test("Neon admin RPC accepts only explicit true across scalar and row result shapes", () => {
  for (const value of [true, "true", [{ v3_self_is_admin: true }], { v3_self_is_admin: "true" }]) {
    assert.equal(isExplicitAdminResult(value), true);
  }
  for (const value of [false, "false", null, [], [{ v3_self_is_admin: false }], { role: "admin" }, { v3_self_is_admin: 1 }]) {
    assert.equal(isExplicitAdminResult(value), false);
  }
});

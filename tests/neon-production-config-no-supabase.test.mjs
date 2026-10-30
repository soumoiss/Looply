import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("published Looply config cannot refer to the retired Supabase project",async()=>{
  const config=await readFile(new URL("../dist/config.js",import.meta.url),"utf8");
  assert.match(config,/LOOPLY_CONFIG/);
  assert.match(config,/rtcIceServers/);
  assert.doesNotMatch(config,/supabase|sb_publishable_|qixocgeti|service_role/i);
});

test("production page and APK share a single sanitized config build step",async()=>{
  const script=await readFile(new URL("../scripts/build.mjs",import.meta.url),"utf8");
  assert.match(script,/writeFile\(path\.join\(outputDirectory, "config\.js"\)/);
  assert.doesNotMatch(script,/cp\(path\.join\(projectRoot, "config\.js"\), path\.join\(outputDirectory, "config\.js"\)\)/);
});

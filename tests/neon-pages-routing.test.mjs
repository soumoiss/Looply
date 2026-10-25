import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
const dist=path.resolve("dist");
const pages=["index.html","login.html","home.html","musicas.html","chat.html","conversa.html","cartas.html","notificacoes.html","usuarios.html","configuracoes.html","perfil.html","admin.html","galeria.html"];
test("GitHub Pages entrypoints use Neon Auth without invoking Supabase modules",async()=>{
 for(const filename of pages){
  const html=await readFile(path.join(dist,filename),"utf8");
  const expected=filename==="index.html"?"src/neon-production-splash.js":filename==="login.html"?"src/neon-production-login.js":"src/neon-production-pages.js";
  assert.match(html,new RegExp('<script type="module" src="'+expected.replace(/\./g,"\\.")+'"></script>'));
  assert.doesNotMatch(html,/src="assets\/js\/(?:login|home|chat|profile)\.js/);
 }
});
test("Neon modules use an authenticated shared client and retain the six migrated username mappings",async()=>{
 const client=await readFile(path.join(dist,"src/neon-production-client.js"),"utf8");
 const login=await readFile(path.join(dist,"src/neon-production-login.js"),"utf8");
 const pages=await readFile(path.join(dist,"src/neon-production-pages.js"),"utf8");
 for(const name of ["peixinho","patati","misol","yara","gaberinjela","eukeiliane"])assert.ok(client.includes(name),name);
 assert.match(login,/signInWithPassword/);
 assert.match(pages,/activeSession/);
 assert.match(pages,/v3_feed_posts/);
 assert.match(client,/v3_self_profile/);
});

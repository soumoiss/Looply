import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
const dist=path.resolve("dist");
const pages=["index.html","login.html","home.html","musicas.html","chat.html","conversa.html","cartas.html","notificacoes.html","usuarios.html","configuracoes.html","perfil.html","admin.html","galeria.html"];
test("GitHub Pages keeps the recovered original controllers and uses Neon for auth",async()=>{
 for(const filename of pages){
  const html=await readFile(path.join(dist,filename),"utf8");
  if(filename==="index.html") assert.match(html,/src="src\/neon-production-splash\.js\?build=[a-f0-9]{16}"/);
  else if(filename==="login.html") assert.match(html,/src="src\/neon-production-login\.js\?build=[a-f0-9]{16}"/);
  else assert.match(html,/src="assets\/js\/[^\"]+\.js\?build=[a-f0-9]{16}"/);
 }
 const runtime=await readFile(path.join(dist,"src/page-runtime.js"),"utf8");
 assert.match(runtime,/neon-production-client\.js/);
 assert.match(runtime,/neon-production-client\.js\?build=[a-f0-9]{16}/);
 assert.doesNotMatch(runtime,/from ["']\.\/supabase\.js/);
 const galleryController=await readFile(path.join(dist,"assets/js/gallery.js"),"utf8");
 assert.match(galleryController,/page-runtime\.js\?build=[a-f0-9]{16}/);
 const gallery=await readFile(path.join(dist,"galeria.html"),"utf8");
 assert.match(gallery,/assets\/js\/gallery\.js\?build=[a-f0-9]{16}/);
 const worker=await readFile(path.join(dist,"sw.js"),"utf8");
 assert.match(worker,/looply-pages-[a-f0-9]{16}/);
});
test("Neon modules use an authenticated shared client and retain the six migrated username mappings",async()=>{
 const client=await readFile(path.join(dist,"src/neon-production-client.js"),"utf8");
 const login=await readFile(path.join(dist,"src/neon-production-login.js"),"utf8");
 const pages=await readFile(path.join(dist,"src/neon-production-pages.js"),"utf8");
 for(const name of ["peixinho","patati","misol","yara","gaberinjela","eukeiliane"])assert.ok(client.includes(name),name);
 assert.match(login,/signInWithPassword/);
 const runtime=await readFile(path.join(dist,"src/page-runtime.js"),"utf8");
 assert.match(runtime,/selfProfile/);
 assert.match(runtime,/headerMarkup/);
 const identity=await readFile(path.join(dist,"src/neon-identity.js"),"utf8");
 assert.match(client,/fetchLinkedNeonProfile/);
 assert.match(identity,/v3_self_profile/);
 assert.match(identity,/Bearer/);
 assert.match(client,/lte\(column, value\)/);
 assert.match(client,/or\(expression\)/);
 assert.match(client,/range\(from, to\)/);
 assert.match(client,/supportsRealtime: false/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const read = name => readFileSync(new URL("../"+name,import.meta.url),"utf8");

test("a chat inbox never paints an empty notification bar above the header",()=>{
  for(const page of ["chat.html","conversa.html"]){
    const html=read(page);
    assert.match(html,/<div class="banner glass" id="banner" role="status" aria-hidden="true" hidden><\/div>/,page);
    assert.match(html,/#banner\[hidden\],#banner:empty\{display:none!important\}/,page);
    assert.match(html,/#banner:not\(\.on\)\{visibility:hidden!important;pointer-events:none!important\}/,page);
  }
});
test("incoming message notification only becomes visible with content and dismisses fully",()=>{
  for(const page of ["chat.html","conversa.html"]){
    const source=read(page);
    const handler=source.split("let bt;function banner(c,m)")[1]?.split("/* menu da conversa e busca */")[0];
    assert.ok(handler,page+": banner handler exists");
    assert.match(handler,/b\.hidden=false/);
    assert.match(handler,/b\.setAttribute\("aria-hidden","false"\)/);
    assert.match(handler,/if\(!b\.hidden&&b\.childElementCount\)b\.classList\.add\("on"\)/);
    assert.match(handler,/b\.hidden=true/);
    assert.match(handler,/b\.setAttribute\("aria-hidden","true"\)/);
    assert.match(handler,/b\.replaceChildren\(\)/);
    assert.match(handler,/bt=setTimeout\(dismiss,5000\)/);
    assert.match(handler,/b\.onclick=\(\)=>\{clearTimeout\(bt\);dismiss\(\)/);
  }
});
test("chat inline scripts remain syntactically valid",()=>{
  for(const page of ["chat.html","conversa.html"]){
    const html=read(page);
    const matches=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
    let inline=0;
    for(const entry of matches){
      if(!entry[1].trim())continue;
      inline++;
      const result=spawnSync(process.execPath,["--check","--input-type=commonjs"],{input:entry[1],encoding:"utf8"});
      assert.equal(result.status,0,page+" inline script "+inline+": "+result.stderr);
    }
    assert.ok(inline>=1,page+": inline handlers were found");
  }
});

// Render the REAL Stories stylesheet in headless Chromium/Chrome and verify
// mobile song rows cannot overlap or hide the white "Escolher" button text.
import {readFile,mkdtemp,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import assert from "node:assert/strict";

const css=await readFile(new URL("../assets/css/pages/story-studio.css",import.meta.url),"utf8");
const browser=["google-chrome","google-chrome-stable","chromium","chromium-browser"]
  .find(name=>spawnSync(name,["--version"],{encoding:"utf8",timeout:4000}).status===0);
if(!browser){
  console.log("Chromium unavailable on this runner. Layout browser test was not executed.");
  process.exit(0);
}
const row=(art,title,artist)=>'<article class="studio-catalog-song">'+
  (art?'<img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E" alt="">':"")+
  '<div class="studio-catalog-info"><strong>'+title+'</strong><small>'+artist+' · Apple Music</small></div>'+
  '<div class="studio-music-row-actions">'+
  '<button type="button" class="studio-music-listen">▶ Ouvir prévia</button>'+
  '<button type="button" class="studio-catalog-select">Escolher</button>'+
  '</div></article>';
const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<style>'+css+'</style></head><body style="margin:0">'+
  '<div class="story-studio" style="position:relative;width:360px;height:740px">'+
  '<div class="studio-modal-panel" style="width:360px;max-height:740px;padding:14px">'+
  '<div class="studio-music-picker"><div class="studio-music-results" style="max-height:620px">'+
  row(true,"earthquake","JISOO")+
  row(true,"FLOWER","JISOO")+
  row(false,"Uma música com nome bastante longo que deve ser truncado","Artista extremamente longo")+
  '</div></div></div></div>'+
  '<pre id="music-layout-check"></pre>'+
  '<script>(function(){'+
  'const rows=[...document.querySelectorAll(".studio-catalog-song")];'+
  'const results=rows.map(row=>{const info=row.querySelector(".studio-catalog-info").getBoundingClientRect();'+
  'const actions=row.querySelector(".studio-music-row-actions").getBoundingClientRect();'+
  'const rect=row.getBoundingClientRect();'+
  'const buttons=[...row.querySelectorAll(".studio-music-row-actions button")];'+
  'const listen=buttons[0].getBoundingClientRect(),choose=buttons[1].getBoundingClientRect();'+
  'const color=getComputedStyle(buttons[1]).color,background=getComputedStyle(buttons[1]).backgroundColor;'+
  'return {titleAboveButtons:actions.top>=info.bottom+2,buttonsSeparated:listen.right<=choose.left+1,'+
  'buttonsInside:listen.left>=rect.left&&choose.right<=rect.right+1,visibleText:color==="rgb(24, 20, 29)"&&background==="rgb(255, 255, 255)",'+
  'rowWidth:rect.width,rowHeight:rect.height,selectWidth:choose.width,listenWidth:listen.width};});'+
  'document.getElementById("music-layout-check").textContent=JSON.stringify(results);'+
  '})();</script></body></html>';
const dir=await mkdtemp(join(tmpdir(),"looply-music-layout-"));
try{
  const file=join(dir,"index.html");
  await writeFile(file,html);
  const result=spawnSync(browser,["--headless=new","--no-sandbox","--disable-gpu","--disable-dev-shm-usage",
    "--no-first-run","--window-size=390,800","--virtual-time-budget=1000","--dump-dom","file://"+file],
    {encoding:"utf8",timeout:18000,maxBuffer:4*1024*1024});
  assert.equal(result.status,0,result.stderr.slice(-1200));
  const match=result.stdout.match(/<pre id="music-layout-check">([^<]+)<\/pre>/);
  assert.ok(match,"Browser did not render music geometry report");
  const rows=JSON.parse(match[1]);
  assert.equal(rows.length,3);
  for(const [i,row] of rows.entries()){
    assert.ok(row.titleAboveButtons,"Song "+i+" text overlaps buttons: "+JSON.stringify(row));
    assert.ok(row.buttonsSeparated,"Song "+i+" buttons overlap: "+JSON.stringify(row));
    assert.ok(row.buttonsInside,"Song "+i+" button exceeds card bounds: "+JSON.stringify(row));
    assert.ok(row.visibleText,"Song "+i+" white button text is not readable: "+JSON.stringify(row));
  }
  console.log("REAL CHROME mobile layout PASS",rows);
}finally{await rm(dir,{recursive:true,force:true});}

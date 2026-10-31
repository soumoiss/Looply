import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {join,resolve,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const OUT=join(ROOT,"smoke-results/external-share-audience");
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css"};
const stub=`
const people=[
 {id:"97c1aaa1-2222-4333-8444-555555555555",username:"Peixinho",display_name:"Peixinho"},
 {id:"f5faba11-2222-4333-8444-555555555555",username:"MiSol",display_name:"MiSol"},
 {id:"a10c0001-2222-4333-8444-555555555555",username:"Yara",display_name:"Yara"},
 {id:"a10c0002-2222-4333-8444-555555555555",username:"Patati",display_name:"Patati"}];
export const NEON_DATA_API_URL="/data-api";
export async function activeSession(){return {access_token:"visual-test-session"};}
export const looplyClient={
 auth:{getUser:async()=>({data:{user:{id:people[0].id}},error:null})},
 from:table=>({
  select(){return this;},order(){return this;},
  limit:async()=>({data:table==="profiles"?people:[],error:null})
 }),
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:null},error:null})})}
};
`;
let postAttempts=0;
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,"http://localhost");
    if(url.pathname.startsWith("/data-api/")){postAttempts++;res.writeHead(503);res.end("not available");return;}
    if(url.pathname==="/src/neon-production-client.js"){
      res.writeHead(200,{"content-type":"text/javascript; charset=utf-8","cache-control":"no-store"});
      res.end(stub);return;
    }
    if(!/^\/(?:share\.html|src\/share-audience\.js|assets\/css\/pages\/share-external\.css)$/.test(url.pathname)){
      res.writeHead(404);res.end();return;
    }
    const content=await readFile(join(ROOT,url.pathname.slice(1)));
    res.writeHead(200,{"content-type":MIME[extname(url.pathname)]+"; charset=utf-8"});
    res.end(content);
  }catch(e){res.writeHead(500);res.end(String(e));}
});
await mkdir(OUT,{recursive:true});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
let browser=null;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const width of [320,360,390,428,768]){
  const context=await browser.newContext({viewport:{width,height:740},deviceScaleFactor:1});
  const page=await context.newPage();
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(origin+"/share.html?text="+encodeURIComponent("Assista https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
  await page.locator('input[value="public"]').waitFor();
  assert.equal(await page.locator('#shareAudienceNote').textContent(),
    "Todos os usuários autorizados do Looply poderão visualizar.");
  await page.screenshot({path:join(OUT,"share-public-"+width+".png")});
  await page.locator('label.share-visibility').filter({has:page.locator('input[value="selected"]')}).click();
  await page.locator("#peoplePicker").waitFor({state:"visible"});
  await page.locator('input[type="checkbox"]').first().waitFor({state:"visible"});
  assert.equal(await page.locator(".share-person-row").count(),3,"owner excluded");
  await page.locator("#sharePersonSearch").fill("mis");
  assert.equal(await page.locator(".share-person-row").count(),1);
  await page.locator('.share-person-row input[type="checkbox"]').check();
  await page.locator("#sharePersonSearch").fill("");
  await page.locator(".share-person-row").filter({hasText:"Yara"}).locator("input").check();
  await page.locator("#confirmPeople").click();
  assert.equal(await page.locator(".share-person-chip").count(),2);
  assert.match(await page.locator("#chosenCount").textContent(),/2 pessoa/);
  await page.screenshot({path:join(OUT,"share-selected-"+width+".png")});
  const geometry=await page.evaluate(()=>{
    const shell=document.querySelector(".share-shell").getBoundingClientRect();
    return {width:innerWidth,bodyScroll:document.documentElement.scrollWidth,
      shell:{x:shell.x,right:shell.right,width:shell.width}};
  });
  assert.ok(geometry.bodyScroll<=width+1,"horizontal overflow "+width+" "+JSON.stringify(geometry));
  assert.ok(geometry.shell.x>=-1&&geometry.shell.right<=width+1,"shell outside viewport "+width);
  await page.locator(".share-person-chip").first().locator("button").click();
  assert.equal(await page.locator(".share-person-chip").count(),1);
  await page.locator('label.share-visibility').filter({has:page.locator('input[value="public"]')}).click();
  assert.equal(await page.locator(".share-person-chip").count(),0,"switch to all clears stale users");
  assert.equal(await page.locator("#selectedAudience").isHidden(),true);
  assert.equal(errors.length,0,"browser errors: "+errors.join(" | "));
  assert.equal(postAttempts,0,"must never auto publish");
  await context.close();
 }
 console.log("External share audience visual checks passed at 320 360 390 428 and 768px");
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

/* Browser smoke: theme persistence + typography across live pages and tabs. */
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {chromium} from "playwright";
const root=resolve(process.cwd(),"dist");
const types={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",
  ".css":"text/css;charset=utf-8",".svg":"image/svg+xml",".png":"image/png"};
const fixture='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<script src="src/theme-bootstrap.js"></script>'+
  '<link rel="stylesheet" href="assets/css/app.css">'+
  '<link rel="stylesheet" href="assets/css/global-theme-typography.css"></head>'+
  '<body class="looply-page page-settings"><div class="container-page">'+
  '<header class="page-header" data-site-header><a class="brand-inline"><strong>Looply</strong></a></header>'+
  '<main><section class="hero-panel page-title-panel"><h1 class="hero-title">Configurações</h1>'+
  '<p>Texto de exemplo</p><button class="primary-button">Salvar</button></section></main></div></body></html>';
const server=createServer(async(req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,"http://local").pathname);
  if(!pathname.startsWith("/Looply/")){res.writeHead(404);return res.end();}
  if(pathname==="/Looply/_appearance-fixture.html"){
    res.writeHead(200,{"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store"});
    return res.end(fixture);
  }
  const target=resolve(root,pathname.slice("/Looply/".length));
  if(!target.startsWith(root+sep)){res.writeHead(403);return res.end();}
  try{
    const body=await readFile(target);
    res.writeHead(200,{"Content-Type":types[extname(target)]||"application/octet-stream",
      "Cache-Control":"no-store"});
    res.end(body);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:"light"});
const uri="http://127.0.0.1:"+server.address().port+"/Looply/";
try{
  const page=await context.newPage();
  await page.goto(uri+"_appearance-fixture.html",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>Boolean(window.LooplyThemeCatalog),null,{timeout:8000});
  const styles=await page.evaluate(()=>{
    const ids=["lilas","noite","oceano","rosa","floresta","aurora","coral","menta",
      "sunset","grafite","hacker","bts","blackpink","bob_esponja","jovens_titas",
      "teen_wolf","cyberpunk","kawaii","vaporwave"];
    const records=[];
    for(const id of ids){
      const result=window.looplyApplyAppearance({theme:id,font_family:"orbitron",font_size:"large"},true);
      const root=document.documentElement,computed=getComputedStyle(root);
      const button=getComputedStyle(document.querySelector(".primary-button"));
      const heading=getComputedStyle(document.querySelector("h1"));
      const brand=getComputedStyle(document.querySelector(".brand-inline strong"));
      records.push({id,selected:root.dataset.theme,
        color:computed.getPropertyValue("--primary").trim(),
        foreground:button.color,background:button.backgroundColor,
        font:heading.fontFamily,brand:brand.fontFamily,
        base:computed.fontSize});
    }
    return records;
  });
  for(const row of styles){
    assert.equal(row.selected,row.id,row.id);
    assert.ok(row.color.startsWith("#"),row.id);
    assert.match(row.font,/Orbitron/i,row.id);
    assert.match(row.brand,/Cabin Sketch/i,row.id);
    assert.equal(row.base,"17.92px",row.id);
  }
  await page.evaluate(()=>{
    window.looplyApplyAppearance({theme:"hacker",font_family:"fredoka",font_size:"normal"},true);
  });
  const page2=await context.newPage();
  await page2.goto(uri+"_appearance-fixture.html",{waitUntil:"domcontentloaded"});
  const other=await page2.evaluate(()=>({
    theme:document.documentElement.dataset.theme,
    font:document.documentElement.dataset.fontFamily
  }));
  assert.deepEqual(other,{theme:"hacker",font:"fredoka"});
  await page.evaluate(()=>window.looplyApplyAppearance({theme:"blackpink",font_family:"outfit"},true));
  await page2.waitForFunction(()=>document.documentElement.dataset.theme==="blackpink"&&
    document.documentElement.dataset.fontFamily==="outfit",null,{timeout:5000});

  // Real exported documents, not just the fixture: the bootstrap executes on
  // standalone Chat and Why Now before any authenticated page module loads.
  for(const path of ["configuracoes.html","chat.html","why-now.html"]){
    const target=await context.newPage();
    await target.goto(uri+path,{waitUntil:"domcontentloaded"});
    const data=await target.evaluate(()=>({
      theme:document.documentElement.dataset.theme,
      font:document.documentElement.dataset.fontFamily,
      css:Boolean(document.querySelector("link[data-looply-appearance-styles]"))
    }));
    assert.equal(data.theme,"blackpink",path);
    assert.equal(data.font,"outfit",path);
    assert.ok(data.css,path);
    await target.close();
  }
  await mkdir("smoke-results",{recursive:true});
  await page.screenshot({path:"smoke-results/appearance-blackpink.png",fullPage:true});
  await page.evaluate(()=>window.looplyApplyAppearance({theme:"bob_esponja",font_family:"fredoka"},true));
  await page.screenshot({path:"smoke-results/appearance-bob-esponja.png",fullPage:true});
  await page2.close();
  await page.close();
  console.log("PASS: 19 themes, theme-matched fonts, account storage sync, Chat and Why Now");
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}

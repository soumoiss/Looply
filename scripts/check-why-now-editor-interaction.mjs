// Browser regression smoke test: independent Why Now editor + shared CC0 Chat stickers.
import {createServer} from "node:http";
import {readFile, mkdir} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {chromium} from "playwright";

const root=resolve(process.cwd());
const types={".html":"text/html;charset=utf-8",".js":"text/javascript;charset=utf-8",
  ".css":"text/css;charset=utf-8",".webp":"image/webp",".svg":"image/svg+xml",
  ".png":"image/png",".json":"application/json"};
const server=createServer(async(req,res)=>{
  const uri=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  const file=resolve(root,"."+uri);
  if(!file.startsWith(root+sep)){res.writeHead(403);return res.end();}
  try{
    const body=await readFile(file);
    res.writeHead(200,{"Content-Type":types[extname(file)]||"application/octet-stream","Cache-Control":"no-store"});
    res.end(body);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port;
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true});
const errors=[];
page.on("pageerror",err=>errors.push(String(err)));
const fail=(message)=>{throw Error(message+"; pageerrors="+errors.join(" / "));};

try{
  await page.goto("http://127.0.0.1:"+port+"/why-now.html",{waitUntil:"domcontentloaded"});
  await page.waitForSelector("#editor .wn-layer-tools",{state:"attached",timeout:10000});
  await page.evaluate(()=>{
    const b64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLx6QAAAABJRU5ErkJggg==";
    const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    enterEditor({blob:new Blob([bytes],{type:"image/png"}),type:"image",mime:"image/png"});
  });
  await page.locator("#tool-text").click();
  await page.locator("#wn-text-value").fill("Texto de teste");
  await page.locator("#wn-text-save").click();
  await page.waitForSelector("#edit-overlays .overlay-item");
  let size=await page.evaluate(()=>editorItems[0]?.size);
  if(size!==30)fail("Text was not added at the selected size");

  // Mobile scale: one finger on the text and the other anywhere on the stage.
  const scaled=await page.evaluate(()=>{
    const item=editorItems[0], start=item.size;
    const el=document.querySelector("#edit-overlays .overlay-item");
    const stage=document.querySelector("#edit-stage");
    const b=el.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2;
    const dispatch=(target,type,id,px,py)=>target.dispatchEvent(new PointerEvent(type,{
      bubbles:true,cancelable:true,pointerId:id,pointerType:"touch",
      clientX:px,clientY:py,buttons:type==="pointerup"?0:1
    }));
    dispatch(el,"pointerdown",61,x,y);
    dispatch(stage,"pointerdown",62,x+27,y+27);
    dispatch(stage,"pointermove",62,x+110,y+110);
    dispatch(el,"pointerup",61,x,y);
    dispatch(stage,"pointerup",62,x+110,y+110);
    return {start,end:item.size};
  });
  if(!(scaled.end>scaled.start+10))fail("Two-finger pinch did not enlarge text: "+JSON.stringify(scaled));

  await page.locator("#edit-overlays .overlay-item").first().click();
  await page.locator("[data-wn-edit]").click();
  await page.locator("#wn-text-value").fill("Texto editado ✨");
  await page.locator("#wn-text-size").fill("58");
  await page.locator("#wn-text-palette button[data-color='#f98fa5']").click();
  await page.locator("#wn-text-save").click();
  const changes=await page.evaluate(()=>({
    text:editorItems[0].text,size:editorItems[0].size,color:editorItems[0].color
  }));
  if(changes.text!=="Texto editado ✨"||changes.size!==58||changes.color!=="#f98fa5")
    fail("Editing text/color/size did not persist: "+JSON.stringify(changes));

  await page.locator("#tool-sticker").click();
  await page.waitForSelector("#wn-sticker-grid .chat-catalog-item [data-wn-sticker-id]",{timeout:10000});
  const columns=await page.evaluate(()=>getComputedStyle(document.querySelector("#wn-sticker-grid")).gridTemplateColumns.split(" ").length);
  if(columns!==5)fail("Sticker gallery is not five-column: "+columns);
  await page.locator("#wn-sticker-grid .chat-catalog-item [data-wn-sticker-id]").first().click();
  await page.waitForFunction(()=>editorItems.some(item=>item.type==="sticker-image"),{timeout:10000});
  const sticker=await page.evaluate(()=>{
    const item=editorItems.find(entry=>entry.type==="sticker-image");
    return {size:item?.size,source:item?.imageSrc?.slice(0,16),title:item?.title};
  });
  if(sticker.size!==100||sticker.source!=="data:image/webp;")fail("Sticker was not normalized for safe rendering: "+JSON.stringify(sticker));

  const exported=await page.evaluate(async()=>{
    const b=await exportPhotoBlob();
    return {size:b?.size||0,type:b?.type||""};
  });
  if(exported.type!=="image/png"||exported.size<300)
    fail("Composited image export is invalid: "+JSON.stringify(exported));
  await mkdir("smoke-results",{recursive:true});
  await page.screenshot({path:"smoke-results/why-now-editor-20261110.png",fullPage:true});
  if(errors.length)fail("Uncaught page error");
  process.stdout.write("PASS: add/edit/pinch/color text; 5-col chat stickers; image composited in PNG\n");
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}

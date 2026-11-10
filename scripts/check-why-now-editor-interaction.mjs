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
  await page.evaluate(()=>{const el=document.querySelector("#wn-text-size");el.value="58";el.dispatchEvent(new Event("input",{bubbles:true}));});
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
  // Regression: a remote R2 image preview can load while fetch() is denied
  // by CORS. Click must use authenticated parent Blob handoff, not signed URL.
  await page.evaluate(async()=>{
    const asset=await fetch("/assets/stickers/cc0/cat-scared.webp");
    const blob=await asset.blob();
    const original=window.fetch.bind(window);
    window.__r2DirectFetches=0;
    window.fetch=(url,...args)=>{
      if(String(url).includes("r2.example.invalid")){
        window.__r2DirectFetches++;
        return Promise.reject(new TypeError("CORS blocked direct R2 fetch"));
      }
      return original(url,...args);
    };
    window.__remoteBlobRequests=0;
    window.whyNowStickerBridge=async(action)=>{
      if(action==="sticker-metadata")return {packs:["Pacote real"],favorites:[]};
      if(action==="sticker-page")return {items:[{
        id:"11111111-1111-4111-8111-111111111111",
        title:"Figurinha do Chat",src:"https://r2.example.invalid/signed-private.webp",
        storage_path:"stickers/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp"
      }],nextOffset:1,hasMore:false};
      if(action==="sticker-image"){
        window.__remoteBlobRequests++;
        return {blob};
      }
      throw Error("unexpected sticker action: "+action);
    };
    window.whyNowStickerCurrentUser=()=> "22222222-2222-4222-8222-222222222222";
  });
  const previousStickerCount=await page.evaluate(()=>editorItems.filter(x=>x.type==="sticker-image").length);
  await page.locator("#tool-sticker").click();
  await page.waitForSelector('#wn-sticker-grid [data-wn-sticker-id="11111111-1111-4111-8111-111111111111"]',{timeout:10000});
  await page.locator('#wn-sticker-grid [data-wn-sticker-id="11111111-1111-4111-8111-111111111111"]').click();
  await page.waitForFunction(count=>editorItems.filter(x=>x.type==="sticker-image").length>count,previousStickerCount);
  const remote=await page.evaluate(()=>({
    directFetches:window.__r2DirectFetches,
    authenticatedRequests:window.__remoteBlobRequests,
    count:editorItems.filter(x=>x.type==="sticker-image").length
  }));
  if(remote.directFetches!==0||remote.authenticatedRequests!==1)
    fail("Remote R2 image used unauthenticated browser fetch: "+JSON.stringify(remote));

  await mkdir("smoke-results",{recursive:true});
  await page.screenshot({path:"smoke-results/why-now-editor-20261110.png",fullPage:true});
  if(errors.length)fail("Uncaught page error");
  process.stdout.write("PASS: add/edit/pinch/color text; 5-col chat stickers; image composited in PNG\n");
} finally {
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}

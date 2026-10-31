import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {resolve,join,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const OUT=join(ROOT,"smoke-results/neon-ttt-20261031");
const MIME={".css":"text/css",".js":"text/javascript",".html":"text/html"};
const fixture = "<!doctype html><html lang=\"pt-BR\" data-theme=\"lilas\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><link rel=\"stylesheet\" href=\"/styles.css\"><link rel=\"stylesheet\" href=\"/assets/css/app.css\"><link rel=\"stylesheet\" href=\"/assets/css/pages/shared.css\"><link rel=\"stylesheet\" href=\"/assets/css/pages/chat.css\"></head><body class=\"looply-page page-chat\"><main id=\"root\" style=\"min-height:900px\"><div class=\"chat-thread-heading\" data-chat-kind=\"direct\"><strong>Patati</strong></div><form data-chat-send data-conversation-id=\"49c94fda-e7ba-422e-a987-db5a8c5036d0\"><textarea aria-label=\"Mensagem\"></textarea></form><button id=\"reopenGame\" data-v2-game>Jogo da velha</button></main><script type=\"module\">\nimport {setupChatTtt} from \"/src/chat-ttt.js\";\nconst root=document.getElementById(\"root\"),owner=\"d218a499-e3ad-45c5-b115-26272a6f3e79\",other=\"b144cb59-0e85-4c43-b6ee-ed44252fc99b\";\nlet version=1;\nlet state={\n  gameId:\"11111111-1111-4111-8111-111111111111\",\n  conversationId:\"49c94fda-e7ba-422e-a987-db5a8c5036d0\",\n  status:\"active\",board:[\"X\",\"O\",\"X\",\"\",\"O\",\"\",\"\",\"\",\"\"],turn:owner,\n  winnerId:null,isDraw:false,xPlayer:other,oPlayer:owner,round:1,invitedBy:other,\n  updatedAt:String(version),\n  x:{id:other,name:\"Bielzinho\",username:\"patati\",avatarPath:null},\n  o:{id:owner,name:\"Moisés\",username:\"peixinho\",avatarPath:null},score:{x:2,o:1,draws:1}\n};\nconst client={\n  rpc:async(name,args)=>{\n    if(name===\"v25_ttt_move\"){\n      if(args.p_cell!==3)return {error:{message:\"invalid_move\"},data:null};\n      state.board[3]=\"O\";state.turn=other;state.updatedAt=String(++version);\n    }\n    return {data:structuredClone(state),error:null};\n  },\n  channel:()=>({on(){return this},subscribe(){return this},send:async()=>\"ok\"}),\n  removeChannel:async()=>{},\n  storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:null},error:null})})}\n};\nconst openModal=html=>{\n  let modal=document.querySelector(\"[data-chat-v2-modal]\");\n  if(!modal){\n    modal=document.createElement(\"div\");modal.className=\"chat-v2-modal-backdrop\";\n    modal.dataset.chatV2Modal=\"\";modal.innerHTML='<section class=\"chat-v2-modal\" role=\"dialog\"><button type=\"button\" data-v2-close>×</button><div class=\"contents\"></div></section>';\n    root.append(modal);\n  }\n  modal.querySelector(\".contents\").innerHTML=html;modal.hidden=false;\n};\nconst closeModal=()=>{\n const m=document.querySelector(\"[data-chat-v2-modal]\");if(m)m.hidden=true;\n};\nconst game=setupChatTtt({root,client,userId:owner,\n  selectedConversation:()=> \"49c94fda-e7ba-422e-a987-db5a8c5036d0\",\n  isGroup:()=>false,openModal,closeModal,toast:()=>{}\n});\nroot.addEventListener(\"click\",e=>{\n const b=e.target.closest(\"button\");if(b)void game.handleClick(b);\n});\nawait game.onConversation();\nwindow.fixtureReady=true;\nwindow.setWinner=()=>{\n state.board=[\"X\",\"X\",\"X\",\"O\",\"O\",\"\",\"\",\"\",\"\"];\n state.status=\"finished\";state.turn=null;state.winnerId=other;\n state.score.x=3;state.updatedAt=String(++version);\n document.querySelector(\"#reopenGame\").click();\n};\n</script></body></html>";
// The real thread heading sits inside a padded conversation container.
// The stand-alone fixture has no such wrapper, so neutralize its full-bleed
// negative margins to test the game itself, rather than a nonexistent shell.
const testFixture=fixture.replace(
  '<div class="chat-thread-heading" data-chat-kind="direct">',
  '<div class="chat-thread-heading" data-chat-kind="direct" style="margin-inline:0;width:100%">'
);
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,"http://localhost").pathname;
    if(path==="/__ttt_fixture__"){res.writeHead(200,{"content-type":"text/html"});res.end(testFixture);return;}
    if(!/^\/(?:src\/chat-ttt\.js|styles\.css|assets\/css\/app\.css|assets\/css\/pages\/(?:shared|chat)\.css)$/.test(path)){
      res.writeHead(404);res.end();return;
    }
    const content=await readFile(join(ROOT,path.slice(1)));
    res.writeHead(200,{"content-type":MIME[extname(path)]+"; charset=utf-8"});res.end(content);
  }catch(e){res.writeHead(500);res.end(String(e));}
});
await mkdir(OUT,{recursive:true});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
let browser=null;
try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const width of [320,360,390,428,768]){
    const context=await browser.newContext({viewport:{width,height:780},deviceScaleFactor:1});
    const page=await context.newPage(),errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto(origin+"/__ttt_fixture__");
    await page.waitForFunction(()=>window.fixtureReady===true);
    await page.locator(".chat-ttt-player").first().waitFor();
    assert.equal(await page.locator(".chat-ttt-player").count(),2);
    assert.equal(await page.locator(".chat-v2-cell").count(),9);
    const names=await page.locator(".chat-ttt-players").innerText();
    for(const name of ["Bielzinho","Moisés","patati","peixinho"])
      assert.ok(names.includes(name),"Missing verified player: "+name);
    assert.match(await page.locator(".chat-ttt-player").first().innerText(),/2 vitórias/);
    assert.match(await page.locator(".chat-ttt-player").last().innerText(),/1 vitória/);
    const geometry=await page.evaluate(()=>{
      const board=document.querySelector(".chat-v2-board").getBoundingClientRect();
      const modal=document.querySelector(".chat-v2-modal").getBoundingClientRect();
      const cards=[...document.querySelectorAll(".chat-ttt-player")].map(e=>e.getBoundingClientRect());
      return {width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,
        parts:[board,modal,...cards].map(r=>({left:r.left,right:r.right,width:r.width}))};
    });
    if(geometry.overflow>1){
      const offenders=await page.evaluate(()=>[...document.querySelectorAll("body *")].map(el=>({tag:el.tagName,classes:el.className?.toString()?.slice(0,70),rect:el.getBoundingClientRect()})).filter(x=>x.rect.right>innerWidth+1||x.rect.left< -1).slice(0,15).map(x=>({tag:x.tag,classes:x.classes,left:x.rect.left,right:x.rect.right,width:x.rect.width})));
      console.log("TTT_HORIZONTAL_OVERFLOW",JSON.stringify({geometry,offenders}));
    }
    assert.ok(geometry.overflow<=1,"Horizontal overflow "+JSON.stringify(geometry));
    for(const rect of geometry.parts)
      assert.ok(rect.left>=-1&&rect.right<=width+1,"Outside viewport "+JSON.stringify(rect));
    await page.screenshot({path:join(OUT,"game-"+width+".png")});
    await page.locator('[data-v2-cell="3"]').click();
    await page.waitForFunction(()=>document.querySelector('[data-v2-cell="3"]')?.textContent==="O");
    await page.evaluate(()=>window.setWinner());
    await page.waitForFunction(()=>document.querySelectorAll(".chat-v2-cell.is-winning").length===3);
    assert.match(await page.locator(".chat-v2-game-status").textContent(),/Bielzinho venceu/);
    await page.screenshot({path:join(OUT,"winner-"+width+".png")});
    assert.deepEqual(errors,[],"JavaScript errors "+errors.join(","));
    await context.close();
  }
  console.log("TTT real Chromium layouts and controls passed: 320 360 390 428 768px");
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}

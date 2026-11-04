import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {resolve,join,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
import {chatMarkup,threadMarkup,messageComposerMarkup} from "../src/chat.js";

const ROOT=resolve(fileURLToPath(new URL("../",import.meta.url)));
const OUTPUT=join(ROOT,"smoke-results/chat-premium-20261103");
const uid="11111111-1111-4111-8111-111111111111",pid="22222222-2222-4222-8222-222222222222";
const cid="33333333-3333-4333-8333-333333333333";
const conversations=[{id:cid,kind:"direct",updated_at:"2026-11-03T11:08:00Z",
  lastMessage:{body:"Mensagem de teste",sender_id:pid,created_at:"2026-11-03T11:08:00Z"},
  unreadCount:2,participants:[{user_id:uid,profile:{id:uid,username:"me"}},
  {user_id:pid,profile:{id:pid,username:"contatoteste",display_name:"Contato de teste"}}]}];
const note="💌 Bilhete\nUm momento especial para você.";
const messages=Array.from({length:12},(_,i)=>({
  id:"44444444-4444-4444-8444-"+String(i).padStart(12,"0"),conversation_id:cid,
  sender_id:i%3===0?uid:pid,created_at:new Date(Date.UTC(2026,10,3,10,i*4)).toISOString(),
  body:i===5?note:i%3===0?"Mensagem que eu enviei "+i:"Mensagem que recebi "+i,
  author:{id:i%3===0?uid:pid,username:"contatoteste",display_name:i%3===0?"Você":"Contato de teste"},
  media:[],reactions:[]
}));
const content=chatMarkup({error:false,conversations,profiles:[],notifications:[],profilesError:null},uid);
const chatBody=threadMarkup(messages,uid,null,{id:pid,username:"contatoteste",display_name:"Contato de teste"},[],false);
const mockedThread='<header class="chat-thread-heading" data-conversation-id="'+cid+'">'+
  '<button class="chat-back-button" type="button" aria-label="Voltar">←</button>'+
  '<span class="chat-thread-avatar">C</span><div class="chat-thread-identity"><strong>Contato de teste</strong><small>Conversa privada</small></div>'+
  '<button class="chat-v2-icon-button" aria-label="Áudio">☎</button>'+
  '<button class="chat-v2-icon-button" aria-label="Vídeo">▹</button></header>'+
  '<div class="chat-premium-history" data-chat-premium-history>'+chatBody+'</div>'+
  messageComposerMarkup(cid);
const fixture='<!doctype html><html lang="pt-BR" data-theme="lilas"><head>'+
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
  '<link rel="stylesheet" href="/assets/css/pages/chat-foundation.css">'+
  '<link rel="stylesheet" href="/assets/css/pages/chat-features.css">'+
  '<link rel="stylesheet" href="/assets/css/pages/chat-gartic.css">'+
  '<link rel="stylesheet" href="/assets/css/pages/chat-premium.css">'+
  '</head><body class="looply-page page-chat">'+
  '<div class="container-page"><header class="page-header"><strong>Looply</strong></header>'+
  '<main><div class="page-content" id="pageContent">'+content+
  '</div></main></div></body></html>';

const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,"http://localhost").pathname;
    if(path==="/__chat_fixture__"){
      res.writeHead(200,{"content-type":"text/html; charset=utf-8"});
      res.end(fixture);return;
    }
    if(!/^\/(?:assets\/css\/(?:pages\/)?[a-zA-Z0-9-]+\.css|styles\.css)$/.test(path)){
      res.writeHead(404);res.end();return;
    }
    const buf=await readFile(join(ROOT,path.slice(1)));
    res.writeHead(200,{"content-type":path.endsWith(".js")?"text/javascript":"text/css"});res.end(buf);
  }catch(error){res.writeHead(404);res.end();}
});
await mkdir(OUTPUT,{recursive:true});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const url="http://127.0.0.1:"+server.address().port+"/__chat_fixture__";
let browser;
try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  for(const [width,height] of [[320,712],[360,800],[390,844],[428,926],[768,1024],[1100,800],[1440,900]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,isMobile:width<=860,hasTouch:width<=860});
    const page=await context.newPage();
    const errors=[];page.on("pageerror",error=>errors.push(error.message));
    await page.goto(url,{waitUntil:"load"});
    const cases=width<=860?["list","thread"]:["thread"];
    for(const mode of cases){
      await page.evaluate(({mode,markup})=>{
        const root=document.querySelector("[data-chat-area]");
        if(mode==="thread"){
          root.classList.add("is-conversation-open");
          root.querySelector("[data-chat-thread]").innerHTML=markup;
        } else root.classList.remove("is-conversation-open");
      },{mode,markup:mockedThread});
      const geometry=await page.evaluate(()=>{
        const el=selector=>document.querySelector(selector);
        const rect=selector=>{
          const node=el(selector);if(!node)return null;
          const b=node.getBoundingClientRect();
          return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom,right:b.right};
        };
        const visible=selector=>{const node=el(selector);return Boolean(node&&
          getComputedStyle(node).display!=="none"&&node.getBoundingClientRect().height>0);};
        return {vw:innerWidth,vh:innerHeight,scrollWidth:document.documentElement.scrollWidth,
          root:rect("[data-chat-area]"),sidebar:rect(".chat-sidebar"),
          thread:rect(".chat-thread-panel"),history:rect("[data-chat-premium-history]"),
          composer:rect(".chat-premium-compose-row"),textarea:rect(".chat-premium-compose-row textarea"),
          listVisible:visible(".chat-sidebar"),threadVisible:visible(".chat-thread-panel"),
          composeVisible:visible(".chat-premium-compose-row"),
          noteVisible:visible(".chat-premium-note-card"),
          bodyWidth:document.body.scrollWidth,
          themeColor:getComputedStyle(el(".chat-premium")).getPropertyValue("--pm-primary").trim()};
      });
      console.log("CHAT_PREMIUM_VIEWPORT",JSON.stringify({width,height,mode,geometry}));
      assert.ok(geometry.root.w>0,"root not rendered");
      assert.ok(geometry.scrollWidth<=width+2,"horizontal overflow at "+width);
      assert.ok(geometry.bodyWidth<=width+2,"body overflow at "+width);
      if(mode==="list"){assert.ok(geometry.listVisible,"list missing on mobile");assert.ok(!geometry.threadVisible,"thread leaked into list");}
      if(mode==="thread"){
        assert.ok(geometry.threadVisible,"thread missing");
        assert.ok(geometry.composeVisible,"composer hidden");
        assert.ok(geometry.history.h>65,"message history too small");
        assert.ok(geometry.composer.bottom<=height+5,"composer below phone viewport");
        assert.ok(geometry.composer.w>200,"composer collapsed");
        assert.ok(geometry.noteVisible,"premium note absent");
      }
      assert.deepEqual(errors,[],"browser error");
      if(mode==="thread"){
        const note=page.locator(".chat-premium-note-card").first();
        await note.locator("summary").click();
        await note.locator(".chat-letter-paper").waitFor({state:"visible"});
        assert.equal(await note.getAttribute("open"),"");
        await note.locator("summary").press("Enter");
        assert.equal(await note.getAttribute("open"),null);
      }
      if(width<=860 && mode==="list"){
        const scroll=await page.evaluate(()=>{
          const sidebar=document.querySelector(".chat-sidebar");
          const list=document.querySelector(".chat-conversation-list");
          const item=list.querySelector("[data-chat-open]");
          for(let i=0;i<30;i++)list.append(item.cloneNode(true));
          const title=sidebar.querySelector(".chat-heading");
          const before=title.getBoundingClientRect().top;
          sidebar.scrollTop=200;
          return {moved:before-title.getBoundingClientRect().top,listScroll:getComputedStyle(list).overflowY};
        });
        assert.ok(scroll.moved>100,"entire picker must scroll including its heading");
        assert.equal(scroll.listScroll,"visible","no nested contact-only scroll");
      }
      if(width<=860 && mode==="thread"){
        const stable=await page.evaluate(async ({cid})=>{
          const {updateThreadMarkup}=await import("/src/chat.js");
          const thread=document.querySelector("[data-chat-thread]");
          const history=thread.querySelector("[data-chat-premium-history]");
          history.scrollTop=20;
          const node=history.querySelector("[data-message-row-id]");
          const top=history.scrollTop;
          updateThreadMarkup(thread,thread.innerHTML,cid);
          return {same:history===thread.querySelector("[data-chat-premium-history]")&&node===history.querySelector("[data-message-row-id]"),delta:Math.abs(top-history.scrollTop)};
        },{cid});
        assert.ok(stable.same,"refresh must preserve history and unchanged messages");
        assert.ok(stable.delta<2,"refresh must preserve reading position");
        await page.evaluate(async()=>{
          const {setupChatPremium}=await import("/src/chat-premium.js");
          setupChatPremium(document.querySelector("#pageContent"),null,"test-user");
          const message=document.querySelector(".chat-message p[data-chat-message-body]");
          message.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,button:0,pointerType:"touch",clientX:80,clientY:140}));
        });
        await page.locator("[data-chat-premium-reaction-palette]").waitFor({state:"visible"});
        await page.evaluate(()=>document.querySelector("#pageContent").dispatchEvent(new PointerEvent("pointerup",{bubbles:true})));

        await page.evaluate(()=>document.querySelector("#pageContent").style.setProperty("--looply-visible-height","400px"));
        const bottom=await page.locator(".chat-message-form").evaluate(el=>el.getBoundingClientRect().bottom);
        assert.ok(Math.abs(bottom-400)<2,"composer must sit at visual viewport bottom");
        const bubble=await page.locator(".chat-message:has(.chat-premium-note-card) .chat-bubble").evaluate(el=>getComputedStyle(el).backgroundColor);
        assert.equal(bubble,"rgba(0, 0, 0, 0)","envelope must have no colored bubble");
        await page.evaluate(()=>document.querySelector("#pageContent").style.removeProperty("--looply-visible-height"));
      }
      await page.screenshot({path:join(OUTPUT,mode+"-"+width+"x"+height+".png"),animations:"disabled"});
    }
    await context.close();
  }
}finally{
  await browser?.close();
  await new Promise(done=>server.close(done));
}
console.log("Premium chat visual regression checks passed.");

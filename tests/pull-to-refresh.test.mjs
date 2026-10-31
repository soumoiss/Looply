import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hasPendingRefreshWork,isPullRefreshBlocked,mountPullToRefresh } from "../src/pull-to-refresh.js";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

const cleanRoot=()=>({isConnected:true,querySelector:()=>null,querySelectorAll:()=>[],contains:()=>true,addEventListener(){},removeEventListener(){}});
function mockControl(overrides={}) {
  return {disabled:false,type:"text",value:"",defaultValue:"",tagName:"INPUT",...overrides};
}
test("unsaved drafts, changed checkboxes, selected upload and saving state stop pull",()=>{
  const root=cleanRoot();
  const input=mockControl({value:"draft",defaultValue:""});
  root.querySelectorAll=()=>[{elements:[input]}];
  assert.equal(hasPendingRefreshWork(root),true);
  input.value="";
  assert.equal(hasPendingRefreshWork(root),false);
  root.querySelectorAll=()=>[{elements:[mockControl({type:"file",files:[{name:"photo.jpg"}]})]}];
  assert.equal(hasPendingRefreshWork(root),true);
  root.querySelectorAll=()=>[{elements:[mockControl({type:"checkbox",checked:true,defaultChecked:false})]}];
  assert.equal(hasPendingRefreshWork(root),true);
  root.querySelector=()=>({});
  assert.equal(hasPendingRefreshWork(root),true);
});
test("implicitly selected first option is not an unsaved form edit",()=>{
  const root=cleanRoot();
  const select=mockControl({
    tagName:"SELECT",type:"select-one",value:"public",defaultValue:undefined,
    options:[{selected:true,defaultSelected:false},{selected:false,defaultSelected:false}]
  });
  root.querySelectorAll=()=>[{elements:[select]}];
  assert.equal(hasPendingRefreshWork(root),false);
  select.options[0].selected=false;select.options[1].selected=true;
  assert.equal(hasPendingRefreshWork(root),true);
});
test("top-of-list permits Chat/Cartas refresh but not scrolled history",()=>{
  const root=cleanRoot(),doc={visibilityState:"visible",scrollingElement:{scrollTop:0},body:{},querySelectorAll:()=>[]};
  const win={scrollY:0,getComputedStyle:()=>({display:"block",visibility:"visible",overflowY:"auto"})};
  const scrollable={parentElement:doc.body,clientHeight:300,scrollHeight:700,scrollTop:0,
    matches:selector=>selector.includes(".chat-sidebar")};
  const target={parentElement:scrollable,closest:()=>null};
  assert.equal(isPullRefreshBlocked({target,root,doc,win}),false);
  scrollable.scrollTop=3;
  assert.equal(isPullRefreshBlocked({target,root,doc,win}),true);
  scrollable.scrollTop=0;
  scrollable.matches=()=>false;
  assert.equal(isPullRefreshBlocked({target,root,doc,win}),true);
});

test("scrolling, interactive components and hidden tab block gesture",()=>{
  const root=cleanRoot(),doc={
    visibilityState:"visible",scrollingElement:{scrollTop:0},
    body:{},querySelectorAll:()=>[]
  };
  const win={scrollY:0,getComputedStyle:()=>({display:"block",visibility:"visible"})};
  const target={parentElement:null,closest:()=>null};
  const params={target,root,doc,win};
  assert.equal(isPullRefreshBlocked(params),false);
  doc.scrollingElement.scrollTop=55;
  assert.equal(isPullRefreshBlocked(params),true);
  doc.scrollingElement.scrollTop=0;
  doc.visibilityState="hidden";
  assert.equal(isPullRefreshBlocked(params),true);
  doc.visibilityState="visible";
  target.closest=sel=>sel.includes("button")?{}:null;
  assert.equal(isPullRefreshBlocked(params),true);
});
function harness(refresh=async()=>true) {
  const listeners=new Map(),windowListeners=new Map();
  const node={hidden:true,classList:{add(){},remove(){},toggle(){}},
    style:{setProperty(){},removeProperty(){}},querySelector:()=>({textContent:""}),
    setAttribute(){},remove(){this.removed=true;}};
  const target={parentElement:null,closest:()=>null};
  const root=cleanRoot();
  const doc={
    visibilityState:"visible",scrollingElement:{scrollTop:0},
    body:{append(){}},createElement:()=>node,querySelectorAll:()=>[],
    addEventListener:(n,cb)=>listeners.set(n,cb),
    removeEventListener:(n,cb)=>{if(listeners.get(n)===cb)listeners.delete(n);}
  };
  const win={scrollY:0,navigator:{onLine:true},matchMedia:()=>({matches:true}),
    getComputedStyle:()=>({display:"block",visibility:"visible"}),
    addEventListener:(n,cb)=>windowListeners.set(n,cb),
    removeEventListener:(n,cb)=>{if(windowListeners.get(n)===cb)windowListeners.delete(n);},
    setTimeout,clearTimeout};
  const touch=(name,x,y)=>{
    let prevented=false;
    listeners.get(name)?.({
      touches:name==="touchend"?[]:[{clientX:x,clientY:y}],
      target,cancelable:true,preventDefault(){prevented=true;}
    });
    return prevented;
  };
  return {root,doc,win,node,listeners,touch,refresh};
}
test("short drag cancels; full drag triggers exactly one async refresh and cleanup",async()=>{
  let count=0;
  const h=harness(async()=>{count++;return true;});
  const stop=mountPullToRefresh({root:h.root,page:"home",doc:h.doc,win:h.win,refresh:async()=>{count++;return true;}});
  h.touch("touchstart",100,100);
  h.touch("touchmove",100,132);
  h.touch("touchend",100,132);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(count,0);
  h.touch("touchstart",100,100);
  assert.equal(h.touch("touchmove",100,260),true);
  h.touch("touchend",100,260);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(count,1,"full gesture should refresh exactly once");
  stop();
  assert.equal(h.node.removed,true);
  assert.equal(h.listeners.size,0);
});
test("idle controller is idempotent per root; conversation never registers gesture",()=>{
  const h=harness();
  const stop=mountPullToRefresh({root:h.root,page:"home",doc:h.doc,win:h.win,refresh:h.refresh});
  const again=mountPullToRefresh({root:h.root,page:"home",doc:h.doc,win:h.win,refresh:h.refresh});
  assert.equal(stop,again);
  stop();
  const x=harness();
  mountPullToRefresh({root:x.root,page:"conversation",doc:x.doc,win:x.win,refresh:x.refresh});
  assert.equal(x.listeners.size,0);
});
test("each principal page exposes a real refresh, while admin fallback is guarded",async()=>{
  const sources=await Promise.all([
    "assets/js/home.js","assets/js/letters.js","assets/js/music.js","assets/js/gallery.js",
    "assets/js/chat.js","assets/js/notifications.js","src/profile-page.js","assets/js/users.js"
  ].map(read));
  for(const [i,source] of sources.entries())
    assert.match(source,/root\.__looplyRefreshData\s*=/,"missing refresh path "+i);
  const runtime=await read("src/page-runtime.js");
  assert.match(runtime,/mountPullToRefresh\(/);
  assert.match(runtime,/stopPullToRefresh\(\)/);
  assert.match(runtime,/window\.location\.reload\(\)/);
  const controller=await read("src/pull-to-refresh.js");
  assert.match(controller,/event\.preventDefault\(\)/);
  assert.match(controller,/page==="conversation"/);
  assert.match(controller,/hasPendingRefreshWork/);
  assert.match(controller,/Solte para atualizar/);
  assert.match(controller,/Não foi possível atualizar\. Verifique sua conexão/);
  const css=await read("assets/css/pages/shared.css");
  assert.match(css,/\.looply-pull-indicator/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/safe-area-inset-top/);
});

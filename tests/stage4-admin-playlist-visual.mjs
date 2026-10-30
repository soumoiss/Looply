// Real Chromium layout validation of the production admin playlist stylesheet.
// The HTML below is a deterministic test fixture only — NOT a fake Looply page
// and not a claim that user playlists/authentication were tested end-to-end.
import {chromium} from "playwright";
import {readFile,mkdir,writeFile} from "node:fs/promises";

const css=await readFile(new URL("../assets/css/pages/music.css",import.meta.url),"utf8");
const cases=[
  {width:320,height:700,label:"320-portrait"},
  {width:360,height:780,label:"360-portrait"},
  {width:375,height:812,label:"375-portrait"},
  {width:390,height:844,label:"390-portrait"},
  {width:412,height:915,label:"412-portrait"},
  {width:428,height:926,label:"428-portrait"},
  {width:768,height:432,label:"768-landscape"},
  {width:1024,height:768,label:"1024-tablet"}
];
await mkdir("smoke-results/stage4-layout",{recursive:true});
const results=[];
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
try {
  for(const {width,height,label} of cases){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.setContent(`<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
      <style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff7f2;font:16px system-ui}main{width:100%;min-width:0;padding:12px;--border:#ebd3c9;--surface:#fff;--text:#271b19;--muted:#74676a;--primary:#bf6c4b}</style></head>
      <body><main>
        <section class="music-admin-playlists">
          <div class="music-admin-playlists-heading"><span>Área administrativa</span><h2>Playlists dos usuários</h2></div>
          <div class="field"><label for="owner-search">Pesquisar usuário</label>
          <input id="owner-search" placeholder="Nome ou @usuário" type="search"></div>
          <div class="field"><label for="owner">Selecionar usuário</label>
          <select id="owner"><option>Usuária com um nome extremamente comprido · @nomedeusuariolongo123456789</option></select></div>
          <div class="music-admin-owner-avatar" data-admin-owner-avatar><span>Usuária com um nome extremamente comprido · @nomedeusuariolongo123456789</span></div>
          <div class="music-admin-playlist-player" data-admin-music-player>
            <button class="music-admin-player-toggle" type="button">Fechar player — Playlist com um título muitíssimo comprido para avaliar quebra</button>
            <iframe title="Prévia sintética do tamanho do player" srcdoc="<p>Fixture de player</p>"></iframe>
          </div>
          <form class="music-admin-comment-form">
            <div class="field"><label for="track">Música da playlist</label>
            <select id="track"><option>Uma música com um título muito longo para a largura do telefone</option></select></div>
            <div class="field"><label for="comment">Comentário privado ADM</label>
            <textarea id="comment">Texto de teste em tamanhos estreitos</textarea></div>
            <button type="button">Enviar comentário privado</button>
            <span role="status">Status do envio e acesso</span>
          </form>
        </section>
      </main></body></html>`);
    await page.addStyleTag({content:css});
    await page.screenshot({path:`smoke-results/stage4-layout/${label}.png`,fullPage:true});
    const result=await page.evaluate(()=>{
      const panel=document.querySelector(".music-admin-playlists");
      const items=[...panel.querySelectorAll("input,select,textarea,button,iframe")];
      const overflow=document.documentElement.scrollWidth>window.innerWidth+1;
      const panelWidth=panel.getBoundingClientRect().width;
      const clipped=items.filter(el=>{
        const {left,right}=el.getBoundingClientRect();
        return left < -1 || right > window.innerWidth+1;
      }).map(el=>el.tagName+"."+(el.className||""));
      const iframe=panel.querySelector("iframe").getBoundingClientRect();
      return {overflow,clipped,panelWidth,playerWidth:iframe.width,playerHeight:iframe.height};
    });
    await page.close();
    results.push({width,height,label,...result});
    if(result.overflow||result.clipped.length)
      throw Error("Admin layout overflow in "+label+": "+JSON.stringify(result));
    if(result.playerHeight>height*.75)
      throw Error("Admin playlist player still occupies too much of "+label);
  }
} finally {await browser.close();}
await writeFile("smoke-results/stage4-layout/metrics.json",JSON.stringify(results,null,2));
console.log(JSON.stringify(results));

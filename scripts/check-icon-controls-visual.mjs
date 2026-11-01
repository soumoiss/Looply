import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { storyStudioMarkup } from "../src/story-studio.js";
import { primaryNavigationMarkup } from "../src/primary-navigation.js";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const OUT = join(ROOT, "smoke-results/icons-003");
const paths = new Map([
  ["/styles.css", "styles.css"],
  ["/assets/css/app.css", "assets/css/app.css"],
  ["/assets/css/pages/shared.css", "assets/css/pages/shared.css"],
  ["/assets/css/pages/story-studio.css", "assets/css/pages/story-studio.css"],
  ["/assets/css/theme-complete.css", "assets/css/theme-complete.css"]
]);
const fixture = (screen, theme) => {
  const studio = screen !== "nav";
  const markup = studio
    ? storyStudioMarkup("").replace('<dialog class="story-studio"', '<dialog open class="story-studio"')
    : "";
  return '<!doctype html><html lang="pt-BR" data-theme="' + theme +
    '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/assets/css/app.css">' +
    '<link rel="stylesheet" href="/assets/css/pages/shared.css"><link rel="stylesheet" href="/assets/css/pages/story-studio.css">' +
    '<link rel="stylesheet" href="/assets/css/theme-complete.css"></head>' +
    '<body class="looply-page page-home"><div class="container-page">' +
    '<header class="page-header" data-site-header>' + primaryNavigationMarkup("home", 7) + '</header>' +
    '<main><h1>Looply</h1><p>Captura de teste sem conta ou dados privados.</p></main></div>' +
    markup + '</body></html>';
};
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/") {
      const screen = ["nav","camera","editor"].includes(url.searchParams.get("screen"))
        ? url.searchParams.get("screen") : "nav";
      const theme = url.searchParams.get("theme") === "noite" ? "noite" : "lilas";
      res.writeHead(200, {"content-type":"text/html; charset=utf-8","cache-control":"no-store"});
      res.end(fixture(screen,theme));
      return;
    }
    const path = paths.get(url.pathname);
    if (!path) { res.writeHead(404);res.end();return; }
    const data = await readFile(join(ROOT,path));
    res.writeHead(200,{"content-type":extname(path)===".css"?"text/css":"text/plain"});
    res.end(data);
  } catch(e) { res.writeHead(500);res.end(String(e)); }
});

await mkdir(OUT,{recursive:true});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const origin = "http://127.0.0.1:" + server.address().port;
let browser;
try {
  browser = await chromium.launch({headless:true,args:["--no-sandbox"]});
  for (const width of [320,360,390,428,768,1024]) {
    for (const screen of ["nav","camera","editor"]) {
      const theme = screen==="nav" && width>=390 ? "noite" : "lilas";
      const context = await browser.newContext({viewport:{width,height:820},deviceScaleFactor:1,
        hasTouch:width<=428,reducedMotion:"reduce",colorScheme:theme==="noite"?"dark":"light"});
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror",e=>errors.push(e.message));
      await page.goto(origin+"/?screen="+screen+"&theme="+theme,{waitUntil:"load"});
      if(screen!=="nav") {
        await page.waitForFunction(() => {
          const button=document.querySelector(".studio-icon");
          return button && getComputedStyle(button).width === "44px";
        },null,{timeout:30000});
        await page.evaluate(mode=>{
          const stage=document.querySelector("[data-studio-stage]");
          stage.dataset.mode=mode==="editor"?"edit":"camera";
          document.querySelectorAll(".studio-camera-only").forEach(el=>{el.hidden=mode==="editor"});
          document.querySelectorAll(".studio-edit-only").forEach(el=>{el.hidden=mode!=="editor"});
        },screen);
      }
      const actual=await page.evaluate(screen=>{
        const nav=document.querySelector("nav.page-navigation");
        const dialog=document.querySelector("dialog.story-studio");
        const controls=screen==="camera"?["studio-close","studio-settings","studio-grid-toggle","studio-flip"]:
          screen==="editor"?["studio-back","studio-add-text","studio-music-open","studio-send"]:[];
        const dims=controls.map(hook=>{
          const el=document.querySelector("[data-"+hook+"]");
          const rect=el?.getBoundingClientRect();
          return {hook,width:rect?.width||0,height:rect?.height||0,
            label:el?.getAttribute("aria-label"),svg:!!el?.querySelector("svg.looply-icon")};
        });
        return {vw:innerWidth,scroll:document.documentElement.scrollWidth,
          navIcons:nav?.querySelectorAll("a .looply-icon").length,navLinks:nav?.querySelectorAll("a").length,
          dialogOpen:!!dialog?.open,svgCount:dialog?.querySelectorAll("svg.looply-icon").length||0,dims};
      },screen);
      console.log("ICON_003_LAYOUT",JSON.stringify({screen,theme,width,actual}));
      assert.equal(actual.vw,width,"viewport mismatch "+width);
      assert.equal(actual.navLinks,6,"navigation destinations");
      assert.equal(actual.navIcons,6,"navigation icons");
      assert.ok(actual.scroll <= width + 2,"horizontal overflow "+screen+" "+width+": "+actual.scroll);
      if(screen!=="nav") {
        assert.ok(actual.dialogOpen && actual.svgCount>=12,"studio icons missing");
        for(const dim of actual.dims) {
          assert.ok(dim.width>=43 && dim.height>=43,"touch control too small "+dim.hook+" "+width);
          if(dim.hook!=="studio-add-text")assert.ok(dim.label && dim.svg,"icon control lacks label/SVG "+dim.hook);
        }
      }
      assert.deepEqual(errors,[],"browser exceptions");
      await page.screenshot({path:join(OUT,screen+"-"+theme+"-"+width+".png"),animations:"disabled"});
      console.log("ICON_003",JSON.stringify({screen,theme,width,actual}));
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await new Promise(ok=>server.close(ok));
}

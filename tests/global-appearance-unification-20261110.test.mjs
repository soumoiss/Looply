import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createContext,runInContext} from "node:vm";

const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const THEME_IDS=["lilas","noite","oceano","rosa","floresta","aurora","coral",
  "menta","sunset","grafite","hacker","bts","blackpink","bob_esponja",
  "jovens_titas","teen_wolf","cyberpunk","kawaii","vaporwave"];
const FONTS=["ibm_plex_mono","orbitron","rajdhani","chakra_petch",
  "bebas_neue","anton","oswald","fredoka","baloo_2","bangers",
  "permanent_marker","righteous","outfit","urbanist","cinzel",
  "special_elite","vt323","pixelfy"];

function makeBrowser(saved={}) {
  const store=new Map(Object.entries(saved));
  const styles=new Map();
  const listeners=new Map();
  const root={dataset:{},style:{
    setProperty:(key,value)=>styles.set(key,value),
    getPropertyValue:key=>styles.get(key)||""
  }};
  const metas=[{setAttribute:()=>{}}],head={append:()=>{}};
  const document={
    documentElement:root,head,
    createElement:()=>({dataset:{},rel:"",href:""}),
    querySelector:query=>query.includes("theme-color")?metas[0]:null,
    addEventListener:(name,callback)=>{listeners.set("doc:"+name,callback)}
  };
  const window={
    matchMedia:()=>({matches:false,addEventListener:()=>{}}),
    addEventListener:(name,callback)=>{listeners.set(name,callback)}
  };
  const localStorage={
    getItem:key=>store.get(key)??null,
    setItem:(key,value)=>store.set(key,value)
  };
  const context=createContext({window,document,localStorage,matchMedia:window.matchMedia});
  runInContext(read("src/theme-bootstrap.js"),context);
  return {window,document,store,root,styles,listeners};
}
test("all theme and font options exist in one catalog, including original options",()=>{
  const {window}=makeBrowser();
  const {themes,fonts,sizes,recommendations,names}=window.LooplyThemeCatalog;
  for(const id of THEME_IDS)assert.ok(themes[id],id);
  for(const id of FONTS)assert.ok(fonts[id],id);
  assert.equal(Object.keys(themes).length,19);
  assert.equal(Object.keys(fonts).length,34);
  for(const id of ["hacker","bts","blackpink","bob_esponja","jovens_titas","teen_wolf"]){
    assert.ok(recommendations[id],id);
    assert.ok(fonts[recommendations[id]],id);
    assert.ok(names[id],id);
  }
  assert.equal(sizes.large,"17.92px");
});
test("changing each theme and family updates every shared CSS token without page reload",()=>{
  const {window,root,styles,store}=makeBrowser();
  const catalog=window.LooplyThemeCatalog;
  for(const id of THEME_IDS){
    const result=window.looplyApplyAppearance({theme:id},true);
    assert.equal(result.theme,id);
    assert.equal(root.dataset.theme,id);
    assert.equal(styles.get("--primary"),catalog.themes[id].primary);
    assert.equal(styles.get("--bg"),catalog.themes[id].bg);
    assert.equal(styles.get("--surface-strong"),catalog.themes[id].surfaceStrong);
    assert.equal(styles.get("--accent"),catalog.themes[id].primary);
    assert.equal(styles.get("--ink"),catalog.themes[id].text);
    assert.equal(styles.get("--on-primary"),catalog.themes[id].onPrimary||"#ffffff");
    assert.equal(store.get("looply_theme"),id);
  }
  for(const id of FONTS){
    const state=window.looplyApplyAppearance({font_family:id},true);
    assert.equal(state.font_family,id);
    assert.equal(root.dataset.fontFamily,id);
    assert.equal(styles.get("--looply-font-family"),catalog.fonts[id]);
    assert.equal(styles.get("--looply-heading-font"),catalog.fonts[id]);
    assert.equal(styles.get("--ui"),catalog.fonts[id]);
    assert.equal(store.get("looply_font_family"),id);
  }
  for(const size of ["small","normal","large","very_large"]){
    window.looplyApplyAppearance({font_size:size},true);
    assert.equal(root.dataset.fontSize,size);
    assert.equal(styles.get("--looply-root-font-size"),catalog.sizes[size]);
    assert.equal(store.get("looply_font_size"),size);
  }
});
test("automatic theme mode and remote storage changes are preserved",()=>{
  const {window,root,store,listeners}=makeBrowser({"looply_theme":"system"});
  assert.equal(root.dataset.savedTheme,"system");
  assert.equal(root.dataset.theme,"lilas");
  window.matchMedia=()=>({matches:true,addEventListener:()=>{}});
  window.looplyApplyAppearance();
  assert.equal(root.dataset.savedTheme,"system");
  assert.equal(root.dataset.theme,"noite");
  store.set("looply_theme","hacker");
  store.set("looply_font_family","orbitron");
  listeners.get("storage")({key:"looply_theme"});
  assert.equal(root.dataset.theme,"hacker");
  assert.equal(root.dataset.fontFamily,"orbitron");
});
test("all exported routes load one early bootstrap and final typography CSS",()=>{
  const pages=[
    "index.html","login.html","home.html","reels.html","why-now.html",
    "chat.html","conversa.html","cartas.html","musicas.html","galeria.html",
    "perfil.html","usuarios.html","notificacoes.html","configuracoes.html",
    "admin.html","admin-importar-figurinhas.html","share.html",
    "car/index.html","mu/index.html","admin/cartas/index.html","admin/musicas/index.html"
  ];
  for(const name of pages){
    const file="dist/"+name;
    assert.ok(existsSync(new URL("../"+file,import.meta.url)),file);
    const html=read(file);
    assert.equal((html.match(/src\/theme-bootstrap\.js\?build=/g)||[]).length,1,file);
    assert.equal((html.match(/assets\/css\/global-theme-typography\.css\?build=/g)||[]).length,1,file);
    assert.ok(html.indexOf("theme-bootstrap.js")<html.indexOf("</head>"),file);
  }
});
test("brand stays Cabin Sketch 700; media editor and stickers remain isolated",()=>{
  const css=read("assets/css/global-theme-typography.css");
  assert.match(css,/Cabin Sketch/);
  assert.match(css,/font-weight:700!important/);
  assert.match(css,/--looply-font-family/);
  assert.ok(css.includes(".edit-overlay .overlay-item"));
  assert.ok(css.includes(".view-overlay .overlay-item"));
  assert.match(css,/prefers-reduced-motion/);
  const chat=read("chat.html");
  assert.ok(chat.includes('location.href="configuracoes.html"'));
  assert.ok(!chat.includes('localStorage.setItem(THEME_KEY, document.documentElement.dataset.theme'));
  const embedded=read("src/why-now-embedded.js");
  const bridge=read("src/why-now-integration.js");
  assert.ok(embedded.includes("--looply-font-family"));
  assert.ok(bridge.includes('window.addEventListener("looply:appearance-changed"'));
});
test("new profile values remain validated by Neon and UI is able to save them",()=>{
  const migration=read("migration/20261110_global_theme_font_presets.sql");
  const settings=read("assets/js/settings.js");
  for(const id of THEME_IDS)assert.ok(migration.includes("'"+id+"'"),id);
  for(const id of FONTS)assert.ok(migration.includes("'"+id+"'"),id);
  assert.ok(settings.includes('client.from("profiles").update(updates)'));
  assert.ok(settings.includes('formTheme.addEventListener("change"'));
  assert.ok(settings.includes("recommendedThemeFont"));
  assert.ok(settings.includes("preview(read())"));
});

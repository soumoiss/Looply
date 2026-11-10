/* One source of truth for Looply themes, fonts and first-paint tokens. */
(function installLooplyTheme(){
  if(window.LooplyThemeCatalog && window.looplyApplyAppearance)return;
const THEMES = Object.freeze({
  lilas: { primary: "#7010b0", primaryDark: "#5f1098", primaryDeep: "#503090", deep: "#302050", bg: "#f5f0fa", bg2: "#f0e0f0", lilac: "#f0e0f0", text: "#29252f", muted: "#817b89", line: "rgba(102,82,126,.12)", surface: "rgba(255,255,255,.94)", surfaceStrong: "#ffffff", surfaceSoft: "#faf7fc", paper: "#f4ebdd", paperText: "#342f2a" },
  noite: { primary: "#b84dff", primaryDark: "#8f2ed0", primaryDeep: "#6820a0", deep: "#170b25", bg: "#100a18", bg2: "#21102e", lilac: "#321747", text: "#f5eafa", muted: "#c0a9ce", line: "rgba(216,160,255,.18)", surface: "rgba(30,19,41,.97)", surfaceStrong: "#21142b", surfaceSoft: "#1a1024", paper: "#2a2130", paperText: "#f7eefa" },
  oceano: { primary: "#087fbd", primaryDark: "#066b9e", primaryDeep: "#07567e", deep: "#12334a", bg: "#edf8fc", bg2: "#d9eef7", lilac: "#d5edf8", text: "#20323d", muted: "#607985", line: "rgba(8,127,189,.16)", surface: "rgba(255,255,255,.95)", surfaceStrong: "#ffffff", surfaceSoft: "#f4fbfd", paper: "#e9f5fa", paperText: "#20323d" },
  rosa: { primary: "#c04483", primaryDark: "#a22f6b", primaryDeep: "#79244f", deep: "#4c1e38", bg: "#fff2f7", bg2: "#fbe1ec", lilac: "#f8d7e7", text: "#392632", muted: "#8e7181", line: "rgba(192,68,131,.15)", surface: "rgba(255,255,255,.95)", surfaceStrong: "#ffffff", surfaceSoft: "#fff7fa", paper: "#fff0f6", paperText: "#392632" },
  floresta: { primary: "#187b58", primaryDark: "#126546", primaryDeep: "#0f5139", deep: "#173c30", bg: "#f0f8f2", bg2: "#dcefe1", lilac: "#d8eddf", text: "#26372d", muted: "#6b8373", line: "rgba(24,123,88,.16)", surface: "rgba(255,255,255,.95)", surfaceStrong: "#ffffff", surfaceSoft: "#f6fbf7", paper: "#edf7ef", paperText: "#26372d" },
  aurora: { primary: "#6752d8", primaryDark: "#5140b5", primaryDeep: "#3f328f", deep: "#242044", bg: "#f4f2ff", bg2: "#e6e1ff", lilac: "#e5e0ff", text: "#292344", muted: "#77719a", line: "rgba(103,82,216,.16)", surface: "rgba(255,255,255,.96)", surfaceStrong: "#ffffff", surfaceSoft: "#faf9ff", paper: "#f0edff", paperText: "#292344" },
  coral: { primary: "#d05b65", primaryDark: "#b24652", primaryDeep: "#8a3340", deep: "#4c1f2a", bg: "#fff5f2", bg2: "#ffe4df", lilac: "#ffe0dc", text: "#3b292b", muted: "#8e7778", line: "rgba(208,91,101,.16)", surface: "rgba(255,255,255,.96)", surfaceStrong: "#ffffff", surfaceSoft: "#fffafa", paper: "#fff0ea", paperText: "#3b292b" },
  menta: { primary: "#14806e", primaryDark: "#106856", primaryDeep: "#0c5143", deep: "#173d3a", bg: "#effaf7", bg2: "#d9f0ea", lilac: "#d7eee8", text: "#203934", muted: "#67827c", line: "rgba(20,128,110,.16)", surface: "rgba(255,255,255,.96)", surfaceStrong: "#ffffff", surfaceSoft: "#f7fcfb", paper: "#e9f7f3", paperText: "#203934" },
  sunset: { primary: "#d76a32", primaryDark: "#b94f24", primaryDeep: "#8e381e", deep: "#4a281f", bg: "#fff7ed", bg2: "#ffe7cc", lilac: "#ffe4c5", text: "#3d2b25", muted: "#927a6d", line: "rgba(215,106,50,.17)", surface: "rgba(255,255,255,.96)", surfaceStrong: "#ffffff", surfaceSoft: "#fffaf5", paper: "#fff0d9", paperText: "#3d2b25" },
  grafite: { primary: "#c4a7ff", primaryDark: "#a984e8", primaryDeep: "#815fbd", deep: "#171724", bg: "#11111b", bg2: "#211d32", lilac: "#322b4d", text: "#f4efff", muted: "#bdb3d2", line: "rgba(196,167,255,.2)", surface: "rgba(31,28,47,.98)", surfaceStrong: "#29243c", surfaceSoft: "#1c192b", paper: "#302a3c", paperText: "#f4efff" },

  hacker: { primary:"#43E88E", primaryDark:"#23B66B", primaryDeep:"#188753", deep:"#05160F", bg:"#07130D", bg2:"#0C2419", lilac:"#103E27", text:"#E5FFED", muted:"#A7C8B1", line:"rgba(80,233,139,.25)", surface:"rgba(13,32,23,.97)", surfaceStrong:"#102519", surfaceSoft:"#142F20", paper:"#193024", paperText:"#E5FFED", onPrimary:"#062014" },
  bts: { primary:"#AC94FF", primaryDark:"#8E6DDE", primaryDeep:"#6E52B0", deep:"#160D2E", bg:"#110B24", bg2:"#22153D", lilac:"#3D2766", text:"#F4EDFF", muted:"#C0B0DC", line:"rgba(186,159,255,.25)", surface:"rgba(34,21,59,.96)", surfaceStrong:"#261A40", surfaceSoft:"#30204C", paper:"#2D2046", paperText:"#F4EDFF", onPrimary:"#201034" },
  blackpink: { primary:"#F47EB7", primaryDark:"#D75B98", primaryDeep:"#AC3679", deep:"#1B0E1A", bg:"#120C13", bg2:"#271523", lilac:"#492239", text:"#FFF1F7", muted:"#D7ADBF", line:"rgba(244,126,183,.24)", surface:"rgba(39,21,35,.97)", surfaceStrong:"#301B2B", surfaceSoft:"#3A2032", paper:"#3B2632", paperText:"#FFF1F7", onPrimary:"#260D1D" },
  bob_esponja: { primary:"#956400", primaryDark:"#795100", primaryDeep:"#624300", deep:"#24516B", bg:"#FFFCED", bg2:"#D5F3FA", lilac:"#FFF0A6", text:"#23384C", muted:"#576E77", line:"rgba(37,110,148,.20)", surface:"rgba(255,255,255,.95)", surfaceStrong:"#FFFFFF", surfaceSoft:"#F2FCFC", paper:"#FFF5B8", paperText:"#23384C", onPrimary:"#FFFFFF" },
  jovens_titas: { primary:"#F06468", primaryDark:"#D33D52", primaryDeep:"#AA2545", deep:"#10284B", bg:"#0F1C36", bg2:"#1A3353", lilac:"#283D62", text:"#F5F8FF", muted:"#B8C7DE", line:"rgba(90,179,234,.25)", surface:"rgba(25,47,79,.97)", surfaceStrong:"#1B3051", surfaceSoft:"#223B5B", paper:"#203759", paperText:"#F5F8FF", onPrimary:"#30101C" },
  teen_wolf: { primary:"#E9B479", primaryDark:"#BB844D", primaryDeep:"#8D5A32", deep:"#171A22", bg:"#14161C", bg2:"#25292F", lilac:"#3C3229", text:"#F5EDE3", muted:"#C3AD96", line:"rgba(236,178,110,.25)", surface:"rgba(36,37,42,.97)", surfaceStrong:"#2A292C", surfaceSoft:"#353136", paper:"#342D2A", paperText:"#F5EDE3", onPrimary:"#261912" },
  cyberpunk: { primary:"#40D8F2", primaryDark:"#21A7C7", primaryDeep:"#136B9B", deep:"#141126", bg:"#100F20", bg2:"#211A36", lilac:"#3A1951", text:"#ECF9FF", muted:"#B2C1D9", line:"rgba(67,217,239,.27)", surface:"rgba(30,25,49,.97)", surfaceStrong:"#25203D", surfaceSoft:"#302747", paper:"#2F2849", paperText:"#ECF9FF", onPrimary:"#071D28" },
  kawaii: { primary:"#A1447E", primaryDark:"#893569", primaryDeep:"#6F2A61", deep:"#5F3154", bg:"#FFF6FC", bg2:"#FDE4F4", lilac:"#F8D0E9", text:"#452C3F", muted:"#855E76", line:"rgba(168,68,126,.18)", surface:"rgba(255,255,255,.95)", surfaceStrong:"#FFFFFF", surfaceSoft:"#FFF3FB", paper:"#FCE0F3", paperText:"#452C3F", onPrimary:"#FFFFFF" },
  vaporwave: { primary:"#7D4CCE", primaryDark:"#6035AE", primaryDeep:"#473094", deep:"#3D2357", bg:"#F5F0FF", bg2:"#E0F5F9", lilac:"#E3D0FF", text:"#35254C", muted:"#736386", line:"rgba(125,76,206,.20)", surface:"rgba(255,255,255,.97)", surfaceStrong:"#FFFFFF", surfaceSoft:"#F9F5FF", paper:"#ECE0F9", paperText:"#35254C", onPrimary:"#FFFFFF" }
});
const FONT_FAMILIES = Object.freeze({
  system: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  sans: 'Arial, Helvetica, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  rounded: 'ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif',
  manrope: 'Manrope, Inter, ui-sans-serif, sans-serif',
  dm_sans: '"DM Sans", Inter, ui-sans-serif, sans-serif',
  jakarta: '"Plus Jakarta Sans", Inter, ui-sans-serif, sans-serif',
  space_grotesk: '"Space Grotesk", Inter, ui-sans-serif, sans-serif',
  nunito: 'Nunito, ui-rounded, sans-serif',
  quicksand: 'Quicksand, ui-rounded, sans-serif',
  montserrat: 'Montserrat, Inter, sans-serif',
  cormorant: '"Cormorant Garamond", Georgia, serif',
  playfair: '"Playfair Display", Georgia, serif',
  fraunces: 'Fraunces, Georgia, serif',
  caveat: 'Caveat, "Segoe Print", cursive',
  syne: 'Syne, Inter, sans-serif',

  ibm_plex_mono: '"IBM Plex Mono", ui-monospace, Consolas, monospace',
  orbitron: 'Orbitron, "Space Grotesk", sans-serif',
  rajdhani: 'Rajdhani, Inter, sans-serif',
  chakra_petch: '"Chakra Petch", ui-sans-serif, sans-serif',
  bebas_neue: '"Bebas Neue", Impact, sans-serif',
  anton: 'Anton, Impact, sans-serif',
  oswald: 'Oswald, Inter, sans-serif',
  fredoka: 'Fredoka, ui-rounded, sans-serif',
  baloo_2: '"Baloo 2", ui-rounded, sans-serif',
  bangers: 'Bangers, Impact, sans-serif',
  permanent_marker: '"Permanent Marker", cursive',
  righteous: 'Righteous, ui-rounded, sans-serif',
  outfit: 'Outfit, Inter, sans-serif',
  urbanist: 'Urbanist, Inter, sans-serif',
  cinzel: 'Cinzel, Georgia, serif',
  special_elite: '"Special Elite", ui-monospace, serif',
  vt323: 'VT323, ui-monospace, monospace',
  pixelfy: '"Pixelify Sans", monospace'
});
const FONT_SIZES = Object.freeze({ small: "14.4px", normal: "16px", large: "17.92px", very_large: "20px" });
  const RECOMMENDED={
  "hacker": "ibm_plex_mono",
  "bts": "outfit",
  "blackpink": "urbanist",
  "bob_esponja": "fredoka",
  "jovens_titas": "rajdhani",
  "teen_wolf": "oswald",
  "cyberpunk": "orbitron",
  "kawaii": "baloo_2",
  "vaporwave": "righteous"
};
  const THEME_NAMES={
  "lilas": "Claro",
  "noite": "Escuro",
  "system": "Automático",
  "oceano": "Oceano",
  "rosa": "Rosa",
  "floresta": "Floresta",
  "aurora": "Aurora",
  "coral": "Coral",
  "menta": "Menta",
  "sunset": "Pôr do sol",
  "grafite": "Grafite",
  "hacker": "Hacker · Terminal verde",
  "bts": "BTS · Violeta",
  "blackpink": "BLACKPINK · Rosé noir",
  "bob_esponja": "Bob Esponja · Fundo do mar",
  "jovens_titas": "Jovens Titãs · Energia",
  "teen_wolf": "Teen Wolf · Lua e âmbar",
  "cyberpunk": "Cyberpunk · Néon",
  "kawaii": "Kawaii · Pastel",
  "vaporwave": "Vaporwave · Retrô"
};
  const FONT_NAMES={
  "system": "Sistema",
  "sans": "Arial",
  "serif": "Georgia",
  "rounded": "Arredondada do sistema",
  "manrope": "Manrope",
  "dm_sans": "DM Sans",
  "jakarta": "Plus Jakarta Sans",
  "space_grotesk": "Space Grotesk",
  "nunito": "Nunito",
  "quicksand": "Quicksand",
  "montserrat": "Montserrat",
  "cormorant": "Cormorant Garamond",
  "playfair": "Playfair Display",
  "fraunces": "Fraunces",
  "caveat": "Caveat",
  "syne": "Syne",
  "ibm_plex_mono": "IBM Plex Mono · hacker",
  "orbitron": "Orbitron · futurista",
  "rajdhani": "Rajdhani · ação",
  "chakra_petch": "Chakra Petch · tecnologia",
  "bebas_neue": "Bebas Neue · pop",
  "anton": "Anton · pôster",
  "oswald": "Oswald · dramática",
  "fredoka": "Fredoka · cartoon",
  "baloo_2": "Baloo 2 · divertida",
  "bangers": "Bangers · quadrinhos",
  "permanent_marker": "Permanent Marker · rabiscada",
  "righteous": "Righteous · retrô",
  "outfit": "Outfit · pop",
  "urbanist": "Urbanist · urbano",
  "cinzel": "Cinzel · épica",
  "special_elite": "Special Elite · máquina",
  "vt323": "VT323 · terminal",
  "pixelfy": "Pixelify Sans · pixels"
};
  const GOOGLE_FONTS={
  "manrope": "Manrope:wght@400;500;600;700;800",
  "dm_sans": "DM+Sans:wght@400;500;600;700;800",
  "jakarta": "Plus+Jakarta+Sans:wght@400;500;600;700;800",
  "space_grotesk": "Space+Grotesk:wght@400;500;600;700",
  "nunito": "Nunito:wght@400;500;600;700;800",
  "quicksand": "Quicksand:wght@400;500;600;700",
  "montserrat": "Montserrat:wght@400;500;600;700;800",
  "cormorant": "Cormorant+Garamond:wght@400;500;600;700",
  "playfair": "Playfair+Display:wght@400;500;600;700;800",
  "fraunces": "Fraunces:wght@400;500;600;700;800",
  "caveat": "Caveat:wght@400;500;600;700",
  "syne": "Syne:wght@400;500;600;700;800",
  "ibm_plex_mono": "IBM+Plex+Mono:wght@400;500;600;700",
  "orbitron": "Orbitron:wght@400;500;600;700;800",
  "rajdhani": "Rajdhani:wght@400;500;600;700",
  "chakra_petch": "Chakra+Petch:wght@400;500;600;700",
  "bebas_neue": "Bebas+Neue",
  "anton": "Anton",
  "oswald": "Oswald:wght@400;500;600;700",
  "fredoka": "Fredoka:wght@400;500;600;700",
  "baloo_2": "Baloo+2:wght@400;500;600;700",
  "bangers": "Bangers",
  "permanent_marker": "Permanent+Marker",
  "righteous": "Righteous",
  "outfit": "Outfit:wght@400;500;600;700;800",
  "urbanist": "Urbanist:wght@400;500;600;700;800",
  "cinzel": "Cinzel:wght@400;500;600;700",
  "special_elite": "Special+Elite",
  "vt323": "VT323",
  "pixelfy": "Pixelify+Sans:wght@400;500;600;700"
};

  const catalog=Object.freeze({
    themes:THEMES,fonts:FONT_FAMILIES,sizes:FONT_SIZES,
    recommendations:Object.freeze(RECOMMENDED),names:Object.freeze(THEME_NAMES),
    fontNames:Object.freeze(FONT_NAMES),googleFonts:Object.freeze(GOOGLE_FONTS)
  });
  window.LooplyThemeCatalog=catalog;
  const themeKey="looply_theme",fontKey="looply_font_family",sizeKey="looply_font_size";
  const own=(obj,id)=>Object.prototype.hasOwnProperty.call(obj,id);
  const get=(key,fallback)=>{try{return localStorage.getItem(key)||fallback;}catch{return fallback;}};
  const set=(key,value)=>{try{localStorage.setItem(key,value)}catch{}};
  const choose=(obj,value,fallback)=>own(obj,value)?value:fallback;
  const primaryDarkInk=color=>color && /^#[0-9a-f]{6}$/i.test(color)?color:"#fff";
  const kebab=key=>key.replace(/[A-Z]/g,ch=>"-"+ch.toLowerCase());
  function loadFont(family){
    const familyQuery=GOOGLE_FONTS[family];
    if(!familyQuery)return;
    const url="https://fonts.googleapis.com/css2?family="+familyQuery+"&display=swap";
    let link=document.querySelector('link[data-looply-font-loader]');
    if(link?.href===url)return;
    if(!link){link=document.createElement("link");link.rel="stylesheet";link.dataset.looplyFontLoader="";document.head?.append(link);}
    link.href=url;
  }
  function apply(input={},persist=false){
    const themeValue=input.theme||get(themeKey,"lilas");
    const savedTheme=themeValue==="system"?"system":choose(THEMES,themeValue,"lilas");
    const font=choose(FONT_FAMILIES,input.font_family||get(fontKey,"system"),"system");
    const size=choose(FONT_SIZES,input.font_size||get(sizeKey,"normal"),"normal");
    const resolved=savedTheme==="system"?
      (window.matchMedia?.("(prefers-color-scheme: dark)").matches?"noite":"lilas"):savedTheme;
    const values=THEMES[resolved]||THEMES.lilas;
    const root=document.documentElement;
    root.dataset.savedTheme=savedTheme;
    root.dataset.theme=resolved;
    root.dataset.fontFamily=font;
    root.dataset.fontSize=size;
    for(const [key,value] of Object.entries(values)){
      root.style.setProperty("--"+key,value);
      root.style.setProperty("--"+kebab(key),value);
    }
    const family=FONT_FAMILIES[font];
    root.style.setProperty("--looply-font-family",family);
    root.style.setProperty("--looply-heading-font",family);
    root.style.setProperty("--looply-root-font-size",FONT_SIZES[size]);
    root.style.setProperty("--looply-text-scale",String(parseFloat(FONT_SIZES[size])/16));
    root.style.setProperty("--ui",family);
    root.style.setProperty("--serif",family);
    const aliases={
      "--accent":values.primary, "--accent-soft":values.lilac, "--surface-muted":values.surfaceSoft,
      "--border":values.line, "--gallery-action":values.primary,
      "--gallery-control-border":values.line,"--gallery-control-bg-hover":values.bg2,
      "--strong":values.surfaceStrong,"--soft":values.surfaceSoft,
      "--ink":values.text,"--violet":values.primary,"--paper":values.paper,
      "--on-primary":values.onPrimary||"#ffffff",
      "--theirs":values.surfaceStrong,
      "--looply-ds-brand":values.primary
    };
    for(const [key,value] of Object.entries(aliases))root.style.setProperty(key,value);
    loadFont(font);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content",values.bg);
    if(persist){set(themeKey,savedTheme);set(fontKey,font);set(sizeKey,size);}
    return {theme:savedTheme,resolvedTheme:resolved,font_family:font,font_size:size};
  }
  window.looplyApplyAppearance=apply;
  apply();
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change",()=>{
    if(get(themeKey,"lilas")==="system")apply();
  });
  window.addEventListener("storage",event=>{
    if(!event.key||[themeKey,fontKey,sizeKey].includes(event.key))apply();
  });
  document.addEventListener("visibilitychange",()=>{
    if(!document.hidden)apply();
  });
  document.addEventListener("DOMContentLoaded",()=>{
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content",
      THEMES[document.documentElement.dataset.theme]?.bg||THEMES.lilas.bg);
  },{once:true});
})();

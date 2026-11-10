/* Global appearance API. The synchronous bootstrap is the single token catalog
   for app pages, login, standalone Chat, media iframe and first paint. */
import "./theme-bootstrap.js";

const CATALOG = window.LooplyThemeCatalog;
if (!CATALOG || typeof window.looplyApplyAppearance !== "function")
  throw Error("Looply appearance bootstrap unavailable");
const THEMES = CATALOG.themes;
const FONT_FAMILIES = CATALOG.fonts;
const FONT_SIZES = CATALOG.sizes;
const THEME_KEY = "looply_theme";
const isTheme = name => Object.prototype.hasOwnProperty.call(THEMES,name);
const isFontFamily = name => Object.prototype.hasOwnProperty.call(FONT_FAMILIES,name);
const stored = (key,fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };

export const availableThemes = Object.freeze([
  {id:"lilas",label:CATALOG.names.lilas,font:"system"},
  ...Object.entries(CATALOG.names)
    .filter(([id]) => id !== "lilas")
    .map(([id,label])=>Object.freeze({id,label,font:CATALOG.recommendations[id]||"system"}))
]);
export const availableFonts = Object.freeze(Object.keys(FONT_FAMILIES)
  .map(id=>Object.freeze({id,label:CATALOG.fontNames[id]||id,family:FONT_FAMILIES[id]})));
export const recommendedThemeFont = id => CATALOG.recommendations[id] || null;
export const getThemePalette = id => THEMES[id] || (id==="system"?THEMES.noite:THEMES.lilas);

export function getSavedTheme() {
  try { const saved = localStorage.getItem(THEME_KEY);
    return isTheme(saved) || saved === "system" ? saved : "lilas";
  } catch { return "lilas"; }
}

function notify(state){
  window.dispatchEvent(new CustomEvent("looply:theme-changed",{
    detail:{theme:state.theme,resolvedTheme:state.resolvedTheme}
  }));
  window.dispatchEvent(new CustomEvent("looply:appearance-changed",{
    detail:{...state}
  }));
}
export function applyTheme(name) {
  const selected=isTheme(name)||name==="system"?name:"lilas";
  const state=window.looplyApplyAppearance({theme:selected},true);
  notify(state);
  return state.theme;
}
export function applyProfilePreferences(profile={}) {
  const family=isFontFamily(profile.font_family)?profile.font_family:
    stored("looply_font_family","system");
  const font_size=Object.prototype.hasOwnProperty.call(FONT_SIZES,profile.font_size)?
    profile.font_size:stored("looply_font_size","normal");
  const theme=isTheme(profile.theme)||profile.theme==="system"?
    profile.theme:getSavedTheme();
  const state=window.looplyApplyAppearance({theme,font_family:family,font_size},true);
  notify(state);
  return state.theme;
}
export function getCurrentAppearance() {
  const root=document.documentElement;
  return {
    theme:root.dataset.savedTheme||getSavedTheme(),
    font_family:root.dataset.fontFamily||stored("looply_font_family","system"),
    font_size:root.dataset.fontSize||stored("looply_font_size","normal")
  };
}

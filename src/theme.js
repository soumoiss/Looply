/* Tema global do Loooply: persistente e aplicado por variáveis CSS. */
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
  grafite: { primary: "#c4a7ff", primaryDark: "#a984e8", primaryDeep: "#815fbd", deep: "#171724", bg: "#11111b", bg2: "#211d32", lilac: "#322b4d", text: "#f4efff", muted: "#bdb3d2", line: "rgba(196,167,255,.2)", surface: "rgba(31,28,47,.98)", surfaceStrong: "#29243c", surfaceSoft: "#1c192b", paper: "#302a3c", paperText: "#f4efff" }
});
const THEME_KEY = "looply_theme";
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
  syne: 'Syne, Inter, sans-serif'
});
const FONT_SIZES = Object.freeze({ small: "14.4px", normal: "16px", large: "17.92px", very_large: "20px" });
const isTheme = (name) => Object.prototype.hasOwnProperty.call(THEMES, name);
const isFontFamily = (name) => Object.prototype.hasOwnProperty.call(FONT_FAMILIES, name);

export function applyTheme(name) {
  const selected = isTheme(name) || name === "system" ? name : "lilas";
  const theme = selected === "system"
    ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "noite" : "lilas")
    : selected;
  const values = THEMES[theme] || THEMES.lilas;
  const root = document.documentElement;
  root.dataset.savedTheme = selected;
  root.dataset.theme = theme;
  for (const [key, value] of Object.entries(values)) {
    // Mantém compatibilidade com nomes camelCase já usados e atualiza também
    // os tokens kebab-case consumidos pelos componentes do CSS.
    root.style.setProperty(`--${key}`, value);
    root.style.setProperty(`--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value);
  }
  // Map historical Gallery/Home palette tokens to the account theme.
  root.style.setProperty("--accent",values.primary);
  root.style.setProperty("--accent-soft",values.lilac);
  root.style.setProperty("--surface-muted",values.surfaceSoft);
  root.style.setProperty("--border",values.line);
  root.style.setProperty("--gallery-action",values.primary);
  root.style.setProperty("--gallery-control-border",values.line);
  root.style.setProperty("--gallery-control-bg-hover",values.bg2);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", values.bg);
  try { localStorage.setItem(THEME_KEY, selected); } catch {}
  window.dispatchEvent(new CustomEvent("looply:theme-changed", { detail: { theme: selected, resolvedTheme: theme } }));
  return selected;
}

export function applyProfilePreferences(profile = {}) {
  const root = document.documentElement;
  const family = isFontFamily(profile.font_family) ? profile.font_family : "system";
  const fontSize = FONT_SIZES[profile.font_size] || FONT_SIZES.normal;
  root.dataset.fontFamily = family;
  root.style.setProperty("--looply-font-family", FONT_FAMILIES[family]);
  root.style.setProperty("--looply-root-font-size", fontSize);
  try {
    localStorage.setItem("looply_font_family", family);
    localStorage.setItem("looply_font_size", profile.font_size in FONT_SIZES ? profile.font_size : "normal");
  } catch { /* Private browsing may disallow storage. */ }
  return applyTheme(isTheme(profile.theme) || profile.theme === "system" ? profile.theme : getSavedTheme());
}

export function getSavedTheme() {
  try { const saved = localStorage.getItem(THEME_KEY); return isTheme(saved) || saved === "system" ? saved : "lilas"; } catch { return "lilas"; }
}
applyTheme(getSavedTheme());
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
  if (getSavedTheme() === "system") applyTheme("system");
});
window.addEventListener("storage", event => { if (event.key === THEME_KEY) applyTheme(event.newValue || "lilas"); });

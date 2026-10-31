/* Aplica os tokens salvos antes da primeira pintura para evitar o flash lilás no
   splash/login. O módulo completo de tema recalcula estes mesmos valores depois. */
(function bootstrapTheme() {
  const themes = {
    lilas: ["#7010b0", "#5f1098", "#503090", "#302050", "#f5f0fa", "#f0e0f0", "#29252f", "#817b89", "rgba(102,82,126,.12)", "#ffffff", "#faf7fc"],
    noite: ["#b84dff", "#8f2ed0", "#6820a0", "#170b25", "#100a18", "#21102e", "#f5eafa", "#c0a9ce", "rgba(216,160,255,.18)", "#21142b", "#1a1024"],
    oceano: ["#087fbd", "#066b9e", "#07567e", "#12334a", "#edf8fc", "#d9eef7", "#20323d", "#607985", "rgba(8,127,189,.16)", "#ffffff", "#f4fbfd"],
    rosa: ["#c04483", "#a22f6b", "#79244f", "#4c1e38", "#fff2f7", "#fbe1ec", "#392632", "#8e7181", "rgba(192,68,131,.15)", "#ffffff", "#fff7fa"],
    floresta: ["#187b58", "#126546", "#0f5139", "#173c30", "#f0f8f2", "#dcefe1", "#26372d", "#6b8373", "rgba(24,123,88,.16)", "#ffffff", "#f6fbf7"],
    aurora: ["#6752d8", "#5140b5", "#3f328f", "#242044", "#f4f2ff", "#e6e1ff", "#292344", "#77719a", "rgba(103,82,216,.16)", "#ffffff", "#faf9ff"],
    coral: ["#d05b65", "#b24652", "#8a3340", "#4c1f2a", "#fff5f2", "#ffe4df", "#3b292b", "#8e7778", "rgba(208,91,101,.16)", "#ffffff", "#fffafa"],
    menta: ["#14806e", "#106856", "#0c5143", "#173d3a", "#effaf7", "#d9f0ea", "#203934", "#67827c", "rgba(20,128,110,.16)", "#ffffff", "#f7fcfb"],
    sunset: ["#d76a32", "#b94f24", "#8e381e", "#4a281f", "#fff7ed", "#ffe7cc", "#3d2b25", "#927a6d", "rgba(215,106,50,.17)", "#ffffff", "#fffaf5"],
    grafite: ["#c4a7ff", "#a984e8", "#815fbd", "#171724", "#11111b", "#211d32", "#f4efff", "#bdb3d2", "rgba(196,167,255,.2)", "#29243c", "#1c192b"]
  };
  const keys = ["primary", "primary-dark", "primary-deep", "deep", "bg", "bg-2", "text", "muted", "line", "surface-strong", "surface-soft"];
  try {
    const saved = localStorage.getItem("looply_theme") || "lilas";
    const theme = saved === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "noite" : "lilas") : saved;
    const values = themes[theme] || themes.lilas;
    document.documentElement.dataset.savedTheme = saved;
    document.documentElement.dataset.theme = theme;
    values.forEach((value, index) => document.documentElement.style.setProperty(`--${keys[index]}`, value));
    const fonts = {
      system:'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      sans:'Arial, Helvetica, sans-serif', serif:'Georgia, "Times New Roman", serif',
      rounded:'ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif',
      manrope:'Manrope, Inter, sans-serif', dm_sans:'"DM Sans", Inter, sans-serif',
      jakarta:'"Plus Jakarta Sans", Inter, sans-serif',
      space_grotesk:'"Space Grotesk", Inter, sans-serif', nunito:'Nunito, sans-serif',
      quicksand:'Quicksand, sans-serif', montserrat:'Montserrat, sans-serif',
      cormorant:'"Cormorant Garamond", Georgia, serif',
      playfair:'"Playfair Display", Georgia, serif',
      fraunces:'Fraunces, Georgia, serif', caveat:'Caveat, cursive',
      syne:'Syne, Inter, sans-serif'
    };
    const sizes = {small:"14.4px",normal:"16px",large:"17.92px",very_large:"20px"};
    const savedFont = localStorage.getItem("looply_font_family") || "system";
    const savedSize = localStorage.getItem("looply_font_size") || "normal";
    document.documentElement.style.setProperty("--looply-font-family", fonts[savedFont] || fonts.system);
    document.documentElement.style.setProperty("--looply-root-font-size", sizes[savedSize] || sizes.normal);
    document.documentElement.dataset.fontFamily = savedFont in fonts ? savedFont : "system";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", values[4]);
  } catch {}
}());

/* Aplica os tokens salvos antes da primeira pintura para evitar o flash lilás no
   splash/login. O módulo completo de tema recalcula estes mesmos valores depois. */
(function bootstrapTheme() {
  const themes = {
    lilas: ["#7010b0", "#5f1098", "#503090", "#302050", "#f5f0fa", "#f0e0f0", "#29252f", "#817b89", "rgba(102,82,126,.12)", "#ffffff", "#faf7fc"],
    noite: ["#b84dff", "#8f2ed0", "#6820a0", "#170b25", "#100a18", "#21102e", "#f5eafa", "#c0a9ce", "rgba(216,160,255,.18)", "#21142b", "#1a1024"],
    oceano: ["#087fbd", "#066b9e", "#07567e", "#12334a", "#edf8fc", "#d9eef7", "#20323d", "#607985", "rgba(8,127,189,.16)", "#ffffff", "#f4fbfd"],
    rosa: ["#c04483", "#a22f6b", "#79244f", "#4c1e38", "#fff2f7", "#fbe1ec", "#392632", "#8e7181", "rgba(192,68,131,.15)", "#ffffff", "#fff7fa"],
    floresta: ["#187b58", "#126546", "#0f5139", "#173c30", "#f0f8f2", "#dcefe1", "#26372d", "#6b8373", "rgba(24,123,88,.16)", "#ffffff", "#f6fbf7"]
  };
  const keys = ["primary", "primary-dark", "primary-deep", "deep", "bg", "bg-2", "text", "muted", "line", "surface-strong", "surface-soft"];
  try {
    const saved = localStorage.getItem("looply_theme") || "lilas";
    const theme = saved === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "noite" : "lilas") : saved;
    const values = themes[theme] || themes.lilas;
    document.documentElement.dataset.savedTheme = saved;
    document.documentElement.dataset.theme = theme;
    values.forEach((value, index) => document.documentElement.style.setProperty(`--${keys[index]}`, value));
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", values[4]);
  } catch {}
}());

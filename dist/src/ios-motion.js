// Sliding "liquid" indicator for the primary navigation and slide/fade page transitions.
// The app is one HTML page per tab, so the previous indicator position is kept in
// sessionStorage and animated to the new tab after the next page loads.
const KEY = "looply:nav:last";
const order = ["home", "reels", "cartas", "musicas", "galeria", "chat", "notificacoes"];
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const keyOf = href => String(href || "").split("?")[0].split("#")[0].replace(/\.html$/, "").split("/").pop();
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; } };
const write = value => { try { sessionStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage unavailable */ } };

export function mountIosMotion(header) {
  const nav = header?.querySelector(".page-navigation");
  if (!nav) return () => {};
  const items = [...nav.querySelectorAll("a.header-action")];
  const current = nav.querySelector('[aria-current="page"]');
  const currentKey = keyOf(current?.getAttribute("href"));
  const previous = read();
  const dir = previous && order.indexOf(previous.key) > order.indexOf(currentKey) ? "back" : "forward";
  document.documentElement.dataset.navDir = dir;

  let pill = nav.querySelector(".nav-liquid");
  if (!pill) { pill = document.createElement("span"); pill.className = "nav-liquid"; pill.setAttribute("aria-hidden", "true"); nav.prepend(pill); }

  const metrics = el => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
  const place = m => {
    nav.style.setProperty("--nav-x", m.x + "px"); nav.style.setProperty("--nav-y", m.y + "px");
    nav.style.setProperty("--nav-w", m.w + "px"); nav.style.setProperty("--nav-h", m.h + "px");
  };
  const byKey = key => items.find(item => keyOf(item.getAttribute("href")) === key);

  if (current) {
    const from = previous && previous.key !== currentKey ? byKey(previous.key) : null;
    place(metrics(from || current));
    nav.classList.add("is-ready");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!reduced()) nav.classList.add("is-animated");
      place(metrics(current));
    }));
    write({ key: currentKey });
  }

  const onResize = () => { if (!current) return; nav.classList.remove("is-animated"); place(metrics(current)); };
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("orientationchange", onResize);

  // Move the pill immediately on tap, play a short exit, then navigate.
  const onClick = event => {
    const link = event.target.closest?.("a.header-action");
    if (!link || !nav.contains(link) || event.defaultPrevented || event.button > 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target) return;
    const targetKey = keyOf(link.getAttribute("href"));
    if (!order.includes(targetKey) || targetKey === currentKey || reduced()) { write({ key: targetKey }); return; }
    event.preventDefault();
    nav.classList.add("is-animated");
    place(metrics(link));
    items.forEach(item => item.removeAttribute("aria-current"));
    link.setAttribute("aria-current", "page");
    document.documentElement.dataset.navDir = order.indexOf(targetKey) < order.indexOf(currentKey) ? "back" : "forward";
    document.body.classList.add("is-leaving");
    write({ key: targetKey });
    setTimeout(() => { window.location.href = link.href; }, 170);
  };
  nav.addEventListener("click", onClick);
  // Restoring from the back/forward cache must not leave the page faded out.
  const onShow = event => { if (event.persisted) document.body.classList.remove("is-leaving"); };
  window.addEventListener("pageshow", onShow);
  return () => {
    window.removeEventListener("resize", onResize); window.removeEventListener("orientationchange", onResize);
    window.removeEventListener("pageshow", onShow); nav.removeEventListener("click", onClick);
  };
}

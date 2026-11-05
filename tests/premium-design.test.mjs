import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pages = [
  "index.html","login.html","login-neon.html","login-teste.html",
  "realtime-neon.html","home.html","reels.html","why-now.html",
  "musicas.html","chat.html","conversa.html","cartas.html",
  "notificacoes.html","usuarios.html","configuracoes.html",
  "perfil.html","admin.html","admin-importar-figurinhas.html",
  "galeria.html","share.html"
];

test("Todos os entrypoints publicados carregam uma única camada premium", async () => {
  for (const path of pages) {
    const html = await readFile(new URL("../" + path, import.meta.url), "utf8");
    assert.match(html, /<link rel="stylesheet" href="(?:\.\/)?assets\/css\/premium-system\.css\?v=etapa1-20261105">/, path);
    assert.equal((html.match(/premium-system\.css/g)||[]).length,1,path);
    assert.ok(html.lastIndexOf("premium-system.css") < html.lastIndexOf("</head>"),path);
  }
});

test("A camada premium respeita o tema e a redução de movimento", async () => {
  const css = await readFile(new URL("../assets/css/premium-system.css", import.meta.url),"utf8");
  assert.match(css, /--premium-glass:/);
  assert.match(css, /var\(--primary/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /page-navigation-indicator\.is-ready/);
  assert.match(css, /backdrop-filter:/);
});

test("Navegação registra a aba de origem", async () => {
  const js = await readFile(new URL("../src/page-runtime.js", import.meta.url),"utf8");
  assert.match(js, /sessionStorage\.setItem\("looply-nav-from",String\(current\)\)/);
  assert.match(js, /function animatePrimaryNavigation\(header\)/);
});

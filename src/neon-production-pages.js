import "./theme.js";
import { neon, activeSession, selfProfile, escapeText, unregisterAndroidFcmDevice } from "./neon-production-client.js";
import { icon } from "./icons.js";

const pages = [
  ["home", "Início", "home.html", "home"], ["letters", "Cartas", "cartas.html", "mail"],
  ["music", "Músicas", "musicas.html", "music"], ["gallery", "Galeria", "galeria.html", "camera"],
  ["chat", "Chat", "chat.html", "chat"], ["notifications", "Notificações", "notificacoes.html", "bell"],
];
const current = location.pathname.split("/").pop() || "home.html";
const root = document.getElementById("pageContent");
const header = document.querySelector("[data-site-header]");

function notice(message) {
  if (root) root.innerHTML = `<section class="panel page-notice" role="status">${escapeText(message)}</section>`;
}

function navigationLink([, label, href, iconName]) {
  const shortLabel = label === "Notificações" ? "Avisos" : label;
  return `<a class="header-action" href="${href}" aria-label="${label}"${current === href ? ' aria-current="page"' : ""}><span class="page-navigation-icon">${icon(iconName)}</span><span class="page-navigation-label" data-short-label="${shortLabel}">${label}</span></a>`;
}

function renderHeader(profile, isAdmin) {
  const name = escapeText(profile.display_name || profile.username);
  const username = escapeText(profile.username);
  const avatar = profile.avatar_path
    ? `<img class="looply-user-avatar" src="${escapeText(profile.avatar_path)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="looply-user-initial" aria-hidden="true">${escapeText(name.slice(0, 1).toLocaleUpperCase("pt-BR"))}</span>`;
  const links = pages.map(navigationLink).join("");
  const accountLinks = `<a class="account-menu-link" href="perfil.html">${icon("user")}Meu perfil</a><a class="account-menu-link" href="usuarios.html">${icon("users")}Pessoas</a><a class="account-menu-link" href="configuracoes.html">${icon("settings")}Configurações</a>${isAdmin ? `<a class="account-menu-link" href="admin.html">${icon("shield")}Administração</a>` : ""}`;
  header.innerHTML = `${current !== "home.html" ? `<a class="header-action header-back-button" href="home.html" aria-label="Voltar para o início"><span>${icon("back")}</span><span class="back-label">Início</span></a>` : ""}<a class="brand-inline" href="home.html" aria-label="Looply, início"><span class="brand-mark brand-mark-animated" aria-hidden="true"><span class="circle"><svg viewBox="0 0 100 100" fill="none"><path d="M50 15A35 35 0 0 1 85 50" stroke="currentColor" stroke-width="5"/></svg></span></span><span><strong>Looply</strong><span>MoissWorld</span></span></a><nav class="header-actions page-navigation" aria-label="Navegação principal">${links}</nav><details class="looply-account-menu"><summary class="looply-account" aria-label="Abrir menu da conta">${avatar}<span><strong>${name}</strong><small>@${username}${isAdmin ? " · administrador" : ""}</small></span><span class="account-menu-caret">⌄</span></summary><div class="account-menu-popover">${accountLinks}<button class="header-action" id="neonLogout" type="button">Sair</button></div></details>`;
  document.getElementById("neonLogout")?.addEventListener("click", async () => {
    await unregisterAndroidFcmDevice().catch(() => false);
    const result = await neon.auth.signOut();
    if (result.error) notice("Não foi possível sair da conta.");
    else location.replace("login.html");
  });
}

function panel(title, content, className = "") {
  return `<section class="panel ${className}" style="margin-bottom:16px"><h2>${escapeText(title)}</h2>${content}</section>`;
}

async function renderHome(profile) {
  const result = await neon.from("v3_feed_posts").select("id,author_id,body,created_at,external_url").order("created_at", { ascending: false }).limit(35);
  if (result.error) throw new Error("O feed não pôde ser carregado com as permissões atuais.");
  const posts = result.data || [];
  const initial = escapeText((profile.display_name || profile.username).slice(0, 1).toLocaleUpperCase("pt-BR"));
  const welcome = `<section class="home-welcome panel"><div class="home-welcome-avatar">${initial}</div><div class="home-welcome-copy"><span class="eyebrow">BEM-VINDO DE VOLTA</span><h1 class="hero-title">Olá, ${escapeText(profile.display_name || profile.username)}!</h1><p>Seu espaço, suas pessoas, suas histórias.</p></div></section>`;
  const content = posts.map(post => `<article class="panel" style="margin-bottom:12px"><small>${escapeText(post.created_at ? new Date(post.created_at).toLocaleString("pt-BR") : "")}</small><p style="white-space:pre-wrap">${escapeText(post.body || "Compartilhou uma mídia.")}</p>${post.external_url ? `<a href="${escapeText(post.external_url)}" target="_blank" rel="noopener noreferrer">Abrir link</a>` : ""}</article>`).join("") || "<p>Ainda não há publicações visíveis para esta conta.</p>";
  return welcome + panel("Publicações", content, "social-feed");
}

async function render() {
  if (!root || !header) return;
  try {
    const session = await activeSession();
    if (!session) return location.replace("login.html?next=" + encodeURIComponent(current));
    const profile = await selfProfile();
    const isAdmin = session.user?.role === "admin";
    if (current === "admin.html" && !isAdmin) return location.replace("home.html");
    renderHeader(profile, isAdmin);
    if (current === "home.html") root.innerHTML = await renderHome(profile);
    else if (current === "perfil.html") root.innerHTML = panel("Meu perfil", `<p><strong>@${escapeText(profile.username)}</strong></p><p>${escapeText(profile.display_name || profile.username)}</p><p>${escapeText(profile.bio || "Sem biografia.")}</p>`);
    else {
      const name = pages.find(page => page[2] === current)?.[1] || "Looply";
      root.innerHTML = panel(name, "<p>Esta funcionalidade ainda precisa da API Neon equivalente antes de ser reativada com segurança.</p>");
    }
  } catch (error) {
    notice(error?.message || "Não foi possível carregar o Looply agora.");
  }
}

void render();

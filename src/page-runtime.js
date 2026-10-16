import { isSupabaseConfigured, supabase } from "./supabase.js";
import { checkAdminAccess } from "./admin.js";
import { applyTheme, getSavedTheme } from "./theme.js";

const navigation = [
  ["home", "Início", "home.html"],
  ["gallery", "Galeria", "galeria.html"],
  ["music", "Músicas", "musicas.html"],
  ["chat", "Chat e cartas", "chat.html"],
  ["profile", "Perfil", "perfil.html"]
];
const navigationShortLabels = { chat: "Chat", profile: "Perfil", gallery: "Galeria", music: "Músicas", home: "Início" };
const navigationIcons = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg>',
  gallery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 11h.01M12 11h.01M16 11h.01"/></svg>',
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 19 6v5c0 5-3.2 8.3-7 10-3.8-1.7-7-5-7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>'
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function notice(root, text, kind = "info") {
  root.innerHTML = `<section class="panel page-notice" role="${kind === "error" ? "alert" : "status"}">${escapeHtml(text)}</section>`;
}

function headerMarkup(page, profile, admin) {
  const username = escapeHtml(profile.username);
  const name = escapeHtml(profile.display_name || profile.username);
  const avatar = profile.avatarUrl
    ? `<img class="looply-user-avatar" src="${escapeHtml(profile.avatarUrl)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="looply-user-initial" aria-hidden="true">${escapeHtml(name.slice(0, 1).toLocaleUpperCase("pt-BR"))}</span>`;
  const links = navigation.map(([key, label, href]) => `<a class="header-action" href="${href}" aria-label="${label}"${key === page ? ' aria-current="page"' : ""}><span class="page-navigation-icon" aria-hidden="true">${navigationIcons[key]}</span><span class="page-navigation-label" data-short-label="${navigationShortLabels[key] || label}">${label}</span></a>`).join("");
  return `<a class="brand-inline" href="home.html" aria-label="Looply, início"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none"><path d="M50 15A35 35 0 0 1 85 50" stroke="currentColor" stroke-width="7"/></svg></span><span><strong>Looply</strong><span>MoissWorld</span></span></a>
    <nav class="header-actions page-navigation" aria-label="Navegação principal">${links}${admin ? '<a class="header-action admin-nav-link" href="admin.html" aria-label="Administração"' + (page === "admin" ? ' aria-current="page"' : "") + '><span class="page-navigation-icon" aria-hidden="true">' + navigationIcons.admin + '</span><span class="page-navigation-label" data-short-label="Admin">Administração</span></a>' : ""}</nav>
    <div class="looply-account">${avatar}<span><strong>${name}</strong><small>@${username}${admin ? " · administrador" : ""}</small></span>
      <label class="theme-picker"><span class="visually-hidden">Tema</span><select id="themeSelect" class="input" aria-label="Tema"><option value="lilas">Lilás</option><option value="noite">Noite</option><option value="oceano">Oceano</option><option value="rosa">Rosa</option><option value="floresta">Floresta</option></select></label>
      <button class="header-action" type="button" data-sign-out>Sair</button></div>`;
}

async function loadProfile(userId) {
  const { data, error } = await supabase.from("profiles")
    .select("id,username,display_name,bio,profile_visibility,avatar_path")
    .eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("O perfil desta conta não foi encontrado.");
  if (data.avatar_path) {
    const { data: signed } = await supabase.storage.from("looply-avatars").createSignedUrl(data.avatar_path, 1800);
    data.avatarUrl = signed?.signedUrl || "";
  }
  return data;
}

export async function mountAppPage({ page, adminOnly = false, render }) {
  const root = document.getElementById("pageContent");
  const header = document.querySelector("[data-site-header]");
  if (!root || !header) return;

  if (!isSupabaseConfigured || !supabase) {
    notice(root, "A configuração pública do Supabase está ausente ou inválida.", "error");
    return;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    window.location.replace("login.html");
    return;
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    await supabase.auth.signOut();
    window.location.replace("login.html");
    return;
  }

  const user = userData.user;
  let profile;
  try {
    profile = await loadProfile(user.id);
  } catch (error) {
    notice(root, error?.message || "Não foi possível carregar o perfil.", "error");
    return;
  }

  const isAdmin = await checkAdminAccess(supabase);
  if (adminOnly && !isAdmin) {
    window.location.replace("home.html");
    return;
  }

  header.innerHTML = headerMarkup(page, profile, isAdmin);
  document.querySelectorAll(".page-navigation a").forEach((link) => {
    if (link.getAttribute("aria-current") === "page") link.setAttribute("aria-current", "page");
  });
  const themePicker = header.querySelector("#themeSelect");
  themePicker.value = applyTheme(getSavedTheme());
  themePicker.addEventListener("change", () => applyTheme(themePicker.value));
  header.querySelector("[data-sign-out]").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;
    const { error } = await supabase.auth.signOut();
    if (error) event.currentTarget.disabled = false;
  });

  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) window.location.replace("login.html");
  });

  try {
    await render({ root, client: supabase, user, profile, isAdmin });
  } catch (error) {
    console.error("Looply page failed to load", error);
    notice(root, "Não foi possível carregar esta página. Confira sua conexão e tente novamente.", "error");
  }

  window.addEventListener("pagehide", () => authListener.subscription.unsubscribe(), { once: true });
}

export { notice };

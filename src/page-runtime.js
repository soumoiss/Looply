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
  const links = navigation.map(([key, label, href]) => `<a class="header-action" href="${href}"${key === page ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  return `<a class="brand-inline" href="home.html" aria-label="Looply, início"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none"><path d="M50 15A35 35 0 0 1 85 50" stroke="currentColor" stroke-width="7"/></svg></span><span><strong>Looply</strong><span>MoissWorld</span></span></a>
    <nav class="header-actions page-navigation" aria-label="Navegação principal">${links}${admin ? '<a class="header-action admin-nav-link" href="admin.html"' + (page === "admin" ? ' aria-current="page"' : "") + '>Administração</a>' : ""}</nav>
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

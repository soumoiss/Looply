import { mountAppPage } from "../../src/page-runtime.js?v=notification-bus-20261022";
import { welcomeGreeting } from "../../src/welcome.js";
import { bindSocialEvents, disposeSocialRealtime, loadSocialData, setupSocialRealtime, socialMarkup } from "../../src/social.js";
import { bindStories, disposeStoriesRealtime, loadStories, setupStoriesRealtime, storiesMarkup } from "../../src/stories.js?v=portrait-capture-20261026";
import { captureIncomingSharedLink, takeIncomingSharedLink } from "../../src/shared-link.js";
import { mountSecretMessages } from "../../src/secret-messages.js";

// Support direct links to home.html?share_url=... without the splash screen.
captureIncomingSharedLink();

function escapeSettingsHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderGlobalHomeSettings(settings = {}) {
  const welcome = String(settings.welcome_banner_text || "").trim();
  const title = String(settings.music_of_the_day_title || "").trim();
  const rawUrl = String(settings.music_of_the_day_url || "").trim();
  let musicUrl = "";
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "https:" && (/(^|\.)youtube\.com$/.test(url.hostname) || /(^|\.)youtu\.be$/.test(url.hostname))) musicUrl = url.href;
  } catch {}
  return `${welcome ? `<section class="looply-welcome-banner" data-global-welcome>${escapeSettingsHtml(welcome)}</section>` : `<section data-global-welcome hidden></section>`}${musicUrl ? `<a class="looply-music-of-day" data-global-music href="${escapeSettingsHtml(musicUrl)}" target="_blank" rel="noopener noreferrer"><span class="looply-music-of-day-icon" aria-hidden="true">♫</span><span class="looply-music-of-day-copy"><small>MÚSICA DO DIA</small><strong>${escapeSettingsHtml(title || "Ouça a música de hoje")}</strong></span><span class="looply-music-of-day-play" aria-hidden="true">▶</span></a>` : `<section data-global-music hidden></section>`}`;
}

function renderWelcome(profile) {
  const name = String(profile.display_name || profile.username || "usuário");
  const avatar = profile.avatarUrl;
  const markup = `<section class="hero-panel home-welcome" aria-labelledby="homeWelcomeTitle">
    <div class="home-welcome-avatar" data-home-avatar aria-hidden="true"><span data-home-avatar-initial></span></div>
    <div class="home-welcome-copy"><div class="eyebrow">Início</div><h1 class="hero-title" id="homeWelcomeTitle" data-home-welcome-title></h1><p>Feed</p></div>
    <a class="header-action home-profile-shortcut" href="perfil.html">Meu perfil</a>
  </section>`;
  const template = document.createElement("template");
  template.innerHTML = markup;
  const welcome = template.content.firstElementChild;
  welcome.querySelector("[data-home-welcome-title]").textContent = welcomeGreeting(profile.username) + ", " + name;
  const fallback = welcome.querySelector("[data-home-avatar-initial]");
  fallback.textContent = Array.from(name.trim())[0]?.toLocaleUpperCase("pt-BR") || "?";
  if (avatar) {
    const image = document.createElement("img");
    image.src = avatar;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove(), { once: true });
    welcome.querySelector("[data-home-avatar]").prepend(image);
  }
  return welcome.outerHTML;
}

await mountAppPage({ page: "home", render: async ({ root, client, user, profile, isAdmin }) => {
  let globalSettings = {};
  try {
    const { data, error } = await client.from("app_settings")
      .select("music_of_the_day_title,music_of_the_day_url,welcome_banner_text").eq("id", 1).maybeSingle();
    if (error) throw error;
    globalSettings = data || {};
  } catch (error) { console.warn("Looply home global settings unavailable", error); }
  const [socialResult, storiesResult] = await Promise.allSettled([
    loadSocialData(client), loadStories(client)
  ]);
  const socialData = socialResult.status === "fulfilled"
    ? socialResult.value
    : { people: [], peopleError: socialResult.reason, posts: [], postsError: socialResult.reason };
  const stories = storiesResult.status === "fulfilled" ? storiesResult.value : [];
  const storiesError = storiesResult.status === "rejected" ? storiesResult.reason : null;
  root.innerHTML = `${renderWelcome(profile)}${renderGlobalHomeSettings(globalSettings)}${storiesMarkup(
    stories, storiesError, socialData.people, socialData.peopleError, user.id, profile
  )}${socialMarkup(socialData, user.id, isAdmin)}`;
  void mountSecretMessages(client, user.id, isAdmin);
  bindStories(root, client, user.id, stories, storiesError, profile, isAdmin);
  bindSocialEvents(root, client, () => user.id, isAdmin);
  const globalSettingsChannel = client.channel("looply-home-global-settings")
    .on("postgres_changes", { event: "*", schema: "public", table: "app_settings", filter: "id=eq.1" }, ({ new: updated }) => {
      const next = document.createElement("template");
      next.innerHTML = renderGlobalHomeSettings(updated || {});
      const nextWelcome = next.content.querySelector("[data-global-welcome]");
      const nextMusic = next.content.querySelector("[data-global-music]");
      root.querySelector("[data-global-welcome]")?.replaceWith(nextWelcome);
      root.querySelector("[data-global-music]")?.replaceWith(nextMusic);
    }).subscribe();
  window.addEventListener("pagehide", () => client.removeChannel(globalSettingsChannel), { once: true });

  // Expand and prefill the existing Feed composer. Never submit automatically.
  const sharedUrl = takeIncomingSharedLink();
  if (sharedUrl) {
    const fields = root.querySelector("[data-composer-fields]");
    const toggle = root.querySelector("[data-toggle-composer]");
    const composer = root.querySelector("form[data-social-post]");
    const externalUrl = root.querySelector("#postExternalUrl");
    const status = composer?.querySelector("[data-status]");
    if (fields && externalUrl) {
      fields.hidden = false;
      if (toggle) {
        toggle.setAttribute("aria-expanded", "true");
        toggle.setAttribute("aria-label", "Fechar formulário de nova publicação");
      }
      externalUrl.value = sharedUrl;
      if (status) {
        status.textContent = "Link recebido do compartilhamento. Revise a publicação e toque em Publicar para confirmar.";
        status.dataset.kind = "success";
      }
      requestAnimationFrame(() => {
        composer?.scrollIntoView({ behavior: "smooth", block: "center" });
        externalUrl.focus({ preventScroll: true });
      });
    }
  }
  setupStoriesRealtime(client, user.id, root);
  setupSocialRealtime(client, user.id, root, isAdmin);
  window.addEventListener("pagehide", () => {
    disposeStoriesRealtime(client, root);
    disposeSocialRealtime(client);
  }, { once: true });
} });

if (window.location.hash) {
  requestAnimationFrame(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

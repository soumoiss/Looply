import { mountAppPage } from "../../src/page-runtime.js";
import { welcomeGreeting } from "../../src/welcome.js";
import { bindSocialEvents, disposeSocialRealtime, loadSocialData, setupSocialRealtime, socialMarkup } from "../../src/social.js";
import { bindStories, disposeStoriesRealtime, loadStories, setupStoriesRealtime, storiesMarkup } from "../../src/stories.js";
import { captureIncomingSharedLink, takeIncomingSharedLink } from "../../src/shared-link.js";

// Support direct links to home.html?share_url=... without the splash screen.
captureIncomingSharedLink();

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
  const [socialResult, storiesResult] = await Promise.allSettled([
    loadSocialData(client), loadStories(client)
  ]);
  const socialData = socialResult.status === "fulfilled"
    ? socialResult.value
    : { people: [], peopleError: socialResult.reason, posts: [], postsError: socialResult.reason };
  const stories = storiesResult.status === "fulfilled" ? storiesResult.value : [];
  const storiesError = storiesResult.status === "rejected" ? storiesResult.reason : null;
  root.innerHTML = `${renderWelcome(profile)}${storiesMarkup(
    stories, storiesError, socialData.people, socialData.peopleError, user.id, profile
  )}${socialMarkup(socialData, user.id, isAdmin)}`;
  bindStories(root, client, user.id, stories, storiesError, profile, isAdmin);
  bindSocialEvents(root, client, () => user.id, isAdmin);

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

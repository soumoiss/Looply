import { mountAppPage } from "../../src/page-runtime.js";
import { bindSocialEvents, disposeSocialRealtime, loadSocialData, setupSocialRealtime, socialMarkup } from "../../src/social.js";
import { archivedCardsMarkup, bindArchivedCards, loadArchivedCards } from "../../src/archived-cards.js";

function renderWelcome(root, profile) {
  const name = String(profile.display_name || profile.username || "usuário");
  const avatar = profile.avatarUrl;
  const markup = `<section class="hero-panel home-welcome" aria-labelledby="homeWelcomeTitle">
    <div class="home-welcome-avatar" data-home-avatar aria-hidden="true"><span data-home-avatar-initial></span></div>
    <div class="home-welcome-copy"><div class="eyebrow">Início</div><h1 class="hero-title" id="homeWelcomeTitle" data-home-welcome-title></h1><p>Cartas e publicações</p></div>
    <a class="header-action home-profile-shortcut" href="perfil.html">Meu perfil</a>
  </section>`;
  const template = document.createElement("template");
  template.innerHTML = markup;
  const welcome = template.content.firstElementChild;
  welcome.querySelector("[data-home-welcome-title]").textContent = `Bem-vindo, ${name}`;
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

await mountAppPage({ page: "home", render: async ({ root, client, user, profile }) => {
  const [data, archive] = await Promise.all([
    loadSocialData(client),
    loadArchivedCards(client, user.id)
  ]);
  root.innerHTML = `${renderWelcome(root, profile)}${archivedCardsMarkup()}${socialMarkup(data, user.id)}`;
  bindSocialEvents(root, client, () => user.id);
  bindArchivedCards(root, client, user.id, archive);
  setupSocialRealtime(client, user.id, root);
  window.addEventListener("pagehide", () => disposeSocialRealtime(client), { once: true });
} });

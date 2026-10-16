import { mountAppPage } from "../../src/page-runtime.js";
import { bindSocialEvents, disposeSocialRealtime, loadSocialData, setupSocialRealtime, socialMarkup } from "../../src/social.js";
import { archivedCardsMarkup, bindArchivedCards, loadArchivedCards } from "../../src/archived-cards.js";

await mountAppPage({ page: "home", render: async ({ root, client, user }) => {
  const [data, archive] = await Promise.all([
    loadSocialData(client),
    loadArchivedCards(client, user.id)
  ]);
  root.innerHTML = `${socialMarkup(data, user.id)}${archivedCardsMarkup()}`;
  bindSocialEvents(root, client, () => user.id);
  bindArchivedCards(root, client, user.id, archive);
  setupSocialRealtime(client, user.id, root);
  window.addEventListener("pagehide", () => disposeSocialRealtime(client), { once: true });
} });


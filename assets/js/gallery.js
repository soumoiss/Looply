import { mountAppPage } from "../../src/page-runtime.js";
import { bindSocialEvents, disposeSocialRealtime, loadSocialData, setupSocialRealtime, socialMarkup } from "../../src/social.js";
import { archiveGalleryMarkup, bindArchiveGallery, loadArchiveMedia } from "../../src/gallery-archive.js";

await mountAppPage({ page: "gallery", render: async ({ root, client, user, profile }) => {
  const [socialResult, archiveResult] = await Promise.allSettled([
    loadSocialData(client), loadArchiveMedia(client)
  ]);
  const data = socialResult.status === "fulfilled"
    ? socialResult.value
    : { people: [], peopleError: socialResult.reason, posts: [], postsError: socialResult.reason };
  const archiveMedia = archiveResult.status === "fulfilled" ? archiveResult.value : [];
  root.innerHTML = `${archiveGalleryMarkup(archiveMedia)}${socialMarkup(data, user.id)}`;
  if (archiveResult.status === "rejected") {
    console.error("Looply archive gallery load failed", archiveResult.reason);
    root.querySelector(".archive-media-empty").textContent = "Não foi possível carregar o acervo de mídias.";
  }
  bindSocialEvents(root, client, () => user.id);
  bindArchiveGallery(root, client, user, archiveMedia, profile);
  setupSocialRealtime(client, user.id, root);
  window.addEventListener("pagehide", () => disposeSocialRealtime(client), { once: true });
} });

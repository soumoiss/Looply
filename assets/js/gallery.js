import { mountAppPage } from "../../src/page-runtime.js";
import { bindSocialEvents, disposeSocialRealtime, loadSocialData, setupSocialRealtime, socialMarkup } from "../../src/social.js";
import { archiveGalleryMarkup, bindArchiveGallery, loadArchiveMedia } from "../../src/gallery-archive.js";

await mountAppPage({ page: "gallery", render: async ({ root, client, user, profile }) => {
  const [data, archiveMedia] = await Promise.all([
    loadSocialData(client),
    loadArchiveMedia(client)
  ]);
  root.innerHTML = `${archiveGalleryMarkup(archiveMedia)}${socialMarkup(data, user.id)}`;
  bindSocialEvents(root, client, () => user.id);
  bindArchiveGallery(root, client, user, archiveMedia, profile);
  setupSocialRealtime(client, user.id, root);
  window.addEventListener("pagehide", () => disposeSocialRealtime(client), { once: true });
} });


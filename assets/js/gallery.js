import { mountAppPage } from "../../src/page-runtime.js";
import { archiveGalleryMarkup, bindArchiveGallery, loadArchiveMedia } from "../../src/gallery-archive.js";

await mountAppPage({ page: "gallery", render: async ({ root, client, user, profile }) => {
  let archiveMedia = [];
  let archiveLoadFailed = false;
  try {
    archiveMedia = await loadArchiveMedia(client);
  } catch (error) {
    archiveLoadFailed = true;
    console.error("Looply archive gallery load failed", error);
  }
  root.innerHTML = archiveGalleryMarkup(archiveMedia);
  if (archiveLoadFailed) {
    const message = root.querySelector(".archive-media-empty");
    if (message) {
      message.textContent = "Não foi possível carregar o acervo de mídias.";
      message.setAttribute("role", "alert");
    }
  }
  bindArchiveGallery(root, client, user, archiveMedia, profile);
} });

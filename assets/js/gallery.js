import { mountAppPage } from "../../src/page-runtime.js";
import { archiveGalleryMarkup, bindArchiveGallery, loadArchiveMedia } from "../../src/gallery-archive.js";
import { bindCommunityGallery, communityGalleryMarkup, loadCommunityGallery } from "../../src/community-gallery.js";

await mountAppPage({ page: "gallery", render: async ({ root, client, user, profile, isAdmin }) => {
  const [archiveResult, communityResult] = await Promise.allSettled([
    loadArchiveMedia(client), loadCommunityGallery(client)
  ]);
  const archiveMedia = archiveResult.status === "fulfilled" ? archiveResult.value : [];
  const communityMedia = communityResult.status === "fulfilled" ? communityResult.value : [];
  root.innerHTML = communityGalleryMarkup(communityMedia, user.id, isAdmin) + archiveGalleryMarkup(archiveMedia);
  if (archiveResult.status === "rejected") {
    console.error("Looply archive gallery load failed", archiveResult.reason);
    const message = root.querySelector(".archive-media-empty");
    if (message) { message.textContent = "Não foi possível carregar o acervo de mídias."; message.setAttribute("role", "alert"); }
  }
  if (communityResult.status === "rejected") {
    console.error("Looply community gallery load failed", communityResult.reason);
    const message = root.querySelector(".community-gallery-grid");
    if (message) message.innerHTML = "<p class=\"community-gallery-empty\" role=\"alert\">Não foi possível carregar a galeria da comunidade.</p>";
  }
  bindCommunityGallery(root, client, user, isAdmin, communityMedia);
  bindArchiveGallery(root, client, user, archiveMedia, profile);
} });

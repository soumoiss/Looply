import { mountAppPage } from "../../src/page-runtime.js";
import { archiveGalleryMarkup, bindArchiveGallery, loadArchiveMedia } from "../../src/gallery-archive.js";
import { bindCommunityGallery, communityGalleryMarkup, loadCommunityGallery } from "../../src/community-gallery.js";
import { bindArchiveGalleryControls, bindArchiveAudienceManager } from "../../src/archive-audience-manager.js";
import { bindGalleryExperience } from "../../src/gallery-experience.js";

function bindSafely(name, callback) {
  try {
    callback();
    return true;
  } catch (error) {
    console.error(`Looply gallery module failed to initialize: ${name}`, error);
    return false;
  }
}

await mountAppPage({ page: "gallery", render: async ({ root, client, user, profile, isAdmin }) => {
  const [archiveResult, communityResult] = await Promise.allSettled([
    loadArchiveMedia(client, user.id), loadCommunityGallery(client)
  ]);
  const archiveMedia = archiveResult.status === "fulfilled" ? archiveResult.value : [];
  const communityMedia = communityResult.status === "fulfilled" ? communityResult.value : [];

  // Render both sections before attaching behavior. A failure in the community
  // feature must never erase the archive or prevent its thumbnails from loading.
  root.innerHTML = archiveGalleryMarkup(archiveMedia, isAdmin) + communityGalleryMarkup(communityMedia, user.id, isAdmin);

  if (archiveResult.status === "rejected") {
    console.error("Looply archive gallery load failed", archiveResult.reason);
    const message = root.querySelector("[data-archive-media-empty]");
    if (message) { message.textContent = "Não foi possível carregar o acervo de mídias. Toque em Atualizar mídias para tentar novamente."; message.setAttribute("role", "alert"); }
  }
  if (communityResult.status === "rejected") {
    console.error("Looply community gallery load failed", communityResult.reason);
    const message = root.querySelector(".community-gallery-grid");
    if (message) message.innerHTML = "<p class=\"community-gallery-empty\" role=\"alert\">Não foi possível carregar a galeria da comunidade.</p>";
  }

  // Initialize the core archive first. Optional features are isolated so one
  // broken listener cannot replace the whole page with the generic error.
  bindSafely("archive-media", () => bindArchiveGallery(root, client, user, archiveMedia, profile, isAdmin));
  bindSafely("community-media", () => bindCommunityGallery(root, client, user, isAdmin, communityMedia));
  bindSafely("archive-controls", () => bindArchiveGalleryControls(root));
  bindSafely("archive-audience-manager", () => bindArchiveAudienceManager(root, client, isAdmin));
  bindSafely("gallery-experience", () => bindGalleryExperience(root, client, user, isAdmin, { archiveMedia, communityMedia }));

  if (archiveResult.status === "fulfilled" && archiveMedia.length === 0) {
    const message = root.querySelector("[data-archive-media-empty]");
    if (message) message.textContent = "Nenhuma mídia do acervo foi encontrada para esta conta.";
  }
} });

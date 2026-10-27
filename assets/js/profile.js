import { mountAppPage } from "../../src/page-runtime.js?v=mirrored-global-calls-20261027";
import { bindProfileEvents, profileAreaMarkup, showProfileInContainer } from "../../src/profiles.js";

await mountAppPage({ page: "profile", render: async ({ root, client, profile }) => {
  const targetId = new URLSearchParams(window.location.search).get("usuario");
  if (targetId && targetId !== profile.id) {
    await showProfileInContainer(client, targetId, root, { showBack: false });
    return;
  }
  if (profile.avatar_path) {
    const { data: signed, error } = await client.storage.from("looply-avatars")
      .createSignedUrl(profile.avatar_path, 1800);
    if (!error && signed?.signedUrl) profile.avatarUrl = signed.signedUrl;
  }
  root.innerHTML = profileAreaMarkup(profile);
  bindProfileEvents(root, client, () => window.location.reload(), profile.id);
} });

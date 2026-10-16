import { mountAppPage } from "../../src/page-runtime.js";
import { bindProfileEvents, profileAreaMarkup } from "../../src/profiles.js";

await mountAppPage({ page: "profile", render: async ({ root, client, profile }) => {
  root.innerHTML = profileAreaMarkup(profile);
  bindProfileEvents(root, client, () => window.location.reload());
} });

import { mountAppPage } from "../../src/page-runtime.js?build=e913ddee23ac1c1d";
import { adminMarkup, bindAdminEvents } from "../../src/admin.js?build=e913ddee23ac1c1d";
import { bindArchiveImport } from "../../src/archive-import.js?build=e913ddee23ac1c1d";
import { mountAdminLetterLog } from "../../src/admin-letter-log.js?build=e913ddee23ac1c1d";

await mountAppPage({ page: "admin", adminOnly: true, render: async ({ root, client, profile, user }) => {
  root.dataset.currentUserId = user.id;
  root.innerHTML = adminMarkup(profile);
  const requestedResource = new URLSearchParams(window.location.search).get("resource");
  const resourceSelect = root.querySelector("#adminResource");
  if (resourceSelect && [...resourceSelect.options].some(option => option.value === requestedResource)) {
    resourceSelect.value = requestedResource;
    resourceSelect.dispatchEvent(new Event("change", { bubbles: true }));
  }
  bindAdminEvents(root, client);
  bindArchiveImport(root, client);
  mountAdminLetterLog(root, client);
} });


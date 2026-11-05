import { mountAppPage } from "../../src/page-runtime.js?build=f096c6dcc96f4a2c";
import { adminMarkup, bindAdminEvents } from "../../src/admin.js?build=f096c6dcc96f4a2c";
import { bindArchiveImport } from "../../src/archive-import.js?build=f096c6dcc96f4a2c";
import { mountAdminLetterLog } from "../../src/admin-letter-log.js?build=f096c6dcc96f4a2c";

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


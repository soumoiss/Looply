import { mountAppPage } from "../../src/page-runtime.js?build=caa8d5b0bdd8905d";
import { adminMarkup, bindAdminEvents } from "../../src/admin.js?build=caa8d5b0bdd8905d";
import { bindArchiveImport } from "../../src/archive-import.js?build=caa8d5b0bdd8905d";
import { mountAdminLetterLog } from "../../src/admin-letter-log.js?build=caa8d5b0bdd8905d";

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


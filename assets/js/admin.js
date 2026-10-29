import { mountAppPage } from "../../src/page-runtime.js?v=notification-bus-20261022";
import { adminMarkup, bindAdminEvents } from "../../src/admin.js?v=archive-card-controls-20261022";
import { bindArchiveImport } from "../../src/archive-import.js";

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
} });


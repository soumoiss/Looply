import { mountAppPage } from "../../src/page-runtime.js";
import { adminMarkup, bindAdminEvents } from "../../src/admin.js?v=archive-card-controls-20261022";
import { bindArchiveImport } from "../../src/archive-import.js";

await mountAppPage({ page: "admin", adminOnly: true, render: async ({ root, client, profile }) => {
  root.innerHTML = adminMarkup(profile);
  bindAdminEvents(root, client);
  bindArchiveImport(root, client);
} });


import { startMaintenanceGate } from "./maintenance-gate.js";

const entry = document.querySelector("script[data-looply-entry]")?.getAttribute("data-looply-entry");
if (await startMaintenanceGate() && entry) {
  const url = new URL(entry, document.baseURI);
  // The production builder stamps every module with a content-derived build ID.
  url.search = new URL(import.meta.url).search;
  await import(url.href);
}

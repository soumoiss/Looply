import { neon, activeSession } from "./neon-production-client.js";

// A single, fail-closed check runs before every production page controller.
// Postgres remains the authority: client state never grants an ADM bypass.
const CHECK_EVERY_MS = 1000;
let gatePromise = null;
let checkInFlight = null;
let blocked = false;
let pollStarted = false;
let listenerAttached = false;

function maintenanceScreen() {
  blocked = true;
  document.documentElement.classList.remove("looply-maintenance-pending");
  document.documentElement.classList.add("looply-maintenance-locked");

  const render = () => {
    if (!document.body) return;
    document.querySelectorAll("video,audio").forEach(media => {
      try { media.pause(); if ("srcObject" in media) media.srcObject = null; } catch {}
    });
    document.body.replaceChildren();
    const screen = document.createElement("main");
    screen.className = "looply-maintenance-screen";
    screen.setAttribute("role", "alert");
    screen.setAttribute("aria-live", "assertive");
    screen.style.cssText = "position:fixed!important;inset:0!important;width:100%!important;height:100dvh!important;z-index:2147483647!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:12px!important;background:#fff!important;color:#171717!important;padding:24px!important;text-align:center!important;box-sizing:border-box!important";
    const title = document.createElement("h1");
    title.textContent = "Em manutenção";
    title.style.cssText = "font:700 clamp(24px,6vw,36px)/1.2 system-ui,sans-serif;margin:0;color:inherit";
    const info = document.createElement("p");
    info.textContent = "Aguarde um tempo.";
    info.style.cssText = "font:400 16px/1.5 system-ui,sans-serif;margin:0;color:inherit";
    screen.append(title, info);
    document.body.append(screen);
    window.dispatchEvent(new Event("looply:maintenance-blocked"));
  };
  if (document.body) render();
  else document.addEventListener("DOMContentLoaded", render, { once: true });
}

function loginOrEntryPage() {
  return /\/(?:index|login|login-neon|login-teste)\.html$/i.test(location.pathname)
    || /\/$/.test(location.pathname);
}

// This RPC grants access only when the Neon Auth user is an active admin
// linked to the original Peixinho profile. Never infer this from local names.
export async function verifiedPeixinhoAdmin() {
  try {
    const response = await neon.rpc("looply_maintenance_admin_bypass");
    if (response.error) return false;
    let value = Array.isArray(response.data) ? response.data[0] : response.data;
    if (value && typeof value === "object" && "looply_maintenance_admin_bypass" in value) {
      value = value.looply_maintenance_admin_bypass;
    }
    return value === true || value === "true";
  } catch {
    return false;
  }
}

async function verifyAccess() {
  const session = await activeSession();
  // Peixinho must still be able to sign in while maintenance is active.
  if (!session?.access_token) {
    if (loginOrEntryPage()) return true;
    window.location.replace(new URL("login.html", document.baseURI).href);
    return false;
  }

  // A separate, restricted server-side admin check prevents the maintenance
  // overlay from locking out Peixinho when a general settings RPC is stale.
  const result = await neon.rpc("looply_maintenance_status");
  let value = Array.isArray(result.data) ? result.data[0] : result.data;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  if (value && typeof value === "object" && value.looply_maintenance_status) {
    value = value.looply_maintenance_status;
  }
  const valid = !result.error && value
    && typeof value.enabled === "boolean"
    && typeof value.blocked === "boolean";
  if (valid && value.blocked === false) return true;

  // Maintenance or settings error: only the proven Peixinho account may enter.
  // Every other user remains blocked, including sessions already logged in.
  return verifiedPeixinhoAdmin();
}

async function check() {
  if (checkInFlight) return checkInFlight;
  checkInFlight = (async () => {
    let allowed = false;
    try { allowed = await verifyAccess(); }
    catch (error) {
      console.warn("Looply maintenance authorization unavailable", error?.message || "network");
    }
    if (!allowed) maintenanceScreen();
    else if (blocked) window.location.reload();
    else document.documentElement.classList.remove("looply-maintenance-pending");
    return allowed && !blocked;
  })();
  try { return await checkInFlight; }
  finally { checkInFlight = null; }
}

export function startMaintenanceGate() {
  if (gatePromise) return gatePromise;
  gatePromise = (async () => {
    const allowed = await check();
    if (!pollStarted) {
      pollStarted = true;
      window.setInterval(() => { if (document.visibilityState !== "hidden") void check(); }, CHECK_EVERY_MS);
    }
    if (!listenerAttached) {
      listenerAttached = true;
      window.addEventListener("focus", () => { void check(); });
      window.addEventListener("pageshow", () => { void check(); });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void check();
      });
    }
    return allowed;
  })();
  return gatePromise;
}

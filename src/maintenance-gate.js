import { NEON_DATA_API_URL, activeSession, looplyClient } from "./neon-production-client.js";
import { evaluateMaintenanceAccess } from "./maintenance-decision.js";

// A single, fail-closed check runs before every production page controller.
// Postgres remains the authority: client state never grants an ADM bypass.
const CHECK_EVERY_MS = 1000;
let gatePromise = null;
let checkInFlight = null;
let blocked = false;
let pollStarted = false;
let listenerAttached = false;

function maintenanceScreen(reason = 'maintenance') {
  if (blocked && document.querySelector(".looply-maintenance-screen")) return;
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
    title.textContent = reason === "suspended" ? "Acesso suspenso" : "Em manutenção";
    title.style.cssText = "font:700 clamp(24px,6vw,36px)/1.2 system-ui,sans-serif;margin:0;color:inherit";
    const info = document.createElement("p");
    info.textContent = reason === "suspended" ? "Esta conta está suspensa." : "Aguarde um tempo.";
    info.style.cssText = "font:400 16px/1.5 system-ui,sans-serif;margin:0;color:inherit";
    screen.append(title, info);
    if (reason === "suspended") {
      const leave = document.createElement("button");
      leave.type = "button";
      leave.textContent = "Sair";
      leave.style.cssText = "background:#222;color:#fff;border:0;padding:12px 26px;border-radius:14px;font:600 15px system-ui,sans-serif;min-height:44px;cursor:pointer";
      leave.onclick = async () => {
        leave.disabled = true;
        try { await looplyClient.auth.signOut(); }
        catch { /* A conta suspensa já não pode criar outra sessão. */ }
        window.location.replace(new URL("login.html", document.baseURI).href);
      };
      screen.append(leave);
    }
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

// Both the UI and the pre-controller gate consult the same authenticated
// Data API authorization. Local usernames never establish administrator access.
export async function verifiedPeixinhoAdmin() {
  try {
    const session = await activeSession();
    if (!session?.access_token) return false;
    const decision = await evaluateMaintenanceAccess({
      session, dataApiUrl: NEON_DATA_API_URL
    });
    return decision.verifiedAdmin === true;
  } catch {
    return false;
  }
}

async function verifyAccess() {
  let session;
  try {
    session = await activeSession();
  } catch (error) {
    // Never prevent Peixinho from reaching the login form to restore an
    // expired/broken session; actual app routes remain securely gated.
    if (loginOrEntryPage()) return true;
    throw error;
  }
  if (!session?.access_token) {
    if (loginOrEntryPage()) return true;
    window.location.replace(new URL("login.html", document.baseURI).href);
    return false;
  }
  // Suspensions are checked independently of maintenance status.
  // A "maintenance off" result cannot let a banned identity back into the app.
  const accessResponse = await fetch(NEON_DATA_API_URL + "/rpc/v54_self_account_access", {
    method: "POST", cache: "no-store",
    headers: { authorization: "Bearer " + session.access_token,
      accept: "application/json", "content-type": "application/json" },
    body: "{}"
  });
  if (!accessResponse.ok) throw Error("account_access_status_unavailable");
  let access = await accessResponse.json();
  if (Array.isArray(access)) access = access.length === 1 ? access[0] : null;
  if (access && typeof access === "object" && Object.hasOwn(access,"v54_self_account_access"))
    access = access.v54_self_account_access;
  if (!access || access.allowed !== true) {
    if (access?.suspended === true) throw Error("user_suspended");
    window.location.replace(new URL("login.html", document.baseURI).href);
    return false;
  }
  const decision = await evaluateMaintenanceAccess({
    session, dataApiUrl: NEON_DATA_API_URL
  });
  return decision.allowed === true;
}

async function check() {
  if (checkInFlight) return checkInFlight;
  checkInFlight = (async () => {
    let allowed = false, suspended = false;
    try { allowed = await verifyAccess(); }
    catch (error) {
      suspended = error?.message === "user_suspended";
      if (!suspended) console.warn("Looply access authorization unavailable", error?.message || "network");
    }
    if (!allowed) maintenanceScreen(suspended ? "suspended" : "maintenance");
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

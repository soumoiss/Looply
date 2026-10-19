import "./theme.js";
import { isSupabaseConfigured, supabase } from "./supabase.js";

const SPLASH_DURATION_MS = 7000;
const SESSION_CHECK_LIMIT_MS = 6500;
const startedAt = performance.now();

function delay(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function resolveInitialDestination() {
  if (!isSupabaseConfigured || !supabase) return "login.html";
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      delay(SESSION_CHECK_LIMIT_MS).then(() => null)
    ]);
    return result?.data?.session ? "home.html" : "login.html";
  } catch (error) {
    console.error("Looply initial session check failed", error);
    return "login.html";
  }
}

const destinationPromise = resolveInitialDestination();
await delay(Math.max(0, SPLASH_DURATION_MS - (performance.now() - startedAt)));
const destination = await destinationPromise;
window.location.replace(destination);

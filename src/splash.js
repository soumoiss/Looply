import "./theme.js";
import { isSupabaseConfigured, supabase } from "./supabase.js";
import { captureIncomingSharedLink } from "./shared-link.js";

// Capture share-sheet parameters before the splash redirects to login or home.
captureIncomingSharedLink();

export const SPLASH_DURATION_MS = 7000;
const SESSION_CHECK_LIMIT_MS = 6000;
const audioContext = window.AudioContext || window.webkitAudioContext;
let splashAudio = null;

const delay = (ms) => new Promise(resolve => window.setTimeout(resolve, ms));

async function resolveSession() {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const response = await Promise.race([
      supabase.auth.getSession(),
      delay(SESSION_CHECK_LIMIT_MS).then(() => ({ data: { session: null }, timedOut: true }))
    ]);
    return response?.data?.session || null;
  } catch (error) {
    console.error("Looply initial session check failed", error);
    return null;
  }
}

/* Som original sintetizado com Web Audio: uma assinatura curta de inicialização,
   sem arquivo externo e sem reproduzir uma melodia protegida. */
function startSplashSound() {
  if (!audioContext) return;
  try {
    if (splashAudio) {
      splashAudio.resume?.().catch(() => {});
      return;
    }
    const context = new audioContext();
    splashAudio = context;
    context.resume?.().catch(() => {});
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.08);
    master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 6.7);
    master.connect(context.destination);
    const notes = [261.63, 329.63, 392, 523.25, 392, 329.63, 293.66, 392, 523.25];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      const start = context.currentTime + 0.12 + index * 0.27;
      oscillator.type = index % 3 === 0 ? "square" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.35, start + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      oscillator.connect(envelope).connect(master);
      oscillator.start(start);
      oscillator.stop(start + 0.24);
    });
    window.setTimeout(() => context.close().catch(() => {}), 6900);
  } catch (error) {
    console.debug("Looply splash audio unavailable", error);
  }
}

const startAudioOnce = () => {
  startSplashSound();
};
["pointerdown", "keydown", "touchstart"].forEach(type => window.addEventListener(type, startAudioOnce, { once: true, passive: true }));
startAudioOnce();

const sessionPromise = resolveSession();
const splashTimer = delay(SPLASH_DURATION_MS);
const [session] = await Promise.all([sessionPromise, splashTimer]);
const destination = session ? "home.html" : "login.html";
window.location.replace(destination);

// Login Neon em HOMOLOGAÇÃO. Nunca substitui a sessão Supabase na produção.
import { createClient, SupabaseAuthAdapter } from "https://esm.sh/@neondatabase/neon-js@0.7.0-beta?bundle";
import "./theme.js";

const neon = createClient({
  auth: {
    url: "https://ep-fancy-smoke-b7d6t1s6.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth",
    adapter: SupabaseAuthAdapter()
  },
  dataApi: { url: "https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1" }
});
const identities = Object.freeze({
  patati: "patati@loooply.app",
  gaberinjela: "gaberinjela@loooply.app",
  misol: "misol@loooply.app",
  yara: "yara@loooply.app",
  peixinho: "peixinho@loooply.app",
  eukeiliane: "keilageo@loooply.app"
});
const form = document.getElementById("loginForm");
const msg = document.getElementById("message");
const btn = document.getElementById("loginButton");
const pw = document.getElementById("password");
const visible = document.getElementById("neonAccount");
const name = document.getElementById("neonAccountName");
const userName = document.getElementById("neonAccountUser");
document.getElementById("invitePasswordForm")?.remove();
function status(text, error = false) {
  msg.textContent = text;
  msg.dataset.kind = error ? "error" : "success";
  msg.classList.add("show");
}
function loginEmail(identity) {
  const value = String(identity || "").trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return value;
  return /^[a-z0-9_]{3,30}$/.test(value) ? identities[value] || null : null;
}
async function showSession() {
  const session = await neon.auth.getSession();
  if (!session?.data?.session) return false;
  // IDs are NEVER claimed from the login form.
  const result = await neon.from("v3_self_profile")
    .select("id,username,display_name,bio").limit(2);
  const profile = result.data?.[0];
  if (result.error || result.data?.length !== 1 || !profile?.id) {
    status("A sessão Neon existe, mas o perfil original ainda não pôde ser vinculado.", true);
    return false;
  }
  form.hidden = true;
  visible.hidden = false;
  name.textContent = profile.display_name || profile.username;
  userName.textContent = "@" + profile.username;
  status("Sessão Neon e perfil original confirmados. Teste concluído.");
  return true;
}
document.getElementById("togglePassword")?.addEventListener("click", () => {
  const hide = pw.type === "text";
  pw.type = hide ? "password" : "text";
  document.getElementById("togglePassword").setAttribute("aria-pressed", String(!hide));
});
form?.addEventListener("submit", async event => {
  event.preventDefault();
  const fields = new FormData(form);
  const email = loginEmail(fields.get("username"));
  const password = String(fields.get("password") || "");
  if (!email || !password || password.length > 256) {
    status("Informe um usuário/e-mail válido e uma senha.", true);
    return;
  }
  btn.disabled = true;
  btn.textContent = "Entrando…";
  try {
    const result = await neon.auth.signInWithPassword({ email, password });
    if (result.error || !result.data?.session) {
      status("O Neon não confirmou este login. Confira a senha e a ativação da conta.", true);
      return;
    }
    await showSession();
  } catch {
    status("Não foi possível alcançar a autenticação Neon. Nenhum acesso foi confirmado.", true);
  } finally {
    pw.value = "";
    btn.disabled = false;
    btn.textContent = "Avante!";
  }
});
document.getElementById("neonLogout")?.addEventListener("click", async () => {
  const result = await neon.auth.signOut();
  if (result.error) return status("Erro ao encerrar a sessão.", true);
  visible.hidden = true; form.hidden = false;
  status("Sessão de teste encerrada.");
});
void showSession().catch(() => { /* No session; form remains available. */ });

import "./theme.js";
import { isSupabaseConfigured, supabase } from "./supabase.js";
import { captureIncomingSharedLink } from "./shared-link.js";

// Preserve shared links while the user authenticates before opening the Feed.
captureIncomingSharedLink();

const form = document.getElementById("loginForm");
const message = document.getElementById("message");
const submit = document.getElementById("loginButton");
const password = document.getElementById("password");
const toggle = document.getElementById("togglePassword");
const inviteForm = document.getElementById("invitePasswordForm");
const inviteMessage = document.getElementById("inviteMessage");
const inviteFlow = new URLSearchParams(window.location.search).get("invite") === "1";

function status(element, text, kind = "error") {
  if (!element) return;
  element.textContent = text;
  element.dataset.kind = kind;
  element.classList.add("show");
}

function isServiceUnavailable(error) {
  const statusCode = Number(error?.context?.status ?? error?.status ?? 0);
  return statusCode === 402 || statusCode === 429 || statusCode >= 500 || error?.name === "FunctionsFetchError";
}

if (toggle && password) {
  toggle.addEventListener("click", () => {
    const showing = password.type === "text";
    password.type = showing ? "password" : "text";
    toggle.setAttribute("aria-pressed", String(!showing));
    toggle.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
  });
}

if (!isSupabaseConfigured || !supabase) {
  status(message, "O login não está configurado. Confira config.js.");
} else {
  const { data: sessionData } = await supabase.auth.getSession();
  const requestedNext = new URLSearchParams(window.location.search).get("next");
  const nextPage = requestedNext && /^[a-z0-9_-]+\.html$/i.test(requestedNext) ? requestedNext : "home.html";

  if (inviteFlow) {
    if (form) form.hidden = true;
    if (inviteForm) inviteForm.hidden = false;
    if (!sessionData.session) {
      status(inviteMessage, "Este convite expirou ou já foi utilizado. Peça ao administrador um novo convite.");
      const button = inviteForm?.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
    } else {
      status(inviteMessage, "Convite confirmado. Crie uma senha para ativar sua conta.", "success");
    }

    inviteForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(inviteForm);
      const newPassword = String(values.get("password") || "");
      const confirmation = String(values.get("confirmPassword") || "");
      if (newPassword.length < 12 || newPassword.length > 256) {
        status(inviteMessage, "Use uma senha de 12 a 256 caracteres.");
        return;
      }
      if (newPassword !== confirmation) {
        status(inviteMessage, "As senhas não coincidem.");
        return;
      }
      const button = inviteForm.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        status(inviteMessage, "Conta ativada. Entrando no Looply…", "success");
        window.location.replace("home.html");
      } catch (error) {
        console.error("Looply invitation password setup failed", error);
        status(inviteMessage, "Não foi possível definir a senha. Abra novamente o link do convite ou solicite outro ao administrador.");
        if (button) button.disabled = false;
      }
    });
  } else {
    if (sessionData.session) window.location.replace(nextPage);

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const username = String(formData.get("username") || "").trim().toLowerCase();
      const secret = String(formData.get("password") || "");
      message.classList.remove("show");
      if (!/^[a-z0-9_]{3,30}$/.test(username) || !secret || secret.length > 256) {
        status(message, "Usuário ou senha incorretos.");
        return;
      }

      submit.disabled = true;
      submit.textContent = "Entrando…";
      try {
        const { data, error } = await supabase.functions.invoke("looply-login", {
          body: { username, password: secret }
        });
        if (error && isServiceUnavailable(error)) {
          // The Edge Functions gateway may be unavailable while PostgREST and Auth still work.
          // The database checks the password and returns the account email only on success.
          // No address or password hash is published with the site.
          const { data: resolvedEmail, error: lookupError } = await supabase.rpc("looply_login_fallback", {
            p_username: username,
            p_password: secret
          });
          if (lookupError) throw new Error("fallback_unavailable", { cause: lookupError });
          if (typeof resolvedEmail !== "string" || !resolvedEmail) throw new Error("fallback_not_verified");
          const { error: fallbackAuthError } = await supabase.auth.signInWithPassword({
            email: resolvedEmail,
            password: secret
          });
          if (fallbackAuthError) throw new Error("fallback_auth_failed", { cause: fallbackAuthError });
          window.location.replace(nextPage);
          return;
        }
        if (error || !data?.access_token || !data?.refresh_token) throw error || new Error("invalid_credentials");
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });
        if (sessionError) throw sessionError;
        window.location.replace(nextPage);
      } catch (error) {
        console.error("Looply username login failed", error);
        if (error?.message === "fallback_not_verified") {
          status(message, "Não foi possível validar este usuário e senha. Após muitas tentativas, aguarde 15 minutos para tentar de novo.");
        } else if (error?.message === "fallback_unavailable" || error?.message === "fallback_auth_failed" || isServiceUnavailable(error)) {
          status(message, "O serviço de autenticação está indisponível. O acesso secundário também não conseguiu concluir sua sessão.");
        } else {
          status(message, "Usuário ou senha incorretos. Se você acabou de receber um convite, confirme-o e defina sua senha primeiro.");
        }
        submit.disabled = false;
        submit.textContent = "Avante!";
      }
    });
  }
}

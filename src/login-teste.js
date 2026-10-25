import { supabase, isSupabaseConfigured } from "./supabase.js";
import { authenticateOriginalAccount } from "./auth-gateway.js";

const form = document.getElementById("testLogin");
const message = document.getElementById("message");
const submit = document.getElementById("submit");
const loggedIn = document.getElementById("loggedIn");
const password = document.getElementById("password");

function show(text, error = false) {
  message.textContent = text;
  message.dataset.error = String(error);
}

function displayProfile(profile) {
  document.getElementById("profileName").textContent = profile.displayName;
  document.getElementById("profileUsername").textContent = "@" + profile.username;
  document.getElementById("profileBio").textContent = profile.bio || "Perfil carregado.";
  form.hidden = true;
  loggedIn.hidden = false;
  show("Login confirmado. Sua conta e o perfil original estão vinculados.");
}

async function loadCurrentProfile() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) return;
  const result = await supabase.from("profiles")
    .select("id,username,display_name,bio")
    .eq("id", data.user.id).maybeSingle();
  if (result.error || !result.data || result.data.id !== data.user.id) return;
  displayProfile({
    displayName: result.data.display_name || result.data.username,
    username: result.data.username, bio: result.data.bio || ""
  });
}

if (!isSupabaseConfigured || !supabase) {
  form.hidden = true;
  show("O provedor do projeto original não está configurado.", true);
} else {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    submit.textContent = "Validando…";
    show("");
    try {
      const data = new FormData(form);
      const profile = await authenticateOriginalAccount(
        supabase,
        String(data.get("identity") || ""),
        String(data.get("password") || "")
      );
      displayProfile(profile);
    } catch (error) {
      const known = {
        invalid_identity: "Informe um nome de usuário válido ou um e-mail completo.",
        invalid_credentials: "Usuário/e-mail ou senha não reconhecidos.",
        rate_limited: "Muitas tentativas de login. Tente novamente mais tarde.",
        session_not_created: "O servidor não confirmou a sessão. Tente novamente.",
        profile_unavailable: "Sua conta foi autenticada, mas o perfil ainda não pôde ser carregado.",
        login_unavailable: "O serviço original está temporariamente indisponível."
      };
      show(known[error?.message] || "Não foi possível concluir a autenticação.", true);
    } finally {
      password.value = "";
      submit.disabled = false;
      submit.textContent = "Testar meu acesso";
    }
  });

  document.getElementById("logout").addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return show("Não foi possível encerrar a sessão.", true);
    loggedIn.hidden = true;
    form.hidden = false;
    show("Você saiu da sua conta.");
  });

  void loadCurrentProfile().catch(() => {
    // An inaccessible or expired session never unlocks the profile.
  });
}

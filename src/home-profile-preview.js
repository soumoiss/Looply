// Home-only identity preview. Counts are queried from Neon; never invent a follower graph.
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);

export function bindHomeProfilePreview({ root, client, user, profile }) {
  if (!root || root.__homeProfileBound) return;
  root.__homeProfileBound = true;
  const dialog = document.createElement("dialog");
  dialog.className = "home-hybrid-profile-dialog";
  dialog.setAttribute("aria-label", "Prévia de perfil no Looply");
  dialog.innerHTML = '<section class="hybrid-profile-card">' +
    '<button type="button" class="hybrid-profile-close" data-hybrid-profile-close aria-label="Fechar prévia de perfil">×</button>' +
    '<div class="hybrid-profile-avatar" data-hybrid-profile-avatar></div>' +
    '<h2 data-hybrid-profile-name>Perfil</h2><p class="hybrid-profile-handle" data-hybrid-profile-handle></p>' +
    '<p class="hybrid-profile-bio" data-hybrid-profile-bio></p>' +
    '<div class="hybrid-profile-metrics" aria-label="Estatísticas reais do perfil">' +
      '<div><strong data-hybrid-post-count>—</strong><small>Posts visíveis</small></div>' +
      '<div><strong data-hybrid-follower-count>—</strong><small>Seguidores</small></div>' +
      '<div><strong data-hybrid-following-count>—</strong><small>Seguindo</small></div>' +
    '</div><p class="hybrid-profile-note" data-hybrid-profile-status role="status"></p>' +
    '<a class="hybrid-profile-primary" data-hybrid-profile-self href="perfil.html" hidden>Meu perfil e configurações</a>' +
    '<button class="hybrid-profile-primary" data-hybrid-profile-follow type="button" disabled hidden>Seguir · em breve</button>' +
    '</section>';
  root.append(dialog);
  const one = s => dialog.querySelector(s);
  let generation = 0;
  const close = () => { ++generation; if (dialog.open) dialog.close(); else dialog.removeAttribute("open"); };
  one("[data-hybrid-profile-close]").addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) close(); });

  async function open(profileId) {
    if (!profileId) return;
    const localGeneration = ++generation;
    one("[data-hybrid-profile-avatar]").replaceChildren();
    one("[data-hybrid-profile-name]").textContent = "Carregando perfil…";
    one("[data-hybrid-profile-handle]").textContent = "";
    one("[data-hybrid-profile-bio]").textContent = "";
    one("[data-hybrid-post-count]").textContent = "—";
    // There is no follow/follower relation in the current Neon schema. Do not use fictitious '0'.
    one("[data-hybrid-follower-count]").textContent = "—";
    one("[data-hybrid-following-count]").textContent = "—";
    one("[data-hybrid-profile-status]").textContent = "Estatísticas sendo carregadas.";
    const mine = profileId === user.id;
    one("[data-hybrid-profile-self]").hidden = !mine;
    one("[data-hybrid-profile-follow]").hidden = mine;
    if (!dialog.open) { try { dialog.showModal(); } catch { dialog.setAttribute("open",""); } }
    try {
      const profileRequest = mine
        ? Promise.resolve({ data: profile, error: null })
        : client.from("profiles").select("id,username,display_name,bio,avatar_path").eq("id",profileId).maybeSingle();
      const [identity, posts] = await Promise.all([
        profileRequest,
        client.from("posts").select("id", { count:"exact", head:true }).eq("author_id", profileId)
      ]);
      if (localGeneration !== generation || !dialog.open) return;
      if (identity.error || !identity.data) throw identity.error || new Error("Perfil não encontrado.");
      const person = identity.data;
      one("[data-hybrid-profile-name]").textContent = person.display_name || person.username || "Usuário";
      one("[data-hybrid-profile-handle]").textContent = person.username ? "@" + person.username : "";
      one("[data-hybrid-profile-bio]").textContent = person.bio || "";
      if (!posts.error && Number.isFinite(posts.count)) {
        one("[data-hybrid-post-count]").textContent = new Intl.NumberFormat("pt-BR").format(posts.count);
      }
      one("[data-hybrid-profile-status]").textContent = "Seguidores e seguindo aparecerão quando a função de seguir usuários estiver disponível.";
      const host = one("[data-hybrid-profile-avatar]");
      host.textContent = (person.display_name || person.username || "?").slice(0,1).toUpperCase();
      let signed = mine ? (profile.avatarUrl || "") : "";
      if (!signed && person.avatar_path) {
        const response = await client.storage.from("looply-avatars").createSignedUrl(person.avatar_path, 1200);
        if (!response.error) signed = response.data?.signedUrl || "";
      }
      if (signed && localGeneration === generation && dialog.open && /^https:\/\//i.test(signed)) {
        const img = document.createElement("img");
        img.alt = ""; img.referrerPolicy = "no-referrer"; img.src = signed;
        img.onerror = () => img.remove();
        host.replaceChildren(img);
      }
    } catch (error) {
      if (localGeneration !== generation) return;
      one("[data-hybrid-profile-name]").textContent = "Perfil indisponível";
      one("[data-hybrid-profile-status]").textContent = "Não foi possível carregar este perfil agora.";
      console.warn("Home profile preview", error);
    }
  }
  root.addEventListener("click", event => {
    const trigger = event.target.closest("[data-home-profile-peek], [data-profile-open]");
    if (!trigger) return;
    event.preventDefault();
    const profileId = trigger.dataset.profileOpen || user.id;
    void open(profileId);
  });
  const globalProfile = document.querySelector(".looply-account-menu > summary");
  // Keep the real global header markup; only Home substitutes an identity preview for the summary action.
  if (globalProfile) {
    globalProfile.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      globalProfile.closest("details")?.removeAttribute("open");
      void open(user.id);
    }, { capture: true });
  }
  window.addEventListener("pagehide", () => dialog.remove(), { once:true });
}

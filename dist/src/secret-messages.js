function escapeSecret(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export async function mountSecretMessages(client, userId, isAdmin = false) {
  if (!client || !userId || isAdmin) return;
  let record;
  try {
    const { data, error } = await client.from("secret_messages")
      .select("id,title,content,media_url,created_at")
      .eq("recipient_id", userId).eq("is_read", false)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw error;
    record = data;
  } catch (error) {
    console.warn("Looply Secret VIP message check unavailable", error);
    return;
  }
  if (!record || document.querySelector("[data-secret-vip-modal]")) return;

  let mediaUrl = "";
  if (record.media_url) {
    try {
      const { data, error } = await client.storage.from("looply-secret-messages").createSignedUrl(record.media_url, 300);
      if (error) throw error;
      mediaUrl = data?.signedUrl || "";
    } catch (error) { console.warn("Secret VIP media unavailable", error); }
  }

  const overlay = document.createElement("div");
  overlay.className = "secret-vip-overlay";
  overlay.dataset.secretVipModal = "";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "secretVipTitle");
  const title = escapeSecret(record.title || "Um recado especial para você 🤫");
  overlay.innerHTML = `<article class="secret-vip-modal">
    <button type="button" class="secret-vip-close" data-secret-close aria-label="Fechar recado">×</button>
    <div class="secret-vip-seal" aria-hidden="true">💌</div>
    <p class="secret-vip-kicker">RECADO SECRETO DE PEIXINHO</p>
    <h2 id="secretVipTitle">${title}</h2>
    <div class="secret-vip-content"></div>
    ${mediaUrl ? `<a class="secret-vip-media-link" href="${escapeSecret(mediaUrl)}" target="_blank" rel="noopener noreferrer"><img class="secret-vip-media" src="${escapeSecret(mediaUrl)}" alt="Imagem do recado secreto" loading="eager"></a><p class="secret-vip-media-hint">Toque na imagem para ampliar</p>` : ""}
    <button type="button" class="primary-button secret-vip-read" data-secret-mark-read>Guardar no Coração ❤️</button>
    <p class="secret-vip-status" data-secret-status role="status" aria-live="polite"></p>
  </article>`;
  overlay.querySelector(".secret-vip-content").textContent = record.content;
  document.body.append(overlay);
  document.body.classList.add("secret-vip-open");
  const close = () => {
    overlay.classList.add("is-closing");
    window.setTimeout(() => { overlay.remove(); document.body.classList.remove("secret-vip-open"); }, 180);
  };
  overlay.querySelector("[data-secret-close]").addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  const mark = overlay.querySelector("[data-secret-mark-read]");
  mark.addEventListener("click", async () => {
    mark.disabled = true;
    const status = overlay.querySelector("[data-secret-status]");
    status.textContent = "Guardando seu recado…";
    try {
      const { error } = await client.from("secret_messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", record.id).eq("recipient_id", userId).eq("is_read", false);
      if (error) throw error;
      overlay.classList.add("secret-vip-celebrate");
      status.textContent = "Recado guardado com carinho ❤️";
      window.setTimeout(close, 750);
    } catch (error) {
      console.error("Secret VIP mark-read failed", error);
      status.textContent = "Não foi possível marcar como lido. Confira sua conexão e tente novamente.";
      mark.disabled = false;
    }
  });
  overlay.querySelector("[data-secret-close]").focus({ preventScroll: true });
}

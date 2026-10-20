function escapeSecret(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export async function mountSecretMessages(client, userId, isAdmin = false) {
  if (!client || !userId) return;
  let query;
  try {
    query = await client.from("secret_messages")
      .select("id,title,content,media_url,created_at")
      .eq("recipient_id", userId).eq("is_read", false)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
  } catch (error) {
    console.warn("Looply secret message lookup unavailable", error);
    return;
  }
  if (query.error || !query.data) {
    if (query.error) console.warn("Looply secret message lookup unavailable", query.error);
    return;
  }
  const message = query.data;
  const mediaUrl = String(message.media_url || "");
  let safeMedia = "";
  try { const parsed = new URL(mediaUrl); if (parsed.protocol === "https:") safeMedia = parsed.href; } catch {}
  const overlay = document.createElement("div");
  overlay.className = "secret-vip-overlay";
  overlay.setAttribute("role", "presentation");
  overlay.innerHTML = `
    <section class="secret-vip-modal" role="dialog" aria-modal="true" aria-labelledby="secretVipHeading">
      <button class="secret-vip-close" type="button" aria-label="Fechar temporariamente">×</button>
      <div class="secret-vip-seal">💌 Recado Secreto de Peixinho</div>
      <h2 id="secretVipHeading">${escapeSecret(message.title || "Um recado especial para você 🤫")}</h2>
      <div class="secret-vip-content"></div>
      ${safeMedia ? '<button type="button" class="secret-vip-media-button" aria-label="Ampliar imagem"><img src="' + escapeSecret(safeMedia) + '" alt="Mídia do recado secreto" loading="lazy"></button>' : ""}
      <button class="primary-button secret-vip-read" type="button">Guardar no Coração ❤️</button>
      <p class="secret-vip-status" role="status" aria-live="polite"></p>
    </section>`;
  overlay.querySelector(".secret-vip-content").textContent = message.content;
  document.body.append(overlay);
  const close = () => overlay.remove();
  overlay.querySelector(".secret-vip-close").addEventListener("click", close);
  overlay.querySelector(".secret-vip-media-button")?.addEventListener("click", (event) => {
    const image = event.currentTarget.querySelector("img");
    if (image?.src) window.open(image.src, "_blank", "noopener,noreferrer");
  });
  overlay.querySelector(".secret-vip-read").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const status = overlay.querySelector(".secret-vip-status");
    try {
      const { error } = await client.from("secret_messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", message.id).eq("recipient_id", userId).eq("is_read", false);
      if (error) throw error;
      status.textContent = "Recado guardado no coração ❤️";
      overlay.classList.add("is-reading");
      window.setTimeout(close, 650);
    } catch (error) {
      console.warn("Could not mark secret message as read", error);
      status.textContent = "Não foi possível marcar como lido. Tente novamente.";
      button.disabled = false;
    }
  });
}

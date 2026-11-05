export function validatePublicationInput({ text = "", mediaCount = 0, externalUrl = "" } = {}) {
  const body = String(text || "").trim();
  const files = Number(mediaCount) || 0;
  const link = String(externalUrl || "").trim();
  if (!body && !(mediaCount > 0) && !link) return { ok: false, reason: "media_or_text_required" };
  if (body.length > 5000) return { ok: false, reason: "text_too_long" };
  return { ok: true, body: body || null, externalUrl: link || null };
}

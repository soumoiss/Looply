// Authenticated identity lookup. Never accept an identity from a form parameter.
const fields = "id,username,display_name,bio,theme,avatar_path";

export async function fetchLinkedNeonProfile({ session, dataApiUrl, fetchImpl = fetch }) {
  const token = typeof session?.access_token === "string" ? session.access_token.trim() : "";
  if (!token) throw new Error("Sua sessão Neon não possui token de acesso. Entre novamente.");

  const endpoint = String(dataApiUrl || "").replace(/\/$/, "");
  if (!endpoint.startsWith("https://")) throw new Error("A consulta segura do perfil Neon está indisponível.");
  let response;
  try {
    response = await fetchImpl(`${endpoint}/v3_self_profile?select=${encodeURIComponent(fields)}&limit=2`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store"
    });
  } catch {
    throw new Error("Não foi possível conectar ao Neon para verificar o perfil.");
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("O Neon não autorizou esta sessão. Entre novamente para renovar o acesso.");
    }
    throw new Error("Não foi possível consultar o perfil vinculado no Neon.");
  }
  let rows;
  try { rows = await response.json(); }
  catch { throw new Error("O Neon retornou uma resposta de perfil inválida."); }
  if (!Array.isArray(rows)) throw new Error("O Neon retornou uma resposta de perfil inválida.");
  if (rows.length !== 1 || !rows[0]?.id) {
    throw new Error("A identidade foi autenticada, mas o perfil original ainda não está vinculado.");
  }
  return rows[0];
}

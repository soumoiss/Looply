// Authenticated identity lookup. Never accept a profile owner from a form parameter.
// Neon may briefly return no rows immediately after issuing a new session;
// retry only a bounded number of times, without inventing or changing identity IDs.
const fields = "id,username,display_name,bio,theme,avatar_path";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchLinkedNeonProfile({session, dataApiUrl, fetchImpl = fetch, sleep = wait}) {
  const token = typeof session?.access_token === "string" ? session.access_token.trim() : "";
  if (!token) throw new Error("Sua sessão Neon não possui token de acesso. Entre novamente.");

  const endpoint = String(dataApiUrl || "").replace(/\/$/, "");
  if (!endpoint.startsWith("https://")) throw new Error("A consulta segura do perfil Neon está indisponível.");
  const url = `${endpoint}/v3_self_profile?select=${encodeURIComponent(fields)}&limit=2`;
  for (let attempt = 0; attempt < 6; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {authorization: `Bearer ${token}`, accept: "application/json"},
        cache: "no-store"
      });
    } catch {
      if (attempt < 5) { await sleep(260 * (attempt + 1)); continue; }
      throw new Error("Não foi possível conectar ao Neon para verificar o perfil.");
    }
    if (!response.ok) {
      // A denied session must never be retried as an anonymous or privileged user.
      if (response.status === 401 || response.status === 403)
        throw new Error("O Neon não autorizou esta sessão. Entre novamente para renovar o acesso.");
      if ([502,503,504].includes(response.status) && attempt < 5) {
        await sleep(260 * (attempt + 1));
        continue;
      }
      throw new Error("Não foi possível consultar o perfil vinculado no Neon.");
    }
    let rows;
    try { rows = await response.json(); }
    catch { throw new Error("O Neon retornou uma resposta de perfil inválida."); }
    if (!Array.isArray(rows)) throw new Error("O Neon retornou uma resposta de perfil inválida.");
    if (rows.length === 1 && rows[0]?.id) return rows[0];
    // Multiple returned profiles are a security problem, not a transient delay.
    if (rows.length > 1 || (rows.length === 1 && !rows[0]?.id))
      throw new Error("O Neon retornou uma resposta de perfil inválida.");
    if (attempt < 5) await sleep(260 * (attempt + 1));
  }
  throw new Error("A identidade foi autenticada, mas o perfil original ainda não está vinculado.");
}

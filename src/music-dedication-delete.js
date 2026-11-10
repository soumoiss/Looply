import { readOwnDedicationForEdit } from "./music-dedication-edit.js";

/** Removal is performed by an authenticated Neon RPC enforcing sender_id in SQL. */
export async function deleteOwnDedication(client, dedicationId, userId, fetchImpl = fetch) {
  if (!dedicationId || !userId) throw Error("Dedicatória ou sessão inválida.");
  await readOwnDedicationForEdit(client, dedicationId, userId);
  const { data, error: sessionError } = await client.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (sessionError || !accessToken || !/^https:\/\//.test(client.dataApiUrl || "")) {
    throw Error("Sessão Neon indisponível.");
  }
  const response = await fetchImpl(String(client.dataApiUrl).replace(/\/$/, "") + "/rpc/v7_delete_own_music_dedication", {
    method: "POST",
    cache: "no-store",
    headers: {
      authorization: "Bearer " + accessToken,
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({ p_dedication_id: dedicationId })
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    if (failure?.code === "42501") throw Error("Somente quem enviou pode excluir esta dedicatória.");
    if (failure?.code === "PGRST202" || response.status === 404) {
      throw Error("A exclusão ainda não está habilitada no Neon.");
    }
    throw Error("O Neon não confirmou a exclusão. Tente novamente.");
  }
  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload) || payload.length !== 1 || payload[0]?.id !== dedicationId) {
    throw Error("O servidor não confirmou qual dedicatória foi excluída.");
  }
  const {data:remaining,error} = await client.from("music_dedications")
    .select("id").eq("id",dedicationId).eq("sender_id",userId).limit(1);
  if (error || !Array.isArray(remaining) || remaining.length) {
    throw Error("A exclusão não pôde ser confirmada pela leitura posterior.");
  }
  return true;
}

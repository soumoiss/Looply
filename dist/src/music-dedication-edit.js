// Dedicatory notes are author-owned. The Neon RPC updates the note alone;
// SQL RLS still protects reading, and the response is checked with a new read.
export async function readOwnDedicationForEdit(client, dedicationId, userId) {
  if (!dedicationId || !userId) throw Error("Sessão ou dedicatória inválida.");
  const { data, error } = await client.from("music_dedications")
    .select("id,sender_id,recipient_id,title,artist,dedication_note")
    .eq("id", dedicationId).eq("sender_id", userId).single();
  if (error || !data || data.id !== dedicationId || data.sender_id !== userId) {
    throw Error("Não foi possível carregar esta dedicatória com sua permissão atual.");
  }
  return data;
}

export async function saveOwnDedicationNote(client, dedicationId, userId, value, fetchImpl = fetch) {
  const note = String(value ?? "");
  if (note.length > 1000) throw Error("O texto deve ter no máximo 1.000 caracteres.");
  await readOwnDedicationForEdit(client, dedicationId, userId);
  const { data, error: sessionError } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (sessionError || !token || !/^https:\/\//.test(client.dataApiUrl || "")) throw Error("Sessão Neon indisponível.");
  const response = await fetchImpl(String(client.dataApiUrl).replace(/\/$/, "") + "/rpc/v6_update_own_music_dedication", {
    method: "POST", cache: "no-store",
    headers: { authorization: "Bearer " + token, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ p_dedication_id: dedicationId, p_note: note })
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    throw Error(failure?.code === "42501" ? "Você não tem permissão para editar esta dedicatória." : "O Neon não confirmou a edição da dedicatória.");
  }
  const result = await response.json().catch(() => null);
  if (!Array.isArray(result) || result.length !== 1 || result[0].id !== dedicationId || result[0].dedication_note !== note) {
    throw Error("O servidor não confirmou o texto atualizado.");
  }
  const saved = await readOwnDedicationForEdit(client, dedicationId, userId);
  if (saved.dedication_note !== note) throw Error("A leitura posterior não confirmou a atualização.");
  return saved;
}

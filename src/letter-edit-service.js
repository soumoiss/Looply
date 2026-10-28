// The live Cartas editor reads the full authorized Neon record, not a list preview.
// The same checks apply to UI edits and direct REST requests via the database RLS.
import { openProtectedLetter, sealLetter } from "./letters-community.js";

export const COMMUNITY_LETTER_LIMIT = 5000;
const communityColumns = "id,sender_id,recipient_id,subject,body,is_protected,password_salt,password_iv,password_ciphertext";
const archiveColumns = "id,recipient_id,original_file,is_private,is_protected,body,password_hint";

export async function fetchFullLetterForEdit(client, kind, id, userId, isAdmin = false) {
  if (!id || !userId || !["community", "archive"].includes(kind)) throw Error("Carta inválida.");
  if (kind === "archive" && !isAdmin) throw Error("Somente a administração pode editar cartas originais.");
  let query = client.from(kind === "archive" ? "archived_cards" : "community_letters")
    .select(kind === "archive" ? archiveColumns : communityColumns).eq("id", id);
  // A sender may edit their own correspondence; receiving a letter does not
  // grant edit permission. Neon RLS independently enforces this on the server.
  if (kind === "community" && !isAdmin) query = query.eq("sender_id", userId);
  const { data, error } = await query.single();
  if (error || !data || data.id !== id) throw Error("Não foi possível carregar a carta completa com sua permissão atual.");
  if (kind === "community" && !isAdmin && data.sender_id !== userId) throw Error("Edição não autorizada.");
  if (!data.is_protected && typeof data.body !== "string") throw Error("O texto completo não está disponível. Nenhuma alteração foi feita.");
  return data;
}

export async function unlockFullLetterForEdit(letter, password) {
  if (!letter?.is_protected) return String(letter?.body ?? "");
  if (!letter.password_ciphertext || !letter.password_iv || !letter.password_salt) {
    throw Error("O conteúdo desta carta original protegida não está disponível para edição.");
  }
  return openProtectedLetter(letter, password);
}

export async function saveFullLetterEdit(client, { kind, letter, userId, isAdmin = false, subject, body, password = "", newPassword = "", isPrivate, passwordHint } = {}) {
  if (!letter?.id || !userId || !["community", "archive"].includes(kind)) throw Error("Carta inválida.");
  if (kind === "archive" && !isAdmin) throw Error("Edição não autorizada.");
  if (kind === "community" && !isAdmin && letter.sender_id !== userId) throw Error("Somente o remetente pode editar esta carta.");
  const text = String(body ?? "");
  if (!text.trim()) throw Error("A carta precisa conter texto.");
  if (kind === "community" && text.length > COMMUNITY_LETTER_LIMIT) throw Error("O limite desta carta é de 5.000 caracteres.");
  const table = kind === "archive" ? "archived_cards" : "community_letters";
  let changes;
  if (kind === "archive") {
    if (letter.is_protected) throw Error("Não é possível alterar o conteúdo protegido sem a fonte original autorizada.");
    changes = { body: text };
    // Do not allow changing privacy by toggling the checkbox: original_file
    // determines the archival privacy flag via a database CHECK constraint.
    if (typeof isPrivate === "boolean" && isPrivate !== letter.is_private)
      throw Error("A privacidade da carta original não pode ser alterada neste editor.");
    if (typeof passwordHint === "string" && passwordHint !== (letter.password_hint || ""))
      changes.password_hint = passwordHint.trim();
  } else {
    const title = String(subject ?? "").trim();
    if (!title || title.length > 120) throw Error("Informe um título de até 120 caracteres.");
    changes = { subject: title };
    if (letter.is_protected) {
      // Always verify the current password first. No ciphertext is bypassed
      // and no empty preview can be substituted for an encrypted letter.
      await openProtectedLetter(letter, password);
      Object.assign(changes, await sealLetter(text, newPassword || password, title));
    } else changes.body = text;
  }

  let mutation = client.from(table).update(changes).eq("id", letter.id);
  if (kind === "community" && !isAdmin) mutation = mutation.eq("sender_id", userId);
  const { data, error } = await mutation.select(kind === "archive"
    ? "id,body,is_private,password_hint"
    : "id,subject,body,is_protected,password_salt,password_iv,password_ciphertext").single();
  if (error || !data || data.id !== letter.id) throw Error(error?.message || "O servidor não confirmou a alteração da carta.");
  if (kind === "archive" ? data.body !== text : data.subject !== changes.subject ||
      (letter.is_protected ? data.password_ciphertext !== changes.password_ciphertext : data.body !== text))
    throw Error("A gravação não corresponde ao conteúdo enviado.");

  // Read again from the authenticated Neon API before the UI announces success.
  const persisted = await fetchFullLetterForEdit(client, kind, letter.id, userId, isAdmin);
  if (kind === "archive" ? persisted.body !== text :
      persisted.subject !== changes.subject ||
      (letter.is_protected ? persisted.password_ciphertext !== changes.password_ciphertext : persisted.body !== text))
    throw Error("Não foi possível confirmar o texto atualizado após a gravação.");
  return persisted;
}

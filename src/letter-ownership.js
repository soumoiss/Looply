/** Select only the authenticated principal's letters, regardless of admin inspector selection. */
export function selectOwnLetterRecords({letters = [], originalCards = [], hiddenSent = new Set()} = {}, authenticatedUserId) {
  if (typeof authenticatedUserId !== "string" || !authenticatedUserId.trim())
    return { received: [], sent: [], originals: [] };
  const received = letters.filter(letter => letter?.recipient_id === authenticatedUserId);
  const sent = letters.filter(letter => letter?.sender_id === authenticatedUserId && !hiddenSent.has("community:" + letter.id));
  const originals = originalCards.filter(card => card?.recipient_id === authenticatedUserId);
  return { received, sent, originals };
}

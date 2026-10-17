const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestedConversationId(search) {
  const params = new URLSearchParams(search || "");
  const values = params.getAll("id");
  if (values.length !== 1) return null;
  const id = values[0].trim();
  return UUID_PATTERN.test(id) ? id : null;
}

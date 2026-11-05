export function matchesConversationFilter(conversation, filter, favoriteIds = new Set()) {
  const kind = String(conversation?.kind || "");
  const id = String(conversation?.id || "");
  const unreadCount = Number(conversation?.unreadCount);

  if (filter === "groups") return kind === "group";
  if (filter === "unread") return Number.isFinite(unreadCount) && unreadCount > 0;
  if (filter === "favorites") return favoriteIds.has(id);
  return true;
}

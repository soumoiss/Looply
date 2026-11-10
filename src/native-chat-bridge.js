// Optional compatibility snapshot for Android's encrypted native chat cache.
// Neon access checks still happen online in loadThread(); this code only copies
// successfully fetched plaintext message rows to the app's private Keystore store.
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function cacheThreadForNative(account, conversation, participants, messages) {
  const bridge = typeof window !== "undefined" ? window.LooplyNativeChat : null;
  if (typeof bridge?.postMessage !== "function" ||
      !UUID.test(String(account || "")) || !UUID.test(String(conversation?.id || "")) ||
      !Array.isArray(messages) || !Array.isArray(participants)) return false;

  // Chat membership and RLS have already been verified by the caller; no
  // private content may be published without a complete online thread result.
  const peer = participants.find(item => item?.user_id !== account);
  const name = conversation.kind === "group"
    ? String(conversation.subject || "Grupo")
    : String(peer?.profile?.display_name || peer?.profile?.username || "Conversa");

  const snapshot = messages.slice(-60).flatMap(message => {
    if (!UUID.test(String(message?.id || "")) ||
        typeof message.body !== "string") return [];
    const body = message.body.trim();
    if (!body || body.length > 2000 ||
        (Array.isArray(message.media) && message.media.length && (
          body === "Compartilhou arquivos." || body === "Figurinha" ||
          body.startsWith("Mensagem de voz")))) return [];
    return [{
      id: message.id,
      author: String(message.author?.display_name || message.author?.username || "Contato").slice(0, 80),
      body,
      createdAt: String(message.created_at || "").slice(0, 42),
      mine: message.sender_id === account
    }];
  });
  if (!snapshot.length) return false;

  try {
    bridge.postMessage(JSON.stringify({
      type: "snapshot", account, conversation: conversation.id,
      title: name.slice(0, 100), messages: snapshot
    }));
    return true;
  } catch { return false; }
}

export function mountNativeChatShortcut(root) {
  if (typeof window === "undefined" ||
      typeof window.LooplyNativeChat?.postMessage !== "function") return;
  const header = root?.querySelector(".chat-sidebar .chat-heading");
  if (!header || header.querySelector("[data-native-chats]")) return;
  const button = document.createElement("a");
  button.href = "looply-native://chats";
  button.dataset.nativeChats = "true";
  button.className = "chat-premium-head-action";
  button.title = "Conversas offline";
  button.setAttribute("aria-label", "Conversas offline");
  button.textContent = "↓";
  header.append(button);
}

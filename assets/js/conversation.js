import { mountAppPage } from "../../src/page-runtime.js?v=confirm-logout-20261031";
import { bindChatEvents, chatMarkup, disposeChatRealtime, loadChatData, setupChatRealtime } from "../../src/chat.js?v=storage-safe-final-20261031";
import { setupChatEnhancements } from "../../src/chat-enhancements.js";
import { setupChatCalls } from "../../src/chat-calls.js?v=incoming-handoff-20261030";

await mountAppPage({ page: "conversation", render: async ({ root, client, user }) => {
  root.dataset.conversationPage = "true";
  const data = await loadChatData(client, user.id);
  root.innerHTML = chatMarkup(data, user.id);
  bindChatEvents(root, client, () => user.id);
  setupChatEnhancements(root, client, user.id);
  setupChatCalls(root, client, user.id);
  setupChatRealtime(client, user.id, root);
  const conversationId = new URLSearchParams(window.location.search).get("id");
  if (conversationId) root.dispatchEvent(new CustomEvent("looply:open-conversation", { detail: { conversationId } }));
  else root.querySelector("[data-chat-thread]").innerHTML = `<div class="chat-empty"><strong>Escolha uma conversa.</strong><span><a href="chat.html">Voltar à lista</a></span></div>`;
  window.addEventListener("pagehide", () => disposeChatRealtime(client), { once: true });
} });

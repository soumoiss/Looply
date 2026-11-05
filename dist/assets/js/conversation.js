import { mountAppPage } from "../../src/page-runtime.js?build=c8dfb31c1e9d8b3a";
import { bindChatEvents, chatMarkup, disposeChatRealtime, loadChatData, setupChatRealtime } from "../../src/chat.js?build=c8dfb31c1e9d8b3a";
import { setupChatEnhancements } from "../../src/chat-enhancements.js?build=c8dfb31c1e9d8b3a";
import { setupChatPremium } from "../../src/chat-premium.js?build=c8dfb31c1e9d8b3a";
import { setupOfficialMessagesModel } from "../../src/chat-reference-complete.js?build=c8dfb31c1e9d8b3a";
import { setupChatCalls } from "../../src/chat-calls.js?build=c8dfb31c1e9d8b3a";

await mountAppPage({ page: "conversation", render: async ({ root, client, user }) => {
  root.dataset.conversationPage = "true";
  const data = await loadChatData(client, user.id);
  root.innerHTML = chatMarkup(data, user.id);
  bindChatEvents(root, client, () => user.id);
  setupChatEnhancements(root, client, user.id);
  setupChatPremium(root, client, user.id);
  setupChatCalls(root, client, user.id);
  setupOfficialMessagesModel(root, client, user.id, data);
  setupChatRealtime(client, user.id, root);
  const conversationId = new URLSearchParams(window.location.search).get("id");
  if (conversationId) root.dispatchEvent(new CustomEvent("looply:open-conversation", { detail: { conversationId } }));
  else root.querySelector("[data-chat-thread]").innerHTML = `<div class="chat-empty"><strong>Escolha uma conversa.</strong><span><a href="chat.html">Voltar à lista</a></span></div>`;
  window.addEventListener("pagehide", () => disposeChatRealtime(client), { once: true });
} });

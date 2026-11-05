import { mountAppPage } from "../../src/page-runtime.js?build=f096c6dcc96f4a2c";
import { bindChatEvents, chatMarkup, disposeChatRealtime, loadChatData, setupChatRealtime } from "../../src/chat.js?build=f096c6dcc96f4a2c";
import { setupChatEnhancements } from "../../src/chat-enhancements.js?build=f096c6dcc96f4a2c";
import { setupChatPremium } from "../../src/chat-premium.js?build=f096c6dcc96f4a2c";
import { setupOfficialMessagesModel } from "../../src/chat-reference-complete.js?build=f096c6dcc96f4a2c";
import { setupChatCalls } from "../../src/chat-calls.js?build=f096c6dcc96f4a2c";

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

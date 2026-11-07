import { mountAppPage } from "../../src/page-runtime.js?v=one-session-entry-20261031";
import { bindChatEvents, chatMarkup, disposeChatRealtime, loadChatData, setupChatRealtime } from "../../src/chat.js?v=ultra-20261107-r1";
import { setupChatEnhancements } from "../../src/chat-enhancements.js?v=ttt-clean-20261103-premium";
import { setupChatPremium } from "../../src/chat-premium.js?v=ultra-20261107-r1";
import { setupOfficialMessagesModel } from "../../src/chat-reference-complete.js?v=official-model-20261104-r1";
import { setupChatCalls } from "../../src/chat-calls.js?v=incoming-handoff-20261030";

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

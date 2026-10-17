import { mountAppPage } from "../../src/page-runtime.js";
import { requestedConversationId } from "../../src/conversation-route.js";
import { bindChatEvents, chatMarkup, disposeChatRealtime, loadChatData, setupChatRealtime } from "../../src/chat.js";

await mountAppPage({ page: "conversation", render: async ({ root, client, user }) => {
  root.dataset.conversationPage = "true";
  const data = await loadChatData(client, user.id);
  root.innerHTML = chatMarkup(data, user.id);
  root.insertAdjacentHTML("afterbegin", `<a class="conversation-back" href="chat.html">← Conversas</a>`);
  bindChatEvents(root, client, () => user.id);
  setupChatRealtime(client, user.id, root);

  const conversationId = requestedConversationId(window.location.search);
  const thread = root.querySelector("[data-chat-thread]");
  if (data.error) {
    thread.innerHTML = `<div class="chat-empty" role="alert"><strong>Não foi possível carregar suas conversas.</strong><span>Verifique a conexão e atualize a página.</span></div>`;
  } else if (conversationId) {
    root.dispatchEvent(new CustomEvent("looply:open-conversation", { detail: { conversationId } }));
  } else {
    thread.innerHTML = `<div class="chat-empty"><strong>Conversa inválida ou não selecionada.</strong><span>Abra uma conversa pela lista para continuar.</span><a href="chat.html">Voltar às conversas</a></div>`;
  }
  window.addEventListener("pagehide", () => disposeChatRealtime(client), { once: true });
} });

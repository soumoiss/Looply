import { mountAppPage } from "../../src/page-runtime.js?v=incoming-handoff-20261030";
import { bindChatEvents, chatMarkup, disposeChatRealtime, loadChatData, refreshChatInPlace, setupChatRealtime } from "../../src/chat.js?v=neon-catalog-packs-20261029";
import { setupChatEnhancements } from "../../src/chat-enhancements.js";
import { setupChatCalls } from "../../src/chat-calls.js?v=incoming-handoff-20261030";
import { bindStories, disposeStoriesRealtime, loadStories, refreshStoriesInPlace, setupStoriesRealtime, storiesMarkup } from "../../src/stories.js?v=feed-media-audio-20261029";
import { loadSocialData } from "../../src/social.js";

const chatRoot = document.getElementById("pageContent");
if (chatRoot) {
  chatRoot.innerHTML = `<section class="chat-area" data-chat-area aria-labelledby="chatTitle"><div class="chat-heading"><div><span class="section-kicker">Mensagens</span><h2 id="chatTitle">Conversas</h2></div></div><div class="chat-empty" role="status">Carregando conversas…</div></section>`;
}

await mountAppPage({ page: "chat", render: async ({ root, client, user, profile }) => {
  const [dataResult, storiesResult, socialResult] = await Promise.allSettled([
    loadChatData(client, user.id), loadStories(client), loadSocialData(client)
  ]);
  const data = dataResult.status === "fulfilled" ? dataResult.value : { error: true, conversations: [], notifications: [], profiles: [] };
  const stories = storiesResult.status === "fulfilled" ? storiesResult.value : [];
  const storiesError = storiesResult.status === "rejected" ? storiesResult.reason : null;
  const socialData = socialResult.status === "fulfilled" ? socialResult.value : { people: [], peopleError: socialResult.reason };
  root.innerHTML = `${chatMarkup(data, user.id)}`;
  const storyMarkup = document.createElement("div");
  storyMarkup.innerHTML = storiesMarkup(stories, storiesError, socialData.people, socialData.peopleError, user.id, profile);
  const storyArea = storyMarkup.querySelector(".story-area");
  const storyDialogs = [...(storyArea?.querySelectorAll("dialog") || [])];
  for (const dialog of storyDialogs) root.append(dialog);
  const chatSidebar = root.querySelector(".chat-sidebar");
  if (storyArea && chatSidebar) chatSidebar.prepend(storyArea);
  else if (storyArea) root.prepend(storyArea);
  bindChatEvents(root, client, () => user.id);
  setupChatEnhancements(root, client, user.id);
  setupChatCalls(root, client, user.id);
  setupChatRealtime(client, user.id, root);
  const chatParams = new URLSearchParams(window.location.search);
  const linkedConversation = chatParams.get("conversation");
  const linkedPostUrl = chatParams.get("post");
  if (linkedConversation) {
    requestAnimationFrame(() => {
      root.dispatchEvent(new CustomEvent("looply:open-conversation", { detail: { conversationId: linkedConversation } }));
      if (linkedPostUrl) window.setTimeout(() => {
        const messageInput = root.querySelector(".chat-message-form textarea");
        if (messageInput && !messageInput.value.trim()) {
          messageInput.value = "Sobre esta publicação: " + linkedPostUrl;
          messageInput.dispatchEvent(new Event("input", { bubbles: true }));
          messageInput.focus({ preventScroll: true });
        }
      }, 450);
    });
  }
  bindStories(root, client, user.id, stories, storiesError, profile);
  setupStoriesRealtime(client, user.id, root);
  root.__looplyRefreshData = async () => {
    const [chatOk, storyOk] = await Promise.all([
      refreshChatInPlace(root, client, user.id),
      refreshStoriesInPlace(root)
    ]);
    return chatOk && storyOk;
  };
  window.addEventListener("pagehide", () => { disposeChatRealtime(client); disposeStoriesRealtime(client, root); }, { once: true });
} });

import { mountAppPage } from "../../src/page-runtime.js";
import { bindChatEvents, chatMarkup, disposeChatRealtime, loadChatData, setupChatRealtime } from "../../src/chat.js";
import { setupChatEnhancements } from "../../src/chat-enhancements.js";
import { setupChatCalls } from "../../src/chat-calls.js";
import { bindStories, disposeStoriesRealtime, loadStories, setupStoriesRealtime, storiesMarkup } from "../../src/stories.js";
import { loadSocialData } from "../../src/social.js";

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
  bindStories(root, client, user.id, stories, storiesError, profile);
  setupStoriesRealtime(client, user.id, root);
  window.addEventListener("pagehide", () => { disposeChatRealtime(client); disposeStoriesRealtime(client, root); }, { once: true });
} });

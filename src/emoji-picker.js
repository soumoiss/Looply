const categories = [
  ["Recentes", "◷"], ["Smileys & Emotion", "😀", "Carinhas"],
  ["People & Body", "👋", "Pessoas"], ["Animals & Nature", "🐱", "Animais e natureza"],
  ["Food & Drink", "🍕", "Comidas"], ["Activities", "⚽", "Atividades"],
  ["Travel & Places", "🚗", "Lugares"], ["Objects", "💡", "Objetos"],
  ["Symbols", "❤️", "Símbolos"], ["Flags", "🇧🇷", "Bandeiras"],
  ["Component", "👋🏿", "Tons de pele e cabelo"]
];

const normalize = text => text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function closeEmojiPicker(trigger) {
  trigger.nextElementSibling?.matches("[data-chat-emoji-picker]") && trigger.nextElementSibling.remove();
  trigger.setAttribute("aria-expanded", "false");
}

export function toggleEmojiPicker(trigger, { userId, onSelect, action = "Inserir", focusSearch = true }) {
  if (trigger.getAttribute("aria-expanded") === "true") {
    closeEmojiPicker(trigger);
    return;
  }
  const picker = document.createElement("div");
  picker.className = "chat-emoji-picker";
  picker.dataset.chatEmojiPicker = "";
  picker.setAttribute("role", "group");
  picker.setAttribute("aria-label", "Escolher emoji");
  picker.innerHTML = `<input type="search" placeholder="Buscar emoji" aria-label="Buscar emoji" data-chat-emoji-search>
    <nav class="chat-emoji-categories" aria-label="Categorias de emojis"></nav>
    <div class="chat-emoji-grid" data-chat-emoji-grid></div>`;

  const search = picker.querySelector("input");
  const nav = picker.querySelector("nav");
  const grid = picker.querySelector("[data-chat-emoji-grid]");
  const storageKey = `looply-chat-emoji-recent:${userId || "guest"}`;
  let recent = [];
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
    if (Array.isArray(stored)) recent = stored.filter(emoji => typeof emoji === "string").slice(0, 24);
  } catch { /* Browsing emojis works without local storage. */ }

  let activeCategory = "Smileys & Emotion";
  let emojiGroups;
  const render = () => {
    if (!emojiGroups) return;
    const query = normalize(search.value.trim());
    const choices = query
      ? Object.values(emojiGroups).flat().filter(([emoji, name]) => normalize(`${emoji} ${name}`).includes(query))
      : activeCategory === "Recentes" ? recent.map(emoji => [emoji, emoji]) : emojiGroups[activeCategory];

    grid.replaceChildren(...choices.map(([emoji, name]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.chatEmojiChoice = emoji;
      button.setAttribute("aria-label", `${action} ${name}`);
      button.title = name;
      button.textContent = emoji;
      return button;
    }));
    grid.scrollTop = 0;
    if (!choices.length) {
      const empty = document.createElement("p");
      empty.className = "chat-emoji-empty";
      empty.textContent = "Nenhum emoji";
      grid.append(empty);
    }
  };

  for (const [key, symbol, label = key] of categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.chatEmojiCategory = key;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(key === activeCategory));
    button.textContent = symbol;
    nav.append(button);
  }
  nav.addEventListener("click", event => {
    const button = event.target.closest("[data-chat-emoji-category]");
    if (!button) return;
    activeCategory = button.dataset.chatEmojiCategory;
    nav.querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    search.value = "";
    render();
  });
  grid.addEventListener("click", event => {
    const button = event.target.closest("[data-chat-emoji-choice]");
    if (!button) return;
    const emoji = button.dataset.chatEmojiChoice;
    try {
      localStorage.setItem(storageKey, JSON.stringify([emoji, ...recent.filter(item => item !== emoji)].slice(0, 24)));
    } catch { /* Recents are optional. */ }
    closeEmojiPicker(trigger);
    onSelect(emoji);
  });
  search.addEventListener("input", render);
  picker.addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target === search) event.preventDefault();
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeEmojiPicker(trigger);
      trigger.focus();
    }
  });

  trigger.insertAdjacentElement("afterend", picker);
  trigger.setAttribute("aria-expanded", "true");
  if (focusSearch) search.focus();
  void import("./emoji-picker-data.js").then(module => {
    if (!picker.isConnected) return;
    emojiGroups = module.emojiGroups;
    render();
  }).catch(() => {
    grid.textContent = "Emojis indisponíveis";
  });
}

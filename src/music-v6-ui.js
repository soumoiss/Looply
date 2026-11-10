/**
 * Interface V6 da aba Músicas. Não cria registros fictícios:
 * toda persistência, busca e reprodução continuam nos módulos oficiais.
 */
export function mountMusicV6Ui(root) {
  const shell = root.querySelector("[data-music-v6]");
  if (!shell) return;
  const adminPanel = shell.querySelector(".music-admin-playlists");
  if (adminPanel) {
    const group = document.createElement("details");
    group.className = "music-v6-admin";
    const title = document.createElement("summary");
    title.textContent = "Playlists dos usuários";
    group.append(title);
    adminPanel.before(group);
    group.append(adminPanel);
  }
  const available = new Set(["playlist", "dedications", "collection"]);
  const getComposer = () => shell.querySelector("details.music-composer");
  const getComments = () => shell.querySelector(".music-general-comments");
  const scrim = shell.querySelector("[data-music-v6-scrim]");

  function updateSheet() {
    const open = Boolean(getComposer()?.open);
    if (scrim) scrim.hidden = !open;
    shell.classList.toggle("music-v6-sheet-open", open);
  }
  function closeComposer() {
    const composer = getComposer();
    if (composer) composer.open = false;
    updateSheet();
  }
  function stopAudio() {
    shell.querySelectorAll("audio[data-music-audio]").forEach((audio) => {
      if (!audio.paused) audio.pause();
    });
  }
  function setView(view, focus = false) {
    if (!available.has(view)) return;
    closeComposer();
    const comments = getComments();
    if (comments?.open) comments.close();
    const last = shell.dataset.musicView;
    shell.dataset.musicView = view;
    shell.querySelectorAll("[data-music-v6-tab]").forEach((button) => {
      const selected = button.dataset.musicV6Tab === view;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    });
    const admin = shell.querySelector(".music-v6-admin");
    if (admin) {
      admin.hidden = view !== "playlist";
      if (view !== "playlist") admin.open = false;
    }
    const library = shell.querySelector("details.music-library-panel");
    if (library) library.open = view === "collection";
    const fab = shell.querySelector("[data-music-v6-compose]");
    if (fab) fab.hidden = view !== "dedications";
    if (last !== view) stopAudio();
  }
  function openComposer() {
    setView("dedications");
    const composer = getComposer();
    if (!composer) return;
    composer.open = true;
    updateSheet();
    const first = composer.querySelector("[data-music-open-recipients]:not(:disabled), [data-music-open-search]");
    first?.focus();
  }

  root.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-music-v6-tab]");
    if (tab && shell.contains(tab)) {
      setView(tab.dataset.musicV6Tab, true);
      return;
    }
    const toggleComments = event.target.closest("[data-music-v6-toggle-comments]");
    if (toggleComments && shell.contains(toggleComments)) {
      const panel = shell.querySelector("#" + toggleComments.getAttribute("aria-controls"));
      if (panel) {
        panel.hidden = !panel.hidden;
        toggleComments.setAttribute("aria-expanded", String(!panel.hidden));
      }
      return;
    }
    if (event.target.closest("[data-music-v6-compose]")) {
      openComposer();
      return;
    }
    if (event.target.closest("[data-music-v6-scrim]")) {
      closeComposer();
      return;
    }
    if (event.target.closest("[data-music-v6-comments-open]")) {
      closeComposer();
      const dialog = getComments();
      if (dialog && !dialog.open) dialog.showModal();
      return;
    }
    if (event.target.closest("[data-music-v6-comments-close]")) {
      getComments()?.close();
      return;
    }
  });
  root.addEventListener("toggle", (event) => {
    if (event.target.matches?.("details.music-composer")) updateSheet();
  }, true);
  root.addEventListener("keydown", (event) => {
    const current = shell.querySelector('[data-music-v6-tab][aria-selected="true"]');
    if (event.target.closest("[data-music-v6-tabs]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      const tabs = Array.from(shell.querySelectorAll("[data-music-v6-tab]"));
      let i = tabs.indexOf(current);
      if (event.key === "Home") i = 0;
      else if (event.key === "End") i = tabs.length - 1;
      else i = (i + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault();
      setView(tabs[i].dataset.musicV6Tab, true);
    }
    if (event.key === "Escape" && getComposer()?.open) {
      closeComposer();
    }
  });
  if (/^#dedication-/.test(window.location.hash)) setView("dedications");
  else setView("playlist");
}

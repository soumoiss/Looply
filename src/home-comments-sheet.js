// Home-only modal for the EXISTING comment section; real forms/events remain intact.
export function bindHomeCommentsSheet(root) {
  if (!root || root.__homeCommentsBound) return;
  root.__homeCommentsBound = true;
  const dialog = document.createElement("dialog");
  dialog.className = "hybrid-comments-dialog";
  dialog.setAttribute("aria-label", "Comentários da publicação");
  dialog.innerHTML = '<div class="hybrid-comments-shell"><header class="hybrid-comments-heading"><strong>Comentários</strong><button type="button" data-hybrid-comments-close aria-label="Fechar comentários">×</button></header><div class="hybrid-comments-content" data-hybrid-comments-content></div></div>';
  root.append(dialog);
  let postId = "", section = null;
  function close() {
    if (dialog.open) dialog.close();
    const card = [...root.querySelectorAll("[data-post-card]")].find(node => node.dataset.postCard === postId);
    const target = card?.querySelector(".post-comments");
    // If the feed refreshed while the drawer was open it already has the latest comments.
    if (card && section && !target) card.append(section);
    if (section && !section.closest("[data-post-card]")) section.remove();
    if (section) section.dataset.commentsExpanded = "false";
    section = null; postId = "";
    dialog.querySelector("[data-hybrid-comments-content]").replaceChildren();
  }
  dialog.querySelector("[data-hybrid-comments-close]").addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
  // Capture precedes the legacy inline-expansion handler, preventing both UIs from opening.
  root.addEventListener("click", event => {
    const trigger = event.target.closest("[data-toggle-post-comments]");
    if (!trigger || event.target.closest("[data-reels-scroll]")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const card = trigger.closest("[data-post-card]");
    const comments = card?.querySelector(".post-comments");
    if (!card || !comments) return;
    if (dialog.open) close();
    postId = card.dataset.postCard;
    section = comments;
    section.dataset.commentsExpanded = "true";
    dialog.querySelector("[data-hybrid-comments-content]").append(section);
    try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
    dialog.querySelector(".hybrid-comments-shell").scrollTop = 0;
  }, { capture:true });
}

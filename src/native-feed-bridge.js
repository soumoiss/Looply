// Android-only bridge: public posts rendered online are copied to a small,
// account-scoped SQLite snapshot. This module does not cache private posts,
// persist signed URLs in JavaScript or substitute for server-side authorization.
const canUseBridge = () => typeof window !== "undefined" &&
  typeof window.LooplyNativeFeed?.postMessage === "function";

export function publishNativeFeedSnapshot(account, posts, error = null) {
  if (!canUseBridge() || error || !Array.isArray(posts) ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(String(account))) return false;
  try {
    const safe = posts.filter(post => post?.visibility === "public" && !post.external_url)
      .slice(0, 40).map(post => {
        const photo = (post.media || []).find(item =>
          item?.kind === "image" || /^image\//i.test(String(item?.mime_type || "")));
        return {
          id: String(post.id || ""),
          visibility: "public",
          author: String(post.author?.display_name || post.author?.username || "Looply").slice(0, 100),
          body: String(post.body || "").slice(0, 3000),
          createdAt: String(post.created_at || "").slice(0, 40),
          mediaPath: String(photo?.storage_path || "").slice(0, 160),
          imageUrl: String(photo?.signedUrl || "").slice(0, 4096)
        };
      });
    window.LooplyNativeFeed.postMessage(JSON.stringify({
      type: "snapshot", account: String(account), posts: safe
    }));
    return true;
  } catch {
    // The online feed must never fail because the optional native cache failed.
    return false;
  }
}

export function mountNativeFeedShortcut(root) {
  if (!root || !canUseBridge() || root.querySelector("[data-native-feed-shortcut]")) return;
  const feed = root.querySelector("[data-social-feed]");
  if (!feed) return;
  const link = document.createElement("a");
  link.href = "looply-native://feed";
  link.dataset.nativeFeedShortcut = "true";
  link.setAttribute("aria-label", "Abrir publicações salvas offline");
  link.title = "Feed offline";
  link.textContent = "↓ Offline";
  link.style.cssText = [
    "display:inline-flex","align-items:center","justify-content:center",
    "min-height:34px","padding:0 12px","margin:10px 16px 0 auto",
    "border-radius:18px","font:600 12px/1 system-ui,sans-serif",
    "color:var(--accent,var(--primary,#7251b1))",
    "background:var(--surface,rgba(110,81,177,.08))",
    "text-decoration:none","width:max-content"
  ].join(";");
  feed.before(link);
}

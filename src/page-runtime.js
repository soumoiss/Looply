import { bindProfileNavigation } from "./profile-navigation.js";
import { icon } from "./icons.js";
import { primaryNavigationMarkup } from "./primary-navigation.js";
import { looplyClient as supabase, selfProfile, unregisterAndroidFcmDevice } from "./neon-production-client.js?v=one-session-entry-20261031";
import { applyProfilePreferences } from "./theme.js";
import { setupGlobalCallListener } from "./global-call-listener.js?v=incoming-handoff-20261030";
import { mountGlobalAnnouncements } from "./global-announcements.js";
import { startAdminPresenceTracking, clearAdminPresenceSession } from "./admin-presence.js?v=one-entry-20261031";
import { registerLooplyServiceWorker } from "./service-worker.js";
import { mountPullToRefresh } from "./pull-to-refresh.js";
import { notificationBus } from "./notification-bus.js?v=notification-bus-20261022";
import { mountIosMotion } from "./ios-motion.js";
import { mountLiveNotificationToasts } from "./live-notification-toast.js";
import { bindAdminModeSync } from "./admin-mode.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function notice(root, text, kind = "info") {
  root.innerHTML = `<section class="panel page-notice" role="${kind === "error" ? "alert" : "status"}">${escapeHtml(text)}</section>`;
}


function renderMaintenanceScreen(root, header) {
  // No branding, icon, controls, links or user content may remain visible.
  header.replaceChildren();
  root.replaceChildren();
  document.querySelectorAll(".looply-maintenance-screen").forEach(node => node.remove());
  document.body.classList.add("looply-maintenance-active");
  const screen = document.createElement("main");
  screen.className = "looply-maintenance-screen";
  screen.setAttribute("role", "alert");
  screen.setAttribute("aria-live", "assertive");
  screen.style.cssText = "position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;flex-direction:column!important;gap:12px!important;background:#fff!important;color:#171717!important;padding:24px!important;text-align:center!important;box-sizing:border-box!important;";
  const title = document.createElement("h1");
  title.textContent = "Em manutenção";
  title.style.cssText = "font:700 clamp(24px,6vw,36px)/1.2 system-ui,sans-serif;margin:0;color:inherit";
  const info = document.createElement("p");
  info.textContent = "Aguarde um tempo.";
  info.style.cssText = "font:400 16px/1.5 system-ui,sans-serif;margin:0;color:inherit";
  screen.append(title, info);
  document.body.append(screen);
}

function headerMarkup(page, profile, admin, unreadCount) {
  const username = escapeHtml(profile.username);
  const name = escapeHtml(profile.display_name || profile.username);
  const avatar = profile.avatarUrl
    ? `<img class="looply-user-avatar" src="${escapeHtml(profile.avatarUrl)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="looply-user-initial" aria-hidden="true">${escapeHtml(name.slice(0, 1).toLocaleUpperCase("pt-BR"))}</span>`;

  const profileCurrent = page === "profile" ? " aria-current=\"page\"" : "";
  const settingsCurrent = page === "settings" ? " aria-current=\"page\"" : "";
  const usersCurrent = page === "users" ? " aria-current=\"page\"" : "";
  const adminCurrent = page === "admin" ? " aria-current=\"page\"" : "";
  const accountLinks = `<a class="account-menu-link"${profileCurrent} href="perfil.html">${icon("user")}Meu perfil</a><a class="account-menu-link"${usersCurrent} href="usuarios.html">${icon("users")}Pessoas</a><a class="account-menu-link"${settingsCurrent} href="configuracoes.html">${icon("settings")}Configurações</a>${admin ? `<button class="account-menu-link admin-mode-toggle" type="button" data-admin-mode-toggle aria-pressed="false">Ativar ADM</button><a class="account-menu-link"${adminCurrent} href="admin.html">${icon("shield")}Administração</a>` : ""}`;
  const notificationBadge = unreadCount > 0 ? `<span class="navigation-badge" aria-label="${unreadCount} não lidas">${unreadCount > 99 ? "99+" : unreadCount}</span>` : "";
  return `${page === "home" ? "" : `<a class="header-action header-back-button" href="home.html" data-page-back aria-label="Voltar para o início" title="Voltar para o início"><span aria-hidden="true">${icon("back")}</span><span class="back-label">Início</span></a>`}<a class="brand-inline" href="home.html" aria-label="Looply, início"><span class="brand-mark brand-mark-animated" aria-hidden="true"><span class="circle"><svg viewBox="0 0 100 100" fill="none"><path d="M50 15A35 35 0 0 1 85 50" stroke="currentColor" stroke-width="5"/></svg></span></span><span><strong>Looply</strong><span>MoissWorld</span></span></a>
    ${primaryNavigationMarkup(page, unreadCount)}
    <a class="header-action header-notifications" href="notificacoes.html" aria-label="Avisos"${page === "notifications" ? ' aria-current="page"' : ""}>${icon("bell")}${notificationBadge}</a>
    <details class="looply-account-menu"><summary class="looply-account" aria-label="Abrir menu da conta">${avatar}<span><strong>${name}</strong><small>@${username}${admin ? " · administrador" : ""}</small></span><span class="account-menu-caret" aria-hidden="true">${icon("menu")}</span></summary>
      <div class="account-menu-popover">${accountLinks}<button class="header-action" type="button" data-sign-out>${icon("logout")}Sair</button></div></details>`;
}

async function loadProfile(userId) {
  const data = await selfProfile();
  if (!data) throw new Error("O perfil desta conta não foi encontrado.");
  return { profile_visibility: "private", playlist_url: null, font_family: "system", font_size: "normal", ...data };
}

async function loadProfileAvatar(profile) {
  if (!profile?.avatar_path) return "";
  const { data, error } = await supabase.storage.from("looply-avatars").createSignedUrl(profile.avatar_path, 1800);
  if (error) throw error;
  return data?.signedUrl || "";
}

async function loadUnreadNotifications(client) {
  const [notifications, chats, adminNotices] = await Promise.all([
    client.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    client.from("chat_notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    // RLS reveals Peixinho's administrative events only to Peixinho.
    client.from("looply_admin_activity_notifications")
      .select("id", { count: "exact", head: true }).eq("kind", "admin_online").is("read_at", null)
  ]);
  return (notifications.error ? 0 : notifications.count || 0)
    + (chats.error ? 0 : chats.count || 0)
    + (adminNotices.error ? 0 : adminNotices.count || 0);
}

async function refreshUnreadBadge(header, client) {
  const count = await loadUnreadNotifications(client);
  const link = header.querySelector('.header-notifications[href="notificacoes.html"]');
  if (!link) return;
  let badge = link.querySelector(".navigation-badge");
  if (!count) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "navigation-badge";
    link.append(badge);
  }
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.setAttribute("aria-label", `${count} não lidas`);
}

function prefetchNavigation(header) {
  const requested = new Set();
  const prefetch = (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link || !header.contains(link) || link.target || link.hasAttribute("download")) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.endsWith(".html") || requested.has(url.href)) return;
    requested.add(url.href);
    const hint = document.createElement("link");
    hint.rel = "prefetch";
    hint.as = "document";
    hint.href = url.href;
    document.head.append(hint);
  };
  header.addEventListener("pointerover", prefetch, { passive: true });
  header.addEventListener("focusin", prefetch);
}

function showLetterNotice({title,message,buttonText,onAction}){if(document.querySelector("[data-looply-letter-notice]"))return;const overlay=document.createElement("div");overlay.dataset.looplyLetterNotice="true";overlay.style.cssText="position:fixed;inset:0;z-index:10050;background:rgba(20,15,30,.62);display:grid;place-items:center;padding:20px";const panel=document.createElement("section");panel.setAttribute("role","alertdialog");panel.setAttribute("aria-modal","true");panel.style.cssText="width:min(100%,440px);background:var(--panel,#fff);color:var(--text,#222);border-radius:20px;padding:24px;box-shadow:0 20px 70px #0005";const h=document.createElement("h2");h.textContent=title;const p=document.createElement("p");p.textContent=message;const b=document.createElement("button");b.type="button";b.className="primary-button";b.textContent=buttonText;b.addEventListener("click",async()=>{b.disabled=true;try{await onAction();overlay.remove()}catch(e){console.warn("Letter notice action failed",e);b.disabled=false}});panel.append(h,p,b);overlay.append(panel);document.body.append(overlay);b.focus()}
async function mountLetterEventNotices(client,user,page){try{/* Sender "letter unlocked/read" notices were removed: those events now go to the silent ADM log. */const {data,error}=await client.from("letter_event_notifications").select("id,letter_id,letter_type").eq("recipient_id",user.id).eq("event_type","new_received").is("notified_at",null).order("created_at").limit(1);if(error||!data?.length)return;const n=data[0];const {data:l}=n.letter_type==="community_letter"?await client.from("community_letters").select("subject,sender:profiles!community_letters_sender_id_fkey(username,display_name)").eq("id",n.letter_id).maybeSingle():{data:null};const who=l?.sender?.display_name||l?.sender?.username||"Alguém";showLetterNotice({title:"Você recebeu uma nova carta",message:n.letter_type==="community_letter"?who+" enviou uma carta"+(l?.subject?" “"+l.subject+"”":"")+".":"Uma nova carta está disponível para você.",buttonText:"Ler carta",onAction:async()=>{const {error:e}=await client.from("letter_event_notifications").update({notified_at:new Date().toISOString()}).eq("id",n.id).eq("recipient_id",user.id);if(e)throw e;window.location.href=n.letter_type==="community_letter"?"cartas.html?letterId="+encodeURIComponent(n.letter_id):"cartas.html?cardId="+encodeURIComponent(n.letter_id)}})}catch(e){console.warn("Letter notifications unavailable",e)}}
export async function mountAppPage({ page, adminOnly = false, render }) {
  void registerLooplyServiceWorker();
  const root = document.getElementById("pageContent");
  const header = document.querySelector("[data-site-header]");
  if (!root || !header) return;

  // Prefer the persisted session first. getUser() validates against the Auth server and
  // can fail transiently on mobile networks; that must not be mistaken for a signed-out user.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  let user = sessionData?.session?.user || null;
  let userLookupError = null;
  // A getSession storage/read error must not suppress the server-side user fallback.
  // This is especially important on mobile browsers restoring a persisted session.
  if (!user) {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (!userError) user = userData?.user || null;
    else userLookupError = userError;
  }

  if (!user && (sessionError || userLookupError)) {
    console.warn("Looply auth session could not be verified", sessionError || userLookupError);
    notice(root, "Não foi possível verificar sua sessão agora. Confira sua conexão e recarregue a página.", "error");
    return;
  }

  if (!user) {
    if (page === "gallery") {
      root.innerHTML = `<section class="gallery-shell"><div class="gallery-hero"><h1 class="gallery-title">GALERIA</h1><a class="gallery-primary" href="login.html?next=galeria.html">Entrar para acessar a galeria</a></div><p class="gallery-notice" role="status">Sua sessão não foi encontrada neste navegador. Entre na sua conta para carregar as mídias.</p></section>`;
      return;
    }
    window.location.replace("login.html");
    return;
  }
  let profile;
  let isAdmin = false;
  try {
    const [profileResult, adminResult] = await Promise.allSettled([
      loadProfile(user.id), supabase.rpc("v3_self_is_admin")
    ]);
    if (profileResult.status === "rejected") throw profileResult.reason;
    profile = profileResult.value;
    isAdmin = adminResult.status === "fulfilled" && !adminResult.value?.error && adminResult.value?.data === true;
  } catch (error) {
    notice(root, error?.message || "Não foi possível carregar o perfil.", "error");
    return;
  }

  // Only the verified Peixinho administrator bypasses maintenance.
  // A username alone is never sufficient to authorize the bypass.
  const maintenanceExempt = isAdmin && String(profile.username || "").toLowerCase() === "peixinho";
  const readGlobalSettings = async () => {
    const { data, error } = await supabase.from("app_settings")
      .select("maintenance_mode").eq("id", 1).maybeSingle();
    if (error || !data || typeof data.maintenance_mode !== "boolean") {
      throw error || new Error("maintenance_state_unavailable");
    }
    return data.maintenance_mode;
  };
  let maintenanceBlocked = false;
  let maintenanceChecking = false;
  const checkMaintenance = async () => {
    if (maintenanceExempt || maintenanceChecking) return;
    maintenanceChecking = true;
    try {
      const enabled = await readGlobalSettings();
      if (enabled) {
        if (!maintenanceBlocked) {
          maintenanceBlocked = true;
          renderMaintenanceScreen(root, header);
        }
      } else if (maintenanceBlocked) {
        window.location.reload();
      }
    } catch (error) {
      // Never expose application content when its maintenance state is unknown.
      console.warn("Looply maintenance verification unavailable", error?.message || "network");
      if (!maintenanceBlocked) {
        maintenanceBlocked = true;
        renderMaintenanceScreen(root, header);
      }
    } finally {
      maintenanceChecking = false;
    }
  };
  await checkMaintenance();
  // Polling is required: the Neon bridge does not implement postgres_changes.
  // Continue checking even while the maintenance screen is displayed so that
  // access is restored automatically after the administrator disables it.
  const maintenancePollTimer = !maintenanceExempt
    ? window.setInterval(() => { void checkMaintenance(); }, 3000)
    : null;
  if (maintenanceBlocked) {
    window.addEventListener("pagehide", () => window.clearInterval(maintenancePollTimer), { once: true });
    return;
  }

  if (!profile.avatar_path && page !== "profile" && page !== "gallery") {
    window.clearInterval(maintenancePollTimer);
    window.location.replace("perfil.html?foto=obrigatoria");
    return;
  }

  if (adminOnly && !isAdmin) {
    window.clearInterval(maintenancePollTimer);
    window.location.replace("home.html");
    return;
  }

  // Initialize background features only after maintenance access is approved.
  setupGlobalCallListener(supabase, user.id, null);

  applyProfilePreferences(profile);
  header.innerHTML = headerMarkup(page, profile, isAdmin, 0);
  const stopAdminModeSync = bindAdminModeSync(header.querySelector("[data-admin-mode-toggle]"), { authorized: isAdmin });
  const stopAdminPresence = startAdminPresenceTracking(supabase, user.id);
  // Keep this control deterministic: the href rendered by headerMarkup is the destination.
  // History-based navigation can send users to an unrelated internal page instead of home.
  prefetchNavigation(header);
  mountIosMotion(header);
  const stopProfileNavigation = bindProfileNavigation({root,header,user});
  // Confirm before any auth mutation, and perform exactly one logout.
  // The auth adapter revokes this device's FCM token once (no double request).
  const logoutButton=header.querySelector("[data-sign-out]");
  const logoutDialog=document.createElement("dialog");
  logoutDialog.className="looply-logout-dialog";
  logoutDialog.setAttribute("aria-labelledby","looplyLogoutTitle");
  logoutDialog.innerHTML='<form method="dialog" class="looply-logout-card">'+
    '<h2 id="looplyLogoutTitle">Sair da sua conta?</h2>'+
    '<p>Você precisará entrar novamente para acessar o Looply.</p>'+
    '<p class="looply-logout-error" data-logout-error role="alert" hidden></p>'+
    '<div class="looply-logout-actions">'+
    '<button type="submit" value="cancel" data-logout-cancel>Cancelar</button>'+
    '<button type="button" data-logout-confirm>Confirmar saída</button></div></form>';
  document.body.append(logoutDialog);
  logoutButton?.addEventListener("click",()=>{
    header.querySelector(".looply-account-menu")?.removeAttribute("open");
    if(!logoutDialog.open)logoutDialog.showModal();
  });
  logoutDialog.querySelector("[data-logout-confirm]").addEventListener("click",async()=>{
    const confirm=logoutDialog.querySelector("[data-logout-confirm]");
    const cancel=logoutDialog.querySelector("[data-logout-cancel]");
    const status=logoutDialog.querySelector("[data-logout-error]");
    if(confirm.disabled)return;
    confirm.disabled=true;cancel.disabled=true;
    confirm.textContent="Saindo…";
    status.hidden=true;
    try{
      const {error}=await supabase.auth.signOut();
      if(error)throw error;
      clearAdminPresenceSession(user.id);
      window.location.replace("login.html");
    }catch(error){
      console.warn("Looply logout unsuccessful",error?.name||"network");
      status.textContent="Não foi possível concluir a saída. Verifique a conexão.";
      status.hidden=false;
      confirm.disabled=false;cancel.disabled=false;
      confirm.textContent="Confirmar saída";
    }
  });

  // Keep the signed avatar in the global header current without reloading
  // unsaved profile form fields. BroadcastChannel covers other open Looply tabs.
  const avatarBus=typeof BroadcastChannel==="function"?new BroadcastChannel("looply-avatar-v1"):null;
  const applyAvatarChange=detail=>{
    if(!detail?.profileId || (detail.avatarUrl && !/^https:\/\//i.test(detail.avatarUrl)))return;
    if(detail.profileId===user.id){
      if(Object.hasOwn(detail,"avatar_path"))profile.avatar_path=detail.avatar_path;
      profile.avatarUrl=detail.avatarUrl;
      const old=header.querySelector(".looply-user-avatar, .looply-user-initial");
      if(old){
        if(detail.avatarUrl){
          const img=document.createElement("img");
          img.className="looply-user-avatar";img.alt="";img.referrerPolicy="no-referrer";
          img.src=detail.avatarUrl;old.replaceWith(img);
        }else{
          const fallback=document.createElement("span");
          fallback.className="looply-user-initial";fallback.setAttribute("aria-hidden","true");
          fallback.textContent=(profile.display_name||profile.username||"?").slice(0,1).toLocaleUpperCase("pt-BR");
          old.replaceWith(fallback);
        }
      }
    }
    document.querySelectorAll("[data-profile-avatar-id]").forEach(old=>{
      if(old.dataset.profileAvatarId!==detail.profileId)return;
      if(detail.avatarUrl){
        const img=document.createElement("img");
        img.className=old.className;img.alt="";img.loading="lazy";
        img.referrerPolicy="no-referrer";img.dataset.profileAvatarId=detail.profileId;
        img.src=detail.avatarUrl;old.replaceWith(img);
      }else{
        const fallback=document.createElement("span");
        fallback.className=old.className;fallback.dataset.profileAvatarId=detail.profileId;
        fallback.setAttribute("aria-hidden","true");fallback.textContent="?";
        old.replaceWith(fallback);
      }
    });
  };
  const onLocalAvatar=e=>{applyAvatarChange(e.detail);avatarBus?.postMessage(e.detail);};
  window.addEventListener("looply:avatar-updated",onLocalAvatar);
  if(avatarBus)avatarBus.onmessage=e=>applyAvatarChange(e.data);

  const stopLiveNotices=mountLiveNotificationToasts(supabase,user.id);
  void refreshUnreadBadge(header, supabase).catch((error) => console.warn("Looply unread count refresh failed", error));
  const originalHeaderAvatarPath=profile.avatar_path;
  void loadProfileAvatar(profile).then((avatarUrl) => {
    if(profile.avatar_path!==originalHeaderAvatarPath)return;
    if (!avatarUrl) return;
    profile.avatarUrl = avatarUrl;
    const current = header.querySelector(".looply-user-avatar, .looply-user-initial");
    if (!current) return;
    const image = document.createElement("img");
    image.className = "looply-user-avatar";
    image.src = avatarUrl;
    image.alt = "";
    image.referrerPolicy = "no-referrer";
    current.replaceWith(image);
  }).catch((error) => console.warn("Looply profile avatar load failed", error));

  const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" || !session) window.location.replace("login.html");
  });

  let badgeTimer = null;
  const refreshBadgeSoon = (source) => {
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(() => { void refreshUnreadBadge(header, supabase); }, 150);
    notificationBus.emit({ type: "notification-changed", source });
  };
  const activityChannel = supabase.channel(`looply-activity-${user.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` }, () => refreshBadgeSoon("app"))
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_notifications", filter: `user_id=eq.${user.id}` }, () => refreshBadgeSoon("chat"))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, ({ new: updated }) => {
      if (updated) applyProfilePreferences(updated);
    })
    .subscribe();

  // The Neon signaling bridge intentionally does not support postgres_changes.
  // Keep the notification list and badge fresh without relying on a no-op feed.
  // Suppress background polling and trigger a refresh on tab resume.
  const pollNotifications = () => {
    if (document.visibilityState === "hidden") return;
    void refreshUnreadBadge(header, supabase);
    if (page === "notifications") notificationBus.emit({ type: "notification-changed", source: "neon-poll" });
  };
  const notificationPollTimer = window.setInterval(pollNotifications, 6000);
  window.addEventListener("focus", pollNotifications);
  document.addEventListener("visibilitychange", pollNotifications);


  try {
    await render({ root, client: supabase, user, profile, isAdmin });
  } catch (error) {
    console.error("Looply page failed to load", error);
    notice(root, "Não foi possível carregar esta página. Confira sua conexão e tente novamente.", "error");
  }

  // Mount once, after page-specific data and gesture controllers have loaded.
  // Existing page handlers update real Neon data without remounting event listeners.
  const stopPullToRefresh = mountPullToRefresh({
    root, page,
    refresh: async () => {
      if (typeof root.__looplyRefreshData === "function") {
        return (await root.__looplyRefreshData()) === true;
      }
      // Less frequent pages (administration/settings) have no safe incremental
      // renderer. A guarded, authenticated navigation is the fallback.
      if (navigator.onLine === false) return false;
      window.location.reload();
      return true;
    }
  });

  let stopGlobalAnnouncements = () => {};
  // Announcement receipts belong to the linked Looply profile, not the Neon Auth UUID.
  void mountGlobalAnnouncements({ client: supabase, user, profileId: profile.id })
    .then((cleanup) => { stopGlobalAnnouncements = cleanup; })
    .catch((error) => console.warn("Looply global announcements could not start", error));

  void mountLetterEventNotices(supabase,user,page);


  window.addEventListener("pagehide", () => {
    stopLiveNotices();
    window.removeEventListener("looply:avatar-updated",onLocalAvatar);
    avatarBus?.close();
    clearTimeout(badgeTimer);
    window.clearInterval(notificationPollTimer);
    window.removeEventListener("focus", pollNotifications);
    document.removeEventListener("visibilitychange", pollNotifications);
    authListener.subscription.unsubscribe();
    supabase.removeChannel(activityChannel);
    stopGlobalAnnouncements();
    stopPullToRefresh();
    delete root.__looplyRefreshData;
    stopAdminPresence();
    stopAdminModeSync();
    stopProfileNavigation();
    window.clearInterval(maintenancePollTimer);
  }, { once: true });
}

export { notice };


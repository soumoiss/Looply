import { mountAppPage } from "../../src/page-runtime.js?v=notification-bus-20261022";
import { notificationBus } from "../../src/notification-bus.js?v=notification-bus-20261022";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const formatLocal=(date,options)=>new Intl.DateTimeFormat("pt-BR",{
  timeZone:"America/Fortaleza",...options
}).format(date);
const dateLabel=(value)=>{
  const date=new Date(value);
  if(Number.isNaN(date.valueOf()))return "";
  const day=formatLocal(date,{year:"numeric",month:"2-digit",day:"2-digit"});
  const today=formatLocal(new Date(),{year:"numeric",month:"2-digit",day:"2-digit"});
  const clock=formatLocal(date,{hour:"2-digit",minute:"2-digit"});
  return day===today?"Hoje, "+clock:day+" às "+clock;
};

async function loadNotifications(client,isAdmin=false) {
  const [appResult,chatResult,adminResult]=await Promise.all([
    client.from("notifications").select("id,kind,resource_id,event_id,preview,created_at,read_at,actor:profiles!notifications_actor_id_fkey(username,display_name)")
      .order("created_at",{ascending:false}).order("id",{ascending:false}).range(0,99),
    client.from("chat_notifications").select("id,conversation_id,kind,preview,created_at,read_at")
      .order("created_at",{ascending:false}).order("id",{ascending:false}).range(0,99),
    isAdmin
      ? client.from("looply_admin_activity_notifications")
        .select("id,kind,resource_id,resource_label,created_at,read_at,actor:profiles!looply_admin_activity_notifications_actor_id_fkey(username,display_name)")
        .order("created_at",{ascending:false}).order("id",{ascending:false}).range(0,99)
      : Promise.resolve({data:[],error:null})
  ]);
  if(appResult.error)throw appResult.error;
  if(chatResult.error)throw chatResult.error;
  if(adminResult.error)throw adminResult.error;
  const appItems=(appResult.data||[]).map(item=>({...item,source:"app"}));
  const chatItems=(chatResult.data||[]).map(item=>({...item,source:"chat",
    kind:item.kind==="letter"?"letter":"message"}));
  const adminPreview=item=>{
    const label=String(item.resource_label||"").slice(0,120);
    if(item.kind==="admin_online")return "Entrou no aplicativo";
    if(item.kind==="admin_letter_read")return "Leu "+(label||"uma carta enviada por você");
    if(item.kind==="admin_private_unlock")return "Desbloqueou "+(label||"uma carta privada");
    return "Atividade administrativa";
  };
  const adminItems=(adminResult.data||[]).map(item=>({
    ...item,source:"admin",preview:adminPreview(item)
  }));
  return [...appItems,...chatItems,...adminItems]
    .sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
}

function notificationHref(item) {
  if (item.source === "admin") return item.kind === "admin_online" ? "usuarios.html" : "cartas.html";
  if (item.source === "chat") return `conversa.html?id=${encodeURIComponent(item.conversation_id)}`;
  if (["post", "comment", "reply", "post_like"].includes(item.kind)) return `home.html#post-${encodeURIComponent(item.resource_id)}`;
  if (item.kind === "story_like") return "home.html#stories";
  if (item.kind === "story_mention") return `home.html?storyId=${encodeURIComponent(item.resource_id)}#stories`;
  if (item.kind === "music_dedication") return `musicas.html#dedication-${encodeURIComponent(item.resource_id)}`;
  if (item.kind === "gallery_comment" || item.kind === "gallery_tag") return "galeria.html";
  return "#";
}

function notificationMarkup(item) {
  const labels = { admin_online:"Usuário online", admin_letter_read:"Carta lida", admin_private_unlock:"Carta privada desbloqueada", post: "Publicação", comment: "Comentário", reply: "Resposta", post_like: "Curtida no feed", story_like: "Curtida no story", story_mention: "Menção em story", music_dedication: "Dedicatória", gallery_comment: "Comentário na galeria", gallery_tag: "Menção na galeria", letter: "Carta", message: "Mensagem" };
  const actor = item.actor ? (item.actor.display_name || item.actor.username) : "Looply";
  return `<a class="notification-row ${item.read_at ? "is-read" : "is-unread"}" href="${notificationHref(item)}"
      data-notification-source="${item.source}" data-notification-id="${escapeHtml(item.id)}" data-notification-target="${escapeHtml(notificationHref(item))}">
    <span class="notification-dot" aria-hidden="true"></span><span class="notification-copy"><strong>${escapeHtml(labels[item.kind] || "Atividade")}</strong>
    <span><b>${escapeHtml(actor)}</b> · ${escapeHtml(item.preview)}</span><time datetime="${escapeHtml(item.created_at)}">${escapeHtml(dateLabel(item.created_at))}</time></span>
  </a>`;
}

let renderSequence = 0;
let lastNotificationSignature = "";
async function render(root, client, isAdmin=false) {
  const sequence = ++renderSequence;
  try {
    const items = await loadNotifications(client,isAdmin);
    if (sequence !== renderSequence || !root.isConnected) return;
    // Polling is necessary because Neon does not publish postgres_changes here.
    // Keep the current DOM (including touch focus and scroll) when nothing changed.
    const nextSignature = JSON.stringify(items.map(({ id, source, read_at, kind, preview, created_at }) =>
      [id, source, read_at, kind, preview, created_at]));
    if (nextSignature === lastNotificationSignature && root.querySelector("[data-notification-list]")) return;
    lastNotificationSignature = nextSignature;
    root.innerHTML = `<section class="panel notifications-panel"><div class="notifications-toolbar"><span>${items.filter((item) => !item.read_at).length} não lidas</span><button type="button" class="text-button" data-notifications-read-all ${items.some((item) => !item.read_at) ? "" : "disabled"}>Marcar todas como lidas</button></div>
      <div class="notification-list" data-notification-list>${items.length ? items.map(notificationMarkup).join("") : `<p class="notification-empty">Nenhuma notificação</p>`}</div><p class="notification-status" data-notification-status role="status" aria-live="polite"></p></section>`;
  } catch (error) {
    if (sequence !== renderSequence || !root.isConnected) return;
    console.error("Looply notification load failed", error);
    lastNotificationSignature = "";
    root.innerHTML = `<section class="panel notifications-panel"><p class="notification-empty" role="alert">Não foi possível carregar as notificações. Atualize a página e tente novamente.</p></section>`;
  }
}

await mountAppPage({ page: "notifications", render: async ({ root, client, isAdmin }) => {
  await render(root, client, isAdmin);
  const stopWatching = notificationBus.subscribeDebounced(() => { void render(root, client, isAdmin); }, 180);
  root.addEventListener("click", async (event) => {
    const markAll = event.target.closest("[data-notifications-read-all]");
    const row = event.target.closest("[data-notification-source]");
    if (!markAll && !row) return;
    if (markAll) {
      markAll.disabled = true;
      const now = new Date().toISOString();
      const [appUpdate, chatUpdate, adminUpdate] = await Promise.all([
        client.from("notifications").update({ read_at: now }).is("read_at", null),
        client.from("chat_notifications").update({ read_at: now }).is("read_at", null),
        isAdmin ? client.from("looply_admin_activity_notifications")
          .update({read_at:now}).is("read_at",null)
          : Promise.resolve({error:null})
      ]);
      if (appUpdate.error || chatUpdate.error || adminUpdate.error) {
        root.querySelector("[data-notification-status]").textContent = "Não foi possível atualizar todas as notificações.";
        markAll.disabled = false;
      } else await render(root, client, isAdmin);
      return;
    }
    event.preventDefault();
    const destination = row.dataset.notificationTarget;
    const source = row.dataset.notificationSource;
    const table = source === "chat" ? "chat_notifications" :
      source === "admin" ? "looply_admin_activity_notifications" : "notifications";
    const { error } = await client.from(table).update({ read_at: new Date().toISOString() }).eq("id", row.dataset.notificationId).is("read_at", null);
    if (error) {
      root.querySelector("[data-notification-status]").textContent = "Não foi possível marcar como lida.";
      return;
    }
    window.location.assign(destination);
  });
  window.addEventListener("pagehide", () => stopWatching(), { once: true });
} });

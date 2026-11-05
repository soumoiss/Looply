// Isolated real-time smoke test. The original chat implementation remains untouched.
import { createClient, SupabaseAuthAdapter } from "https://esm.sh/@neondatabase/neon-js@0.7.0-beta?bundle";

const client = createClient({
  auth: { url: "https://ep-fancy-smoke-b7d6t1s6.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth", adapter: SupabaseAuthAdapter() },
  dataApi: { url: "https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1" }
});
const HOST = "looply-original-realtime-staging.s0upoetamoiss.workers.dev";
const el = id => document.getElementById(id);
let socket = null;
let jwt = null;
const log = message => { el("events").textContent = (new Date().toLocaleTimeString("pt-BR") + " — " + message + "\n" + el("events").textContent).slice(0,4000); };
function state(connected) {
  el("connect").disabled = connected;
  el("typing").disabled = !connected;
  el("refresh").disabled = !connected;
  el("disconnect").disabled = !connected;
}
async function initialise() {
  const result = await client.auth.getSession();
  const session = result?.data?.session;
  jwt = session?.access_token || null;
  if (!jwt) {
    el("identity").textContent = "Acesse primeiro com sua conta pelo teste de login Neon.";
    log("Sessão Neon não encontrada.");
    return;
  }
  const response = await client.from("v3_self_profile").select("username,display_name");
  if (response.error || response.data?.length !== 1) {
    log("A sessão não conseguiu carregar o perfil. Não é possível abrir uma conversa.");
    return;
  }
  el("identity").textContent = "Conectado como @" + response.data[0].username;
  const rooms = await client.rpc("v3_list_my_conversations");
  if (rooms.error || !Array.isArray(rooms.data)) {
    log("Não foi possível listar as conversas autorizadas.");
    return;
  }
  const options = rooms.data.map(room => {
    const option = document.createElement("option");
    option.value = room.conversation_id;
    option.textContent = (room.subject || room.kind || "Conversa") + " · " + String(room.conversation_id).slice(0,8);
    return option;
  });
  el("conversation").replaceChildren(...options);
  log("Conversa(s) autorizada(s): " + rooms.data.length);
  if (!rooms.data.length) log("Esta conta não participa de nenhuma conversa do banco original.");
}
el("connect").addEventListener("click", async () => {
  if (!jwt) return log("Entre primeiro com uma conta Neon.");
  const conversation = el("conversation").value;
  if (!/^[0-9a-f-]{36}$/i.test(conversation)) return log("Escolha uma conversa autorizada.");
  el("connect").disabled = true;
  try {
    const ticketResponse = await fetch("https://" + HOST + "/api/realtime-ticket", {
      method: "POST",
      headers: { authorization: "Bearer " + jwt, "content-type": "application/json" },
      body: JSON.stringify({ conversation_id: conversation }),
      cache: "no-store"
    });
    if (!ticketResponse.ok) throw new Error("Emissão de ingresso recusada (HTTP " + ticketResponse.status + ")");
    const { ticket } = await ticketResponse.json();
    if (!/^[a-f0-9]{64}$/.test(ticket || "")) throw new Error("Ingresso inválido");
    const ws = new WebSocket("wss://" + HOST + "/api/realtime?conversation_id=" + encodeURIComponent(conversation), ["looply.ticket." + ticket]);
    socket = ws;
    ws.addEventListener("open", () => { state(true); log("WebSocket conectado e autorizado."); });
    ws.addEventListener("message", event => {
      try {
        const data = JSON.parse(event.data);
        // Never print raw WebRTC SDP or token values.
        if (data.type === "signal") return log("Sinal de chamada recebido de outro participante.");
        log("Evento: " + String(data.type || "desconhecido") + (data.user_id ? " (" + data.user_id.slice(0,8) + ")" : ""));
      } catch { log("Recebido evento não reconhecido."); }
    });
    ws.addEventListener("close", event => { state(false); log("WebSocket encerrado (código " + event.code + ")."); if(socket===ws) socket=null; });
    ws.addEventListener("error", () => log("Erro de conexão. Confira autorizações e Worker."));
  } catch (error) {
    state(false); log(error.message || "Falha de conexão");
  }
});
el("typing").addEventListener("click", () => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "typing", active: true }));
});
el("refresh").addEventListener("click", () => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "invalidate" }));
});
el("disconnect").addEventListener("click", () => socket?.close(1000,"manual_disconnect"));
void initialise().catch(() => log("Falha ao consultar Neon Auth ou Data API."));

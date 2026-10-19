import { mountAppPage } from "../../src/page-runtime.js";
import { icon } from "../../src/icons.js";

const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const dateLabel = value => {
  const d = new Date(value);
  return Number.isNaN(+d) ? "" : "em " + new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" }).format(d);
};
const formatBytes = n => n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + " KB" : (n / 1024 / 1024).toFixed(1) + " MB";
const mediaType = x => x.kind || (String(x.mime_type || "").startsWith("video/") ? "video" : String(x.mime_type || "").startsWith("audio/") ? "audio" : "image");
const mediaKey = x => x.source + ":" + x.id;
const descriptionMarkup = x => {
  const original = x.sourceDescription ? '<div class="gallery-description-item"><p class="gallery-description">' + esc(x.sourceDescription) + '</p><small>Descrição original</small></div>' : "";
  const entries = (x.descriptions || []).filter(row => String(row.description || "").trim()).map(row => {
    const author = x.peopleLookup?.get(row.user_id);
    return '<div class="gallery-description-item"><p class="gallery-description">' + esc(row.description) + '</p><small>' + esc(author?.display_name || author?.username || "Usuário") + '</small></div>';
  }).join("");
  return original + entries;
};

const galleryMarkup = () => [
'<section class="gallery-shell">',
  '<div class="gallery-hero"><h1 class="gallery-title">GALERIA</h1><button class="gallery-primary" type="button" data-open-upload>', icon("plus"), ' Adicionar mídia</button></div>',
  '<div class="gallery-main-controls" aria-label="Filtros principais">',
    '<button class="gallery-tab active" type="button" data-main="recentes">', icon("refresh"), ' Recente</button>',
    '<label class="gallery-select-label">', icon("filter"), ' <span>Título</span><select data-title-filter aria-label="Filtrar por formato"><option value="all">Todos</option><option value="image">Fotos</option><option value="video">Vídeos</option><option value="album">Álbuns</option><option value="audio">Áudios</option></select></label>',
    '<button class="gallery-tab" type="button" data-main="privadas">', icon("lock"), ' Privadas</button>',
    '<button class="gallery-tab" type="button" data-open-people-filter>', icon("users"), ' Pessoas</button>',
    '<button class="gallery-tab" type="button" data-main="exclusivos">', icon("shield"), ' Exclusivos</button>',
    '<button class="gallery-tab" type="button" data-shuffle>', icon("sync"), ' Embaralhar</button>',
  '</div>',
  '<div class="gallery-toolbar"><label class="gallery-search-wrap">', icon("search"), '<input class="gallery-search" type="search" placeholder="Pesquisar descrições e datas…" aria-label="Pesquisar na galeria" data-search></label>',
    '<div class="gallery-actions" aria-label="Modo de visualização">',
      '<button class="gallery-tool active" type="button" data-view="grid" aria-pressed="true" title="Grade" aria-label="Visualização em grade">', icon("grid"), '</button>',
      '<button class="gallery-tool" type="button" data-view="list" aria-pressed="false" title="Lista" aria-label="Visualização em lista">', icon("menu"), '</button>',
      '<button class="gallery-tool" type="button" data-view="masonry" aria-pressed="false" title="Mosaico" aria-label="Visualização em mosaico">', icon("camera"), '</button>',
    '</div>',
  '</div>',
  '<div class="gallery-filters" aria-label="Filtros de mídia">',
    '<button class="gallery-chip active" type="button" data-kind="all">Todas</button><button class="gallery-chip" type="button" data-kind="video">Vídeos</button><button class="gallery-chip" type="button" data-kind="image">Fotos</button><button class="gallery-chip" type="button" data-comments-filter aria-pressed="false">', icon("comment"), ' Com comentários</button>',
  '</div>',
  '<div class="gallery-album-toolbar" data-album-toolbar><label>Álbum <select data-album-select aria-label="Álbum selecionado"><option value="">Selecione um álbum</option></select></label><button class="gallery-tool" type="button" data-create-album>', icon("plus"), ' Criar álbum</button><button class="gallery-tool" type="button" data-back-albums hidden>Voltar aos álbuns</button></div>',
  '<p class="gallery-status" data-status role="status" aria-live="polite"></p><div class="gallery-count" data-count></div><div class="gallery-grid" data-grid aria-live="polite"></div>',
  '<div class="gallery-load-more-wrap"><button class="gallery-tool" type="button" data-load-more hidden>Carregar mais</button></div>',
'</section>',
'<div class="gallery-modal" data-upload-modal hidden><section class="gallery-dialog gallery-upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title">',
  '<div class="gallery-dialog-heading"><h2 id="upload-title">Adicionar mídia</h2><button type="button" class="gallery-icon-button" data-close-upload aria-label="Fechar">', icon("close"), '</button></div>',
  '<form class="gallery-form" data-upload-form novalidate>',
    '<div class="gallery-capture-actions"><button class="gallery-tool" type="button" data-camera-photo>', icon("camera"), ' Tirar foto</button><button class="gallery-tool" type="button" data-camera-video>', icon("video"), ' Selecionar/gravar vídeo</button></div>',
    '<input class="gallery-file-input" type="file" name="files" accept="image/jpeg,image/png,image/webp,image/heic,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/ogg,audio/webm,audio/wav,audio/aac" multiple data-files>',
    '<div class="gallery-file-preview" data-file-preview><p>Selecione um ou vários arquivos. Fotos, vídeos e áudios compatíveis são aceitos.</p></div>',
    '<label>Descrição <textarea name="description" maxlength="10000" placeholder="Adicione uma descrição (opcional)"></textarea></label>',
    '<label class="gallery-check-row"><input type="checkbox" name="mention_all" data-mention-all> Mencionar todos os usuários disponíveis</label>',
    '<label>Pesquisar pessoas para mencionar <input type="search" data-user-search placeholder="Buscar pelo nome"></label><div class="gallery-user-list" data-mention-users aria-label="Pessoas mencionadas"></div>',
    '<label class="gallery-check-row"><input type="checkbox" name="exclusive" data-exclusive> Mídia exclusiva — somente pessoas selecionadas poderão ver</label>',
    '<div class="gallery-exclusive-panel" data-exclusive-panel hidden><label>Pesquisar destinatários <input type="search" data-recipient-search placeholder="Buscar pessoas autorizadas"></label><div class="gallery-user-list" data-recipient-users aria-label="Destinatários exclusivos"></div><p class="gallery-help">Escolha pelo menos uma pessoa. O acesso é validado pelo Supabase, não apenas pela interface.</p></div>',
    '<div class="gallery-upload-progress" data-upload-progress hidden><progress max="100" value="0" data-progress></progress><span data-progress-label>0%</span></div>',
    '<p class="gallery-status" data-upload-status role="status"></p>',
    '<div class="gallery-dialog-actions"><button class="gallery-tool" type="button" data-close-upload>Cancelar</button><button class="gallery-primary" type="submit" data-publish>', icon("upload"), ' Publicar</button></div>',
  '</form>',
'</section></div>',
'<div class="gallery-modal" data-people-modal hidden><section class="gallery-dialog" role="dialog" aria-modal="true" aria-labelledby="people-title"><div class="gallery-dialog-heading"><h2 id="people-title">Filtrar por pessoas</h2><button type="button" class="gallery-icon-button" data-close-people aria-label="Fechar">', icon("close"), '</button></div><label>Pesquisar <input type="search" data-filter-user-search placeholder="Nome de usuário"></label><div class="gallery-user-list" data-filter-users></div><label class="gallery-check-row"><input type="checkbox" data-match-any> Mostrar mídias com qualquer pessoa selecionada</label><div class="gallery-dialog-actions"><button type="button" class="gallery-tool" data-clear-people>Limpar</button><button type="button" class="gallery-primary" data-apply-people>Aplicar filtros</button></div></section></div>',
'<div class="gallery-modal" data-album-modal hidden><section class="gallery-dialog" role="dialog" aria-modal="true" aria-labelledby="album-title"><div class="gallery-dialog-heading"><h2 id="album-title">Criar álbum</h2><button type="button" class="gallery-icon-button" data-close-album aria-label="Fechar">', icon("close"), '</button></div><form class="gallery-form" data-album-form><label>Nome do álbum <input name="name" maxlength="80" required placeholder="Ex.: Viagem de férias"></label><p class="gallery-status" data-album-status role="status"></p><div class="gallery-dialog-actions"><button type="button" class="gallery-tool" data-close-album>Cancelar</button><button type="submit" class="gallery-primary">Criar álbum</button></div></form></section></div>',
'<div class="gallery-modal" data-access-modal hidden><section class="gallery-dialog" role="dialog" aria-modal="true" aria-labelledby="access-title"><div class="gallery-dialog-heading"><h2 id="access-title">Administrar acesso</h2><button type="button" class="gallery-icon-button" data-close-access aria-label="Fechar">', icon("close"), '</button></div><form class="gallery-form" data-access-form><label>Visibilidade <select name="visibility"><option value="members">Todos os usuários autorizados</option><option value="exclusive">Somente pessoas selecionadas</option></select></label><label>Pesquisar pessoas <input type="search" data-access-search placeholder="Nome de usuário"></label><div class="gallery-user-list" data-access-users></div><p class="gallery-help">As permissões são verificadas pelo Supabase. A alteração não torna o arquivo público.</p><p class="gallery-status" data-access-status role="status"></p><div class="gallery-dialog-actions"><button type="button" class="gallery-tool" data-close-access>Cancelar</button><button type="submit" class="gallery-primary">Salvar acesso</button></div></form></section></div>',
'<div class="gallery-modal" data-tags-modal hidden><section class="gallery-dialog" role="dialog" aria-modal="true" aria-labelledby="tags-title"><div class="gallery-dialog-heading"><h2 id="tags-title">Adicionar menções</h2><button type="button" class="gallery-icon-button" data-close-tags aria-label="Fechar">', icon("close"), '</button></div><label>Pesquisar pessoas <input type="search" data-tag-search placeholder="Nome de usuário"></label><div class="gallery-user-list" data-tag-users></div><p class="gallery-status" data-tag-status role="status"></p><div class="gallery-dialog-actions"><button type="button" class="gallery-tool" data-close-tags>Cancelar</button><button type="button" class="gallery-primary" data-save-tags>Salvar menções</button></div></section></div>',
'<div class="gallery-viewer" data-viewer hidden role="dialog" aria-modal="true" aria-label="Visualização de mídia">',
  '<div class="gallery-viewer-top"><button type="button" data-close-viewer aria-label="Fechar visualização">', icon("close"), '</button><div class="gallery-viewer-menu-wrap"><button type="button" data-toggle-menu aria-label="Mais opções" title="Mais opções">', icon("more"), '</button><div class="gallery-context-menu" data-context-menu hidden><button type="button" data-edit-description>', icon("pencil"), ' Adicionar descrição</button><button type="button" data-edit-mentions>', icon("users"), ' Adicionar menções</button><button type="button" data-manage-access hidden>', icon("shield"), ' Administrar acesso</button><button type="button" data-viewer-toggle-private>', icon("lock"), ' Mover para Privadas</button><button type="button" data-open-comments>', icon("comment"), ' Ver comentários / comentar</button><button type="button" data-viewer-admin-delete hidden>', icon("trash"), ' Excluir mídia</button></div></div></div>',
  '<button type="button" class="gallery-viewer-nav previous" data-previous aria-label="Mídia anterior">', icon("back"), '</button><div class="gallery-viewer-content"><div class="gallery-viewer-media" data-viewer-media></div><div class="gallery-viewer-details"><p class="gallery-viewer-date" data-viewer-date></p><div class="gallery-viewer-description" data-viewer-description></div><form data-description-form hidden><label>Descrição<textarea name="description" maxlength="10000"></textarea></label><button class="gallery-primary" type="submit">Salvar descrição</button></form><button type="button" class="gallery-tool" data-zoom-out aria-label="Reduzir zoom">−</button><button type="button" class="gallery-tool" data-zoom-in aria-label="Ampliar zoom">+</button><button type="button" class="gallery-tool" data-open-comments>', icon("comment"), ' Comentários</button></div></div><button type="button" class="gallery-viewer-nav next" data-next aria-label="Próxima mídia">', icon("forward"), '</button>',
'</div>',
'<div class="gallery-modal" data-comments-modal hidden><section class="gallery-dialog gallery-comments-dialog" role="dialog" aria-modal="true" aria-labelledby="comments-title"><div class="gallery-dialog-heading"><h2 id="comments-title">Comentários</h2><button type="button" class="gallery-icon-button" data-close-comments aria-label="Fechar">', icon("close"), '</button></div><div class="gallery-comments-list" data-comments-list></div><form class="gallery-form" data-comment-form><label>Seu comentário <textarea name="body" maxlength="2000" required placeholder="Escreva um comentário…"></textarea></label><label>Quem pode ver?<select name="audience"><option value="media_viewers">Todos que podem ver a mídia</option><option value="author_only">Somente eu e o autor da mídia</option><option value="selected">Pessoas selecionadas</option></select></label><div class="gallery-user-list" data-comment-recipients hidden></div><p class="gallery-status" data-comment-status role="status"></p><div class="gallery-dialog-actions"><button type="button" class="gallery-tool" data-close-comments>Fechar</button><button type="submit" class="gallery-primary">Comentar</button></div></form></section></div>',
'<div class="gallery-camera-modal" data-camera-modal hidden><div class="gallery-camera-panel"><video data-camera-preview autoplay muted playsinline></video><div><button type="button" class="gallery-tool" data-switch-camera>', icon("cameraSwitch"), ' Trocar câmera</button><button type="button" class="gallery-primary" data-record>', icon("video"), ' Iniciar gravação</button><button type="button" class="gallery-tool" data-stop-camera>Fechar</button></div><p data-camera-status role="status"></p></div></div>'
].join("");

await mountAppPage({ page: "gallery", render: async ({ root, client, user, isAdmin }) => {
  root.innerHTML = galleryMarkup();
  const $ = selector => root.querySelector(selector);
  const $$ = selector => Array.from(root.querySelectorAll(selector));
  const grid = $("[data-grid]"), status = $("[data-status]"), count = $("[data-count]");
  const allowedMime = new Set(["image/jpeg","image/png","image/webp","image/heic","video/mp4","video/webm","audio/mpeg","audio/mp4","audio/ogg","audio/webm","audio/wav","audio/aac"]);
  const maxBytes = isAdmin ? 200 * 1024 * 1024 : 100 * 1024 * 1024;
  let items = [], people = [], albums = [], albumItemKeys = new Map(), activeAlbumId = null, privateKeys = new Set(), selectedPeople = new Set(), selectedRecipients = new Set(), selectedTagPeople = new Set(), selectedAccessRecipients = new Set(), filterPeople = new Set();
  let main = "recentes", kind = "all", view = "grid", matchAny = false, commentsOnly = false, shuffled = false;
  let activeKey = null, loadPage = 0, hasMore = true, loading = false, mediaStream = null, recorder = null, recordedChunks = [], cameraFacing = "environment", uploadBusy = false;
  const say = (message, where = status) => { if (where) where.textContent = message || ""; };
  const peopleMap = new Map();
  const usersHtml = (selected = new Set(), query = "") => {
    const q = query.trim().toLocaleLowerCase("pt-BR");
    const list = people.filter(p => !q || [p.display_name,p.username].some(v => String(v || "").toLocaleLowerCase("pt-BR").includes(q)));
    return list.map(p => '<label class="gallery-user-option"><input type="checkbox" value="' + esc(p.id) + '"' + (selected.has(p.id) ? " checked" : "") + '><span><strong>' + esc(p.display_name || p.username) + '</strong><small>@' + esc(p.username) + '</small></span></label>').join("") || '<p class="gallery-empty-small">Nenhuma pessoa encontrada.</p>';
  };
  const chosen = selector => $$(selector + " input[type=checkbox]:checked").map(el => el.value);
  const syncUserLists = () => {
    const mentionQuery = $("[data-user-search]").value || "";
    const recipientQuery = $("[data-recipient-search]").value || "";
    const filterQuery = $("[data-filter-user-search]").value || "";
    const tagQuery = $("[data-tag-search]").value || "";
    const accessQuery = $("[data-access-search]").value || "";
    $("[data-tag-users]").innerHTML = usersHtml(selectedTagPeople, tagQuery);
    $("[data-access-users]").innerHTML = usersHtml(selectedAccessRecipients, accessQuery);
    const commentSelected = new Set(chosen("[data-comment-recipients]"));
    $("[data-mention-users]").innerHTML = usersHtml(selectedPeople, mentionQuery);
    $("[data-recipient-users]").innerHTML = usersHtml(selectedRecipients, recipientQuery);
    $("[data-filter-users]").innerHTML = usersHtml(filterPeople, filterQuery);
    
    $("[data-comment-recipients]").innerHTML = usersHtml(commentSelected, "");
  };
  const signedUrl = async x => {
    const bucket = x.source === "archive" ? "looply-media" : "looply-gallery";
    const { data, error } = await client.storage.from(bucket).createSignedUrl(x.storage_path, 300);
    if (error) throw error;
    return data?.signedUrl || "";
  };
  const load = async (reset = false) => {
    if (loading) return;
    loading = true;
    if (reset) { loadPage = 0; hasMore = true; items = []; privateKeys.clear(); say("Carregando mídias…"); }
    try {
      const start = loadPage * 50, end = start + 49;
      const [a, c, p, tags, privateRows, albumsResult, albumItemsResult] = await Promise.all([
        client.from("archive_media").select("id,source_path,file_name,description,storage_path,kind,mime_type,visibility,source_date,created_at,comment_access").order("source_date",{ascending:false,nullsFirst:false}).order("created_at",{ascending:false}).range(start,end),
        client.from("community_gallery_media").select("id,owner_id,storage_path,file_name,kind,mime_type,caption,visibility,private_owner_id,created_at,comment_access,owner:profiles!community_gallery_media_owner_id_fkey(username,display_name)").order("created_at",{ascending:false}).range(start,end),
        client.from("profiles").select("id,username,display_name").order("display_name").limit(500),
        client.from("gallery_media_people").select("source,media_id,person_id"),
        client.from("gallery_private_items").select("source,media_id,owner_private").eq("user_id",user.id),
        client.from("gallery_albums").select("id,owner_id,name,created_at").eq("owner_id",user.id).order("created_at",{ascending:false}),
        client.from("gallery_album_items").select("album_id,source,media_id").order("added_at",{ascending:false})
      ]);
      if (a.error && c.error) throw a.error;
      if (p.error) console.warn("Não foi possível carregar a lista de pessoas", p.error);
      people = p.data || people;
      people.forEach(person => peopleMap.set(person.id, person));
      (privateRows.data || []).forEach(row => privateKeys.add(row.source + ":" + row.media_id));
      albums = albumsResult.data || albums;
      albumItemKeys = new Map();
      (albumItemsResult.data || []).forEach(row=>{if(!albumItemKeys.has(row.album_id))albumItemKeys.set(row.album_id,new Set());albumItemKeys.get(row.album_id).add(row.source+":"+row.media_id);});
      const previousAlbum = $("[data-album-select]").value;
      $("[data-album-select]").innerHTML = '<option value="">Selecione um álbum</option>' + albums.map(a=>'<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>').join("");
      if(albums.some(a=>a.id===previousAlbum))$("[data-album-select]").value=previousAlbum;
      const fresh = [
        ...(a.data || []).map(x => ({...x, source:"archive", title:"", sourceDescription:x.description || "", description:x.description || "", date:x.created_at, owner_id:null})),
        ...(c.data || []).map(x => ({...x, source:"community", title:"", sourceDescription:x.caption || "", description:x.caption || "", date:x.created_at}))
      ];
      const descArchiveIds = fresh.filter(x=>x.source==="archive").map(x=>x.id);
      const descCommunityIds = fresh.filter(x=>x.source==="community").map(x=>x.id);
      const descResults = await Promise.all([
        descArchiveIds.length ? client.from("gallery_media_descriptions").select("source,media_id,user_id,description,category,updated_at").eq("source","archive").in("media_id",descArchiveIds) : Promise.resolve({data:[],error:null}),
        descCommunityIds.length ? client.from("gallery_media_descriptions").select("source,media_id,user_id,description,category,updated_at").eq("source","community").in("media_id",descCommunityIds) : Promise.resolve({data:[],error:null})
      ]);
      if (!descResults.some(result=>result.error)) {
        const descriptions = new Map();
        descResults.flatMap(result=>result.data||[]).forEach(row => { const key = row.source + ":" + row.media_id; if (!descriptions.has(key)) descriptions.set(key, []); descriptions.get(key).push(row); });
        fresh.forEach(x => { x.descriptions = descriptions.get(mediaKey(x)) || []; x.myDescription = x.descriptions.find(row => row.user_id === user.id)?.description || ""; x.peopleLookup = peopleMap; x.description = [x.sourceDescription, ...x.descriptions.map(row=>row.description)].filter(Boolean).join(" "); });
      } else fresh.forEach(x=>{x.descriptions=[];x.myDescription="";x.peopleLookup=peopleMap;});
      const freshTags = tags.data || [];
      const tagMap = new Map();
      freshTags.forEach(tag => { const key = tag.source + ":" + tag.media_id; if (!tagMap.has(key)) tagMap.set(key, []); tagMap.get(key).push(tag.person_id); });
      fresh.forEach(x => { x.peopleIds = tagMap.get(mediaKey(x)) || []; x.isPrivate = privateKeys.has(mediaKey(x)) || Boolean(x.private_owner_id === user.id); });
      const commentIds = [];
      const idsA = fresh.filter(x=>x.source==="archive").map(x=>x.id);
      const idsC = fresh.filter(x=>x.source==="community").map(x=>x.id);
      const [commentsA, commentsC] = await Promise.all([
        idsA.length ? client.from("archive_media_comments").select("media_id").in("media_id",idsA) : Promise.resolve({data:[],error:null}),
        idsC.length ? client.from("community_gallery_comments").select("media_id").in("media_id",idsC) : Promise.resolve({data:[],error:null})
      ]);
      (commentsA.data || []).concat(commentsC.data || []).forEach(cmt => commentIds.push(cmt.media_id));
      const commentSet = new Set(commentIds);
      fresh.forEach(x => { x.hasComments = commentSet.has(x.id); });
      await Promise.all(fresh.map(async x => { try { x.url = await signedUrl(x); } catch { x.url = ""; } }));
      const seen = new Set(items.map(mediaKey));
      fresh.forEach(x => { if (!seen.has(mediaKey(x))) items.push(x); });
      hasMore = (a.data || []).length === 50 || (c.data || []).length === 50;
      loadPage += 1;
      syncUserLists();
      say("");
      draw();
      $("[data-load-more]").hidden = !hasMore;
    } catch (error) {
      console.error("Gallery load failed", error);
      say("Não foi possível carregar a Galeria. Verifique sua conexão e tente novamente.");
      if (!items.length) grid.innerHTML = '<div class="gallery-empty">A Galeria não pôde ser carregada. Tente novamente.</div>';
    } finally { loading = false; }
  };
  const visible = () => {
    let list = items.filter(x => {
      const type = mediaType(x), key = mediaKey(x);
      if (activeAlbumId) {
        if (!(albumItemKeys.get(activeAlbumId) || new Set()).has(key)) return false;
      } else {
        if (main === "privadas" && !x.isPrivate) return false;
        if (x.visibility === "exclusive" && main !== "exclusivos" && main !== "privadas") return false;
        if (main === "exclusivos" && x.visibility !== "exclusive") return false;
        if (main !== "privadas" && x.isPrivate) return false;
        if (kind !== "all" && type !== kind) return false;
        if (kind === "album") return false;
      }
      if (commentsOnly && !x.hasComments) return false;
      if (filterPeople.size) {
        const ids = new Set(x.peopleIds || []);
        const matches = Array.from(filterPeople).map(id => ids.has(id));
        if (matchAny ? !matches.some(Boolean) : !matches.every(Boolean)) return false;
      }
      const q = $("[data-search]").value.trim().toLocaleLowerCase("pt-BR");
      const searchable = [x.description, x.date ? dateLabel(x.date) : "", x.owner?.display_name, x.owner?.username, ...(x.peopleIds || []).map(id => peopleMap.get(id)?.display_name || peopleMap.get(id)?.username || "")];
      if (q && !searchable.some(v => String(v || "").toLocaleLowerCase("pt-BR").includes(q))) return false;
      return true;
    });
    list.sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (shuffled) list = list.map(value => ({value, sort:Math.random()})).sort((a,b)=>a.sort-b.sort).map(x=>x.value);
    return list;
  };
  const cardMedia = x => {
    const type = mediaType(x);
    if (!x.url) return '<div class="gallery-media-fallback">' + icon("camera") + '<span>Prévia indisponível</span></div>';
    if (type === "video") return '<video src="' + esc(x.url) + '" preload="metadata" muted playsinline></video><span class="gallery-media-type">' + icon("video") + '</span>';
    if (type === "audio") return '<div class="gallery-audio-preview">' + icon("music") + '<audio src="' + esc(x.url) + '" controls preload="none"></audio></div>';
    return '<img src="' + esc(x.url) + '" alt="" loading="lazy" decoding="async">';
  };
  const draw = () => {
    grid.className = "gallery-grid" + (view === "list" ? " list" : view === "masonry" ? " masonry" : "");
    const list = visible();
    count.textContent = list.length + (list.length === 1 ? " mídia" : " mídias");
    grid.innerHTML = list.length ? list.map(x => {
      const author = x.owner?.display_name || x.owner?.username || "Galeria compartilhada";
      const privateIcon = x.isPrivate ? '<span class="gallery-private-indicator" title="Na sua pasta privada" aria-label="Na sua pasta privada">' + icon("lock") + '</span>' : "";
      const exclusiveIcon = x.visibility === "exclusive" ? '<span class="gallery-private-indicator" title="Mídia exclusiva" aria-label="Mídia exclusiva">' + icon("shield") + '</span>' : "";
      return '<article class="gallery-card" data-card="' + esc(mediaKey(x)) + '"><button type="button" class="gallery-media" data-open-media="' + esc(mediaKey(x)) + '" aria-label="Abrir mídia publicada ' + esc(dateLabel(x.date)) + '">' + cardMedia(x) + privateIcon + exclusiveIcon + '</button><div class="gallery-card-body"><div class="gallery-meta">' + esc(dateLabel(x.date)) + '</div>' + (descriptionMarkup(x)) + '<div class="gallery-card-actions"><button type="button" data-comments="' + esc(mediaKey(x)) + '" aria-label="Abrir comentários">' + icon("comment") + (x.hasComments ? '<span>Comentários</span>' : '<span>Comentar</span>') + '</button><button type="button" data-toggle-private="' + esc(mediaKey(x)) + '" aria-label="' + (x.isPrivate ? "Remover da pasta privada" : "Mover para a pasta privada") + '">' + icon("lock") + '</button>' + (activeAlbumId ? '<button type="button" data-album-remove="' + esc(mediaKey(x)) + '" aria-label="Remover do álbum">' + icon("minus") + '</button>' : (albums.length ? '<button type="button" data-album-add="' + esc(mediaKey(x)) + '" aria-label="Adicionar ao álbum">' + icon("plus") + '</button>' : '')) + (isAdmin ? '<button type="button" data-admin-delete="' + esc(mediaKey(x)) + '" aria-label="Excluir mídia">' + icon("trash") + '</button>' : '') + '</div><span class="gallery-card-author">' + esc(author) + '</span></div></article>';
    }).join("") : '<div class="gallery-empty">' + (main === "privadas" ? "Sua pasta privada ainda não tem mídias." : "Nenhuma mídia encontrada. Ajuste os filtros ou adicione uma lembrança.") + '</div>';
    $$(".gallery-tab[data-main]").forEach(b => b.classList.toggle("active", b.dataset.main === main));
    $$(".gallery-chip[data-kind]").forEach(b => b.classList.toggle("active", b.dataset.kind === kind));
    $("[data-comments-filter]").classList.toggle("active", commentsOnly);
    $("[data-title-filter]").value = kind;
  };
  const getItem = key => items.find(x => mediaKey(x) === key);
  const openViewer = async key => {
    viewerZoom=1;
    const x = getItem(key); if (!x || !x.url) { say("Esta mídia não está disponível para visualização."); return; }
    activeKey = key;
    const type = mediaType(x);
    const media = type === "video" ? '<video src="' + esc(x.url) + '" controls autoplay playsinline></video>' : type === "audio" ? '<audio src="' + esc(x.url) + '" controls autoplay></audio>' : '<img src="' + esc(x.url) + '" alt="" draggable="false">';
    $("[data-viewer-media]").innerHTML = media;
    $("[data-viewer-date]").textContent = dateLabel(x.date);
    $("[data-viewer-description]").innerHTML = descriptionMarkup(x);
    $("[data-description-form]").hidden = true;
    $("[data-context-menu]").hidden = true;
    $("[data-viewer-admin-delete]").hidden = !isAdmin;
    $("[data-edit-mentions]").hidden = !(isAdmin || (x.source === "community" && x.owner_id === user.id));
    $("[data-manage-access]").hidden = !(isAdmin || (x.source === "community" && x.owner_id === user.id));
    $("[data-viewer-toggle-private]").innerHTML = icon("lock") + (x.isPrivate ? " Remover de Privadas" : " Mover para Privadas");
    $("[data-viewer]").hidden = false;
    document.body.classList.add("gallery-viewer-open");
  };
  const closeViewer = () => { $("[data-viewer]").hidden = true; document.body.classList.remove("gallery-viewer-open"); activeKey = null; };
  const togglePrivate = async key => {
    const x = getItem(key); if (!x) return;
    const next = !x.isPrivate;
    const { error } = await client.rpc("set_gallery_media_private", { p_source:x.source, p_media_id:x.id, p_private:next });
    if (error) { say(error.message?.includes("42501") ? "Você não tem permissão para alterar a privacidade desta mídia." : "Não foi possível atualizar a pasta privada."); return; }
    if (next) privateKeys.add(key); else privateKeys.delete(key);
    x.isPrivate = next;
    say(next ? "Mídia movida para Privadas." : "Mídia removida de Privadas.");
    draw();
    if (activeKey === key) $("[data-viewer-toggle-private]").innerHTML = icon("lock") + (next ? " Remover de Privadas" : " Mover para Privadas");
  };
  const loadComments = async () => {
    const x = getItem(activeKey); if (!x) return;
    const table = x.source === "archive" ? "archive_media_comments" : "community_gallery_comments";
    const { data, error } = await client.from(table).select("id,media_id,author_id,body,audience,created_at").eq("media_id",x.id).order("created_at",{ascending:true}).limit(100);
    if (error) { say("Não foi possível carregar os comentários.", $("[data-comment-status]")); return; }
    const rows = data || [];
    const authorIds = [...new Set(rows.map(r=>r.author_id))];
    const authors = authorIds.length ? await client.from("profiles").select("id,username,display_name").in("id",authorIds) : {data:[]};
    const authorMap = new Map((authors.data || []).map(p=>[p.id,p]));
    $("[data-comments-list]").innerHTML = rows.length ? rows.map(r => {
      const p = authorMap.get(r.author_id);
      return '<article class="gallery-comment"><div><strong>' + esc(p?.display_name || p?.username || "Usuário") + '</strong><time>' + esc(dateLabel(r.created_at)) + '</time></div><p>' + esc(r.body) + '</p>' + (r.audience === "selected" || r.audience === "author_only" ? '<small>' + icon("lock") + ' Comentário restrito</small>' : '') + '</article>';
    }).join("") : '<p class="gallery-empty-small">Ainda não há comentários visíveis para você.</p>';
    $("[data-comment-status]").textContent = "";
    $("[data-comments-modal]").hidden = false;
    $("[data-comment-form]").querySelector('[name="audience"]').value = "media_viewers";
    $("[data-comment-recipients]").hidden = true;
    syncUserLists();
  };
  const publishComment = async event => {
    event.preventDefault();
    const x = getItem(activeKey); if (!x) return;
    const form = event.currentTarget, body = String(new FormData(form).get("body") || "").trim(), audience = String(new FormData(form).get("audience") || "media_viewers");
    const recipientIds = chosen("[data-comment-recipients]");
    if (!body || body.length > 2000) { say("O comentário precisa ter entre 1 e 2.000 caracteres.", $("[data-comment-status]")); return; }
    if (audience === "selected" && !recipientIds.length) { say("Selecione pelo menos uma pessoa.", $("[data-comment-status]")); return; }
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      const rpc = x.source === "archive" ? "create_archive_media_comment" : "create_community_gallery_comment";
      const { error } = await client.rpc(rpc, { p_media_id:x.id, p_body:body, p_audience:audience, p_recipient_ids:audience === "selected" ? recipientIds : [] });
      if (error) throw error;
      form.reset(); say("Comentário publicado.", $("[data-comment-status]"));
      x.hasComments = true; draw(); await loadComments();
    } catch (error) { console.error(error); say("Não foi possível publicar o comentário. Verifique as permissões da mídia.", $("[data-comment-status]")); }
    finally { submit.disabled = false; }
  };
  const publish = async event => {
    event.preventDefault(); if (uploadBusy) return;
    const form = event.currentTarget, fd = new FormData(form), files = Array.from($("[data-files]").files || []);
    if (!files.length || files.length > 12) { say("Selecione de 1 a 12 arquivos.", $("[data-upload-status]")); return; }
    for (const file of files) {
      if (!allowedMime.has(file.type)) { say("Formato não permitido: " + file.name, $("[data-upload-status]")); return; }
      if (file.size <= 0 || file.size > maxBytes) { say(file.name + " excede o limite permitido de " + formatBytes(maxBytes) + ".", $("[data-upload-status]")); return; }
    }
    const exclusive = Boolean(fd.get("exclusive"));
    const viewerIds = [...selectedRecipients];
    if (exclusive && !viewerIds.length) { say("Selecione ao menos uma pessoa para a mídia exclusiva.", $("[data-upload-status]")); return; }
    if (exclusive && new Set([...viewerIds,user.id]).size > 100) { say("Selecione no máximo 99 destinatários exclusivos, além de você.", $("[data-upload-status]")); return; }
    let mentionIds = fd.get("mention_all") ? people.map(p=>p.id) : chosen("[data-mention-users]");
    if (exclusive) mentionIds = mentionIds.filter(id=>viewerIds.includes(id)||id===user.id);
    const description = String(fd.get("description") || "").trim();
    uploadBusy = true;
    const button = $("[data-publish]"); button.disabled = true;
    $("[data-upload-progress]").hidden = false;
    let uploaded = 0, completed = 0, failures = [];
    try {
      for (const file of files) {
        let path = "";
        try {
          const ext = (file.name.split(".").pop() || "bin").replace(/[^a-z0-9]/gi,"").toLowerCase();
          const objectId = crypto.randomUUID();
          path = "gallery/" + user.id + "/" + objectId + "." + ext;
          const { error: uploadError } = await client.storage.from("looply-gallery").upload(path,file,{contentType:file.type,upsert:false});
          if (uploadError) throw uploadError;
          const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image";
          const { data: row, error: rowError } = await client.from("community_gallery_media").insert({
            owner_id:user.id, storage_path:path, file_name:file.name, kind, mime_type:file.type,
            byte_size:file.size, caption:"", visibility:exclusive ? "exclusive" : "members", comment_access:"viewers"
          }).select("id").single();
          if (rowError) throw rowError;
          if (exclusive) {
            const safeViewers = [...new Set([...viewerIds,user.id])];
            const { error } = await client.rpc("set_gallery_media_permissions", {
              p_source:"community", p_media_id:row.id, p_visibility:"exclusive",
              p_comment_access:"viewers", p_viewer_ids:safeViewers, p_commenter_ids:[]
            });
            if (error) throw error;
          }
          if (description) {
            const { error } = await client.from("gallery_media_descriptions").upsert({
              user_id:user.id, source:"community", media_id:row.id, description,
              category:kind === "video" ? "video" : kind === "audio" ? "audio" : "photo"
            },{onConflict:"user_id,source,media_id"});
            if (error) console.warn("Mídia enviada, mas a descrição não foi salva",error);
          }
          if (mentionIds.length) {
            const tags = [...new Set(mentionIds)].map(person_id=>({source:"community",media_id:row.id,person_id,created_by:user.id}));
            const { error } = await client.from("gallery_media_people").insert(tags);
            if (error) console.warn("Mídia enviada, mas algumas menções não foram salvas",error);
          }
          completed++;
        } catch (error) {
          console.error("Upload failed",file.name,error);
          failures.push(file.name + ": " + (error.message || "falha no envio"));
          if (path && !items.some(x=>x.storage_path===path)) {
            const { data: row } = await client.from("community_gallery_media").select("id").eq("storage_path",path).maybeSingle();
            if (!row) await client.storage.from("looply-gallery").remove([path]).catch(()=>{});
          }
        }
        uploaded++;
        const percent = Math.round(uploaded / files.length * 100);
        $("[data-progress]").value = percent;
        $("[data-progress-label]").textContent = percent + "% (" + uploaded + "/" + files.length + ")";
      }
      if (completed) { form.reset(); selectedPeople.clear(); selectedRecipients.clear(); $("[data-file-preview]").innerHTML = '<p>Selecione um ou vários arquivos.</p>'; $("[data-upload-modal]").hidden = true; await load(true); }
      say(failures.length ? completed + " arquivo(s) enviado(s). Falhas: " + failures.join(" · ") : completed + " arquivo(s) publicado(s) com sucesso.", status);
      if (!completed && failures.length) say(failures.join(" · "), $("[data-upload-status]"));
    } finally {
      uploadBusy = false; button.disabled = false; $("[data-upload-progress]").hidden = true;
    }
  };
  const startCamera = async videoMode => {
    if (!navigator.mediaDevices?.getUserMedia) { say("Este navegador não oferece captura direta. Use Selecionar arquivos.", $("[data-camera-status]")); return; }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:cameraFacing},audio:videoMode});
      $("[data-camera-preview]").srcObject = mediaStream;
      $("[data-camera-modal]").hidden = false;
      $("[data-camera-status]").textContent = videoMode ? "Câmera pronta para gravar." : "Câmera pronta. Capture uma foto pelo controle do navegador ou grave um vídeo.";
      if (!videoMode) {
        const video = $("[data-camera-preview]");
        const capture = async () => {
          if (!video.videoWidth) { say("A câmera ainda está iniciando.", $("[data-camera-status]")); return; }
          const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          canvas.getContext("2d").drawImage(video,0,0);
          canvas.toBlob(blob => {
            if (!blob) return;
            const file = new File([blob],"looply-foto-" + Date.now() + ".jpg",{type:"image/jpeg"});
            const transfer = new DataTransfer(); Array.from($("[data-files]").files).forEach(f=>transfer.items.add(f)); transfer.items.add(file); $("[data-files]").files=transfer.files; renderPreview();
            say("Foto capturada e adicionada à seleção.", $("[data-camera-status]"));
          },"image/jpeg",0.92);
        };
        $("[data-record]").textContent = "Capturar foto";
        $("[data-record]").onclick = capture;
      } else {
        $("[data-record]").innerHTML = icon("video") + " Iniciar gravação";
        $("[data-record]").onclick = () => {
          if (recorder?.state === "recording") { recorder.stop(); return; }
          recordedChunks = [];
          try {
            recorder = new MediaRecorder(mediaStream);
            recorder.ondataavailable = e => { if (e.data.size) recordedChunks.push(e.data); };
            recorder.onstop = () => {
              const blob = new Blob(recordedChunks,{type:recorder.mimeType || "video/webm"});
              const file = new File([blob],"looply-video-" + Date.now() + (blob.type.includes("mp4")?".mp4":".webm"),{type:blob.type});
              const transfer = new DataTransfer(); Array.from($("[data-files]").files).forEach(f=>transfer.items.add(f)); transfer.items.add(file); $("[data-files]").files=transfer.files; renderPreview();
              say("Vídeo gravado e adicionado à seleção.", $("[data-camera-status]"));
              $("[data-record]").innerHTML = icon("video") + " Iniciar gravação";
            };
            recorder.start(); $("[data-record]").textContent = "Parar gravação"; say("Gravando vídeo…", $("[data-camera-status]"));
          } catch (error) { say("Não foi possível iniciar a gravação neste dispositivo.", $("[data-camera-status]")); }
        };
      }
    } catch (error) {
      say(error.name === "NotAllowedError" ? "Permissão da câmera/microfone negada. Selecione um arquivo do dispositivo." : "Câmera indisponível. Selecione um arquivo do dispositivo.", $("[data-camera-status]"));
    }
  };
  const stopCamera = () => { if (recorder?.state === "recording") recorder.stop(); if (mediaStream) mediaStream.getTracks().forEach(t=>t.stop()); mediaStream=null; $("[data-camera-preview]").srcObject=null; $("[data-camera-modal]").hidden=true; };
  const renderPreview = () => {
    const files = Array.from($("[data-files]").files || []);
    $("[data-file-preview]").innerHTML = files.length ? files.map((file,index) => {
      const url = URL.createObjectURL(file);
      const preview = file.type.startsWith("image/") ? '<img src="' + esc(url) + '" alt="Prévia de ' + esc(file.name) + '">' : file.type.startsWith("video/") ? '<video src="' + esc(url) + '" controls muted></video>' : '<div>' + icon(file.type.startsWith("audio/")?"music":"paperclip") + '</div>';
      return '<article class="gallery-file-card">' + preview + '<div><strong>' + esc(file.name) + '</strong><small>' + esc(file.type || "Formato desconhecido") + ' · ' + formatBytes(file.size) + '</small><button type="button" data-remove-file="' + index + '" aria-label="Remover ' + esc(file.name) + '">' + icon("close") + ' Remover</button></div></article>';
    }).join("") : '<p>Selecione um ou vários arquivos. Fotos, vídeos e áudios compatíveis são aceitos.</p>';
  };
  const removeFile = index => { const transfer = new DataTransfer(); Array.from($("[data-files]").files).forEach((f,i)=>{if(i!==index)transfer.items.add(f)}); $("[data-files]").files=transfer.files; renderPreview(); };
  const deleteMedia = async key => {
    if (!isAdmin) { say("Somente a administração pode excluir mídias."); return; }
    const x = getItem(key); if (!x || !confirm("Excluir permanentemente esta mídia? Comentários e menções associados também serão removidos.")) return;
    const bucket = x.source === "archive" ? "looply-media" : "looply-gallery";
    const { error: storageError } = await client.storage.from(bucket).remove([x.storage_path]);
    if (storageError) { say("Não foi possível remover o arquivo do armazenamento."); return; }
    const table = x.source === "archive" ? "archive_media" : "community_gallery_media";
    const { error } = await client.from(table).delete().eq("id",x.id);
    if (error) { say("O arquivo foi removido, mas os metadados não foram. Solicite a reconciliação à administração."); return; }
    items = items.filter(y=>mediaKey(y)!==key); privateKeys.delete(key); draw(); closeViewer(); say("Mídia excluída.");
  };

  $("[data-open-upload]").addEventListener("click",()=>{ $("[data-upload-modal]").hidden=false; syncUserLists(); });
  $$("[data-close-upload]").forEach(b=>b.addEventListener("click",()=>{ if (!uploadBusy) $("[data-upload-modal]").hidden=true; }));
  $("[data-files]").addEventListener("change",renderPreview);
  $("[data-upload-form]").addEventListener("submit",publish);
  $("[data-camera-photo]").addEventListener("click",()=>startCamera(false));
  $("[data-camera-video]").addEventListener("click",()=>startCamera(true));
  $("[data-stop-camera]").addEventListener("click",stopCamera);
  $("[data-switch-camera]").addEventListener("click",async()=>{cameraFacing=cameraFacing==="environment"?"user":"environment";stopCamera();await startCamera(true);});
  $("[data-exclusive]").addEventListener("change",e=>{ $("[data-exclusive-panel]").hidden=!e.target.checked; });
  $("[data-mention-all]").addEventListener("change",e=>{ $("[data-mention-users]").hidden=e.target.checked; });
  ["[data-user-search]","[data-recipient-search]","[data-filter-user-search]","[data-access-search]"].forEach(sel=>$(sel).addEventListener("input",syncUserLists));
  ["[data-mention-users]","[data-recipient-users]","[data-filter-users]","[data-comment-recipients]","[data-tag-users]","[data-access-users]"].forEach(sel=>$(sel).addEventListener("change",e=>{const input=e.target.closest('input[type="checkbox"]');if(!input)return;const set=sel==="[data-mention-users]"?selectedPeople:sel==="[data-recipient-users]"?selectedRecipients:sel==="[data-filter-users]"?filterPeople:sel==="[data-tag-users]"?selectedTagPeople:sel==="[data-access-users]"?selectedAccessRecipients:null;if(set){if(input.checked)set.add(input.value);else set.delete(input.value);}}));
  $("[data-title-filter]").addEventListener("change",e=>{kind=e.target.value;if(kind!=="album")activeAlbumId=null;draw();});
  $("[data-search]").addEventListener("input",draw);
  $("[data-kind]").forEach(b=>b.addEventListener("click",()=>{kind=b.dataset.kind;activeAlbumId=null;draw();}));
  $$("[data-view]").forEach(b=>b.addEventListener("click",()=>{view=b.dataset.view;$$("[data-view]").forEach(v=>{v.classList.toggle("active",v===b);v.setAttribute("aria-pressed",String(v===b));});draw();}));
  $("[data-main]").forEach(b=>b.addEventListener("click",()=>{main=b.dataset.main;activeAlbumId=null;shuffled=false;draw();}));
  $("[data-shuffle]").addEventListener("click",()=>{shuffled=!shuffled;$("[data-shuffle]").classList.toggle("active",shuffled);draw();});
  $("[data-comments-filter]").addEventListener("click",()=>{commentsOnly=!commentsOnly;$("[data-comments-filter]").setAttribute("aria-pressed",String(commentsOnly));draw();});
  $("[data-open-people-filter]").addEventListener("click",()=>{$("[data-people-modal]").hidden=false;syncUserLists();});
  $("[data-close-people]").addEventListener("click",()=>{$("[data-people-modal]").hidden=true;});
  $("[data-clear-people]").addEventListener("click",()=>{filterPeople.clear();syncUserLists();});
  $("[data-apply-people]").addEventListener("click",()=>{matchAny=$("[data-match-any]").checked;$("[data-people-modal]").hidden=true;draw();});
  $("[data-close-viewer]").addEventListener("click",closeViewer);
  $("[data-toggle-menu]").addEventListener("click",()=>{$("[data-context-menu]").hidden=!$("[data-context-menu]").hidden;});
  $("[data-viewer-toggle-private]").addEventListener("click",()=>{if(activeKey)togglePrivate(activeKey);});
  $("[data-edit-description]").addEventListener("click",()=>{$("[data-context-menu]").hidden=true;$("[data-description-form]").hidden=false;$("[data-description-form] textarea).value=getItem(activeKey)?.description||"";});
  $("[data-description-form]").addEventListener("submit",async e=>{e.preventDefault();const x=getItem(activeKey);if(!x)return;const description=e.currentTarget.elements.description.value.trim();const {error}=await client.from("gallery_media_descriptions").upsert({user_id:user.id,source:x.source,media_id:x.id,description,category:mediaType(x)==="video"?"video":mediaType(x)==="audio"?"audio":"photo"},{onConflict:"user_id,source,media_id"});if(error){say("Não foi possível salvar a descrição.");return;}x.myDescription=description;x.descriptions=(x.descriptions||[]).filter(row=>row.user_id!==user.id);if(description)x.descriptions.push({user_id:user.id,description,updated_at:new Date().toISOString()});x.peopleLookup=peopleMap;x.description=[x.sourceDescription,...x.descriptions.map(row=>row.description)].filter(Boolean).join(" ");$("[data-viewer-description]").innerHTML=descriptionMarkup(x);draw();say("Descrição salva.");e.currentTarget.hidden=true;});
  $("[data-manage-access]").addEventListener("click",async()=>{const x=getItem(activeKey);if(!x)return;if(!(isAdmin||(x.source==="community"&&x.owner_id===user.id))){say("Você não pode administrar o acesso desta mídia.");return;}$("[data-context-menu]").hidden=true;selectedAccessRecipients.clear();try{const table=x.source==="archive"?"archive_media_recipients":"community_gallery_media_recipients";const {data,error}=await client.from(table).select("user_id").eq("media_id",x.id);if(error)throw error;(data||[]).forEach(row=>selectedAccessRecipients.add(row.user_id));}catch(error){console.warn("Could not load current media audience",error);}const form=$("[data-access-form"]);form.elements.visibility.value=x.visibility==="exclusive"?"exclusive":"members";$("[data-access-search]").value="";syncUserLists();$("[data-access-status]").textContent="";$("[data-access-modal]").hidden=false;});
  $("[data-close-access]").forEach(b=>b.addEventListener("click",()=>$("[data-access-modal]").hidden=true));
  $("[data-access-form]").addEventListener("submit",async e=>{e.preventDefault();const x=getItem(activeKey);if(!x)return;const visibility=e.currentTarget.elements.visibility.value;const viewerIds=[...selectedAccessRecipients];if(visibility==="exclusive"&&!viewerIds.length){say("Selecione pelo menos uma pessoa.",$("[data-access-status]"));return;}if(viewerIds.length>100){say("Selecione no máximo 100 pessoas.",$("[data-access-status]"));return;}const button=e.currentTarget.querySelector('[type="submit"]');button.disabled=true;try{const {error}=await client.rpc("set_gallery_media_permissions",{p_source:x.source,p_media_id:x.id,p_visibility:visibility,p_comment_access:"viewers",p_viewer_ids:visibility==="exclusive"?viewerIds:[],p_commenter_ids:[]});if(error)throw error;x.visibility=visibility;$("[data-access-modal]").hidden=true;draw();say("Permissões da mídia atualizadas.");}catch(error){console.error(error);say("Não foi possível alterar o acesso. Verifique a autorização e os destinatários.",$("[data-access-status]"));}finally{button.disabled=false;}});
  $("[data-edit-mentions]").addEventListener("click",()=>{const x=getItem(activeKey);if(!x)return;if(!(isAdmin||(x.source==="community"&&x.owner_id===user.id))){say("Somente o proprietário ou a administração pode alterar as menções.");return;}$("[data-context-menu]").hidden=true;$("[data-tag-search]").value="";$("[data-tag-users]").innerHTML=usersHtml(new Set(x.peopleIds||[]),"");$("[data-tag-status]").textContent="";$("[data-tags-modal]").hidden=false;});
  $("[data-close-tags]").forEach(b=>b.addEventListener("click",()=>$("[data-tags-modal]").hidden=true));
  $("[data-tag-search]").addEventListener("input",()=>{$("[data-tag-users]").innerHTML=usersHtml(selectedTagPeople,$("[data-tag-search]").value);});
  $("[data-save-tags]").addEventListener("click",async()=>{const x=getItem(activeKey);if(!x)return;const selected=new Set(selectedTagPeople);const old=new Set(x.peopleIds||[]);const add=[...selected].filter(id=>!old.has(id));const remove=[...old].filter(id=>!selected.has(id));const button=$("[data-save-tags]");button.disabled=true;try{if(add.length){const {error}=await client.from("gallery_media_people").insert(add.map(person_id=>({source:x.source,media_id:x.id,person_id,created_by:user.id})));if(error)throw error;}if(remove.length){const {error}=await client.from("gallery_media_people").delete().eq("source",x.source).eq("media_id",x.id).in("person_id",remove);if(error)throw error;}x.peopleIds=[...selected];selectedTagPeople=new Set(selected);$("[data-tags-modal]").hidden=true;draw();say("Menções atualizadas.");}catch(error){console.error(error);say("Não foi possível salvar as menções. Verifique a autorização dos destinatários.",$("[data-tag-status]"));}finally{button.disabled=false;}});
  $$("[data-open-comments]").forEach(b=>b.addEventListener("click",loadComments));
  $("[data-close-comments]").addEventListener("click",()=>{$("[data-comments-modal]").hidden=true;});
  $$("[data-close-comments]").forEach(b=>b.addEventListener("click",()=>{$("[data-comments-modal]").hidden=true;}));
  $("[data-comment-form]").addEventListener("submit",publishComment);
  $("[data-comment-form] [name=audience]").addEventListener("change",e=>{$("[data-comment-recipients]").hidden=e.target.value!=="selected";syncUserLists();});
  $("[data-previous]").addEventListener("click",()=>{const list=visible(),index=list.findIndex(x=>mediaKey(x)===activeKey);if(index>0)openViewer(mediaKey(list[index-1]));});
  $("[data-next]").addEventListener("click",()=>{const list=visible(),index=list.findIndex(x=>mediaKey(x)===activeKey);if(index>=0&&index<list.length-1)openViewer(mediaKey(list[index+1]));});
  $("[data-viewer-admin-delete]").addEventListener("click",()=>{if(activeKey)deleteMedia(activeKey);});
  $("[data-load-more]").addEventListener("click",()=>load(false));
  $("[data-create-album]").addEventListener("click",()=>{$("[data-album-modal]").hidden=false;$("[data-album-status]").textContent="";});
  $("[data-close-album]").forEach(b=>b.addEventListener("click",()=>$("[data-album-modal]").hidden=true));
  $("[data-album-form]").addEventListener("submit",async e=>{e.preventDefault();const form=e.currentTarget;const name=String(new FormData(form).get("name")||"").trim();if(!name||name.length>80){say("O nome deve ter de 1 a 80 caracteres.",$("[data-album-status]"));return;}const button=form.querySelector('[type="submit"]');button.disabled=true;try{const {data,error}=await client.from("gallery_albums").insert({owner_id:user.id,name}).select("id,owner_id,name,created_at").single();if(error)throw error;albums.unshift(data);activeAlbumId=null;kind="album";$("[data-title-filter]").value="album";$("[data-album-select]").innerHTML='<option value="">Selecione um álbum</option>'+albums.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join("");$("[data-album-select]").value=data.id;form.reset();$("[data-album-modal]").hidden=true;draw();say("Álbum criado.");}catch(error){say("Não foi possível criar o álbum.",$("[data-album-status]"));}finally{button.disabled=false;}});
  $("[data-back-albums]").addEventListener("click",()=>{activeAlbumId=null;kind="album";draw();});
  $("[data-album-select]").addEventListener("change",()=>{});
  grid.addEventListener("click",async e=>{const openAlbum=e.target.closest("[data-open-album]");const deleteAlbum=e.target.closest("[data-delete-album]");const add=e.target.closest("[data-album-add]");const remove=e.target.closest("[data-album-remove]");if(openAlbum){activeAlbumId=openAlbum.dataset.openAlbum;kind="album";$("[data-title-filter]").value="album";draw();return;}if(deleteAlbum){const album=albums.find(a=>a.id===deleteAlbum.dataset.deleteAlbum);if(!album||!confirm('Excluir o álbum "'+album.name+'"? As mídias originais não serão apagadas.'))return;const {error}=await client.from("gallery_albums").delete().eq("id",album.id).eq("owner_id",user.id);if(error){say("Não foi possível excluir o álbum.");return;}albums=albums.filter(a=>a.id!==album.id);albumItemKeys.delete(album.id);if(activeAlbumId===album.id)activeAlbumId=null;draw();say("Álbum excluído; as mídias originais foram preservadas.");return;}if(add){const albumId=$("[data-album-select]").value;if(!albumId){say("Selecione um álbum na barra de álbuns antes de adicionar mídia.");return;}const x=getItem(add.dataset.albumAdd);if(!x)return;const {error}=await client.from("gallery_album_items").upsert({album_id:albumId,source:x.source,media_id:x.id},{onConflict:"album_id,source,media_id"});if(error){say("Não foi possível adicionar esta mídia ao álbum.");return;}if(!albumItemKeys.has(albumId))albumItemKeys.set(albumId,new Set());albumItemKeys.get(albumId).add(mediaKey(x));draw();say("Mídia adicionada ao álbum.");return;}if(remove&&activeAlbumId){const x=getItem(remove.dataset.albumRemove);if(!x)return;const {error}=await client.from("gallery_album_items").delete().eq("album_id",activeAlbumId).eq("source",x.source).eq("media_id",x.id);if(error){say("Não foi possível remover a mídia do álbum.");return;}albumItemKeys.get(activeAlbumId)?.delete(mediaKey(x));draw();say("Mídia removida do álbum; o arquivo original foi preservado.");return;}});
  grid.addEventListener("click",e=>{const open=e.target.closest("[data-open-media]");const comments=e.target.closest("[data-comments]");const privateButton=e.target.closest("[data-toggle-private]");const del=e.target.closest("[data-admin-delete]");if(open)openViewer(open.dataset.openMedia);else if(comments){activeKey=comments.dataset.comments;loadComments();}else if(privateButton)togglePrivate(privateButton.dataset.togglePrivate);else if(del)deleteMedia(del.dataset.adminDelete);});
  $("[data-file-preview]").addEventListener("click",e=>{const remove=e.target.closest("[data-remove-file]");if(remove)removeFile(Number(remove.dataset.removeFile));});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"){if(!$("[data-camera-modal]").hidden)stopCamera();else if(!$("[data-comments-modal]").hidden)$("[data-comments-modal]").hidden=true;else if(!$("[data-viewer]").hidden)closeViewer();else if(!$("[data-upload-modal]").hidden)$("[data-upload-modal]").hidden=true;}if(!$("[data-viewer]").hidden&&e.key==="ArrowLeft")$("[data-previous]").click();if(!$("[data-viewer]").hidden&&e.key==="ArrowRight")$("[data-next]").click();});
  let touchX=0, pinchStart=0, zoomStart=1, viewerZoom=1;
  const setZoom = next => { const img=$("[data-viewer-media] img"); if(!img)return;viewerZoom=Math.min(4,Math.max(1,next));img.style.transform="scale("+viewerZoom+")";img.style.transformOrigin="center center";img.dataset.zoom=String(viewerZoom); };
  $("[data-zoom-in]").addEventListener("click",()=>setZoom(viewerZoom+0.25));
  $("[data-zoom-out]").addEventListener("click",()=>setZoom(viewerZoom-0.25));
  const touchDistance = touches => Math.hypot(touches[0].clientX-touches[1].clientX,touches[0].clientY-touches[1].clientY);
  $("[data-viewer]").addEventListener("touchstart",e=>{if(e.touches.length===2&&$("[data-viewer-media] img")){pinchStart=touchDistance(e.touches);zoomStart=viewerZoom;}else if(e.touches.length===1){touchX=e.touches[0].screenX;}},{passive:true});
  $("[data-viewer]").addEventListener("touchmove",e=>{if(e.touches.length===2&&pinchStart){e.preventDefault();setZoom(zoomStart*(touchDistance(e.touches)/pinchStart));}},{passive:false});
  $("[data-viewer]").addEventListener("touchend",e=>{if(e.touches.length<2)pinchStart=0;if(viewerZoom<=1.02&&e.changedTouches.length===1){const delta=e.changedTouches[0].screenX-touchX;if(Math.abs(delta)>70){if(delta<0)$("[data-next]").click();else $("[data-previous]").click();}}},{passive:true});
  $("[data-viewer]").addEventListener("wheel",e=>{const img=$("[data-viewer-media] img");if(!img||!e.ctrlKey)return;e.preventDefault();const current=Number(img.dataset.zoom||1);const next=Math.min(4,Math.max(1,current+(e.deltaY<0?0.15:-0.15)));setZoom(next);},{passive:false});
  try { await load(true); } catch (error) { console.error(error); say("Não foi possível carregar a Galeria. Verifique a conexão e tente novamente."); }
} });

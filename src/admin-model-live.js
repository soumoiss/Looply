/** Looply — Painel ADM real. Nenhuma informação de exemplo, nenhuma mutação local. */
import { looplyClient, activeSession, selfProfile, NEON_DATA_API_URL } from './neon-production-client.js';
import {adminExtendedKinds,renderAdminExtended,adminExtra,adminFinal} from './admin-model-extensions.js';

const $ = selector => document.querySelector(selector);
const el = (tag, className, text) => { const node=document.createElement(tag); if(className)node.className=className; if(text!==undefined)node.textContent=text; return node; };
const esc = value => String(value??'').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const date = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const iconPaths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z', users:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.9',mail:'M3 6h18v12H3z M3 7l9 6 9-6',chat:'M4 5h16v11H9l-5 4z',image:'M3 5h18v14H3z M3 17l5-5 4 4 3-3 6 5',music:'M9 18V5l11-2v13 M9 18a3 3 0 1 1-3-3 M20 16a3 3 0 1 1-3-3',mega:'M3 10v4h4l8 5V5l-8 5z M18 9a4 4 0 0 1 0 6',cog:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M4 12h2 M18 12h2 M12 4v2 M12 18v2',shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-9V6z',term:'M4 5h16v14H4z M8 10l3 2-3 2 M13 15h4',search:'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z M21 21l-5-5',moon:'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z',sun:'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v3 M12 20v3',back:'M15 5l-7 7 7 7',x:'M6 6l12 12 M18 6L6 18',check:'M5 12l5 5L20 7',lock:'M5 11h14v9H5z M8 11V8a4 4 0 0 1 8 0v3',refresh:'M20 11a8 8 0 1 0-2.3 6.3 M20 4v7h-7',star:'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',bell:'M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z M10 21h4',db:'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6',code:'M8 8l-5 4 5 4 M16 8l5 4-5 4',plus:'M12 5v14 M5 12h14',clock:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',game:'M6 12h4 M8 10v4 M15 12h.01 M18 11h.01 M4 7h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z',power:'M12 3v9 M6.3 6.3a8 8 0 1 0 11.4 0',flag:'M5 21V4h13l-2 4 2 4H5',phone:'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',list:'M8 6h13 M8 12h13 M8 18h13',radar:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 12l6-6 M12 17a5 5 0 1 0 0-10',down:'M12 3v12 M7 10l5 5 5-5 M4 20h16'};
const ico=name=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[name]||iconPaths.grid}"/></svg>`;

const categories=[['usr','Usuários','users'],['let','Cartas','mail'],['cht','Chat','chat'],['cnt','Conteúdo','image'],['mus','Música','music'],['com','Comunicação','mega'],['sys','Sistema','cog'],['sec','Segurança','shield'],['tool','Ferramentas','term']];
// A ausência de uma ação é deliberada: nenhum botão declara sucesso sem resposta do servidor.
const catalog=[
['u.list','usr','Gerenciar usuários','users','users'],['u.new','usr','Cadastrar usuário','plus','create-user'],['u.inv','usr','Gerar convites','mail','user-invites'],['u.pw','usr','Redefinir senha','lock','password-reset'],['u.ses','usr','Sessões ativas','power','active-sessions'],['u.vip','usr','Gerenciar VIP','star','vip-members'],
['l.all','let','Todas as cartas','mail','community_letters'],['l.log','let','Atividade de cartas privadas','lock','letter-log'],['l.sch','let','Fila de agendadas','clock','scheduled-letters'],['l.pw','let','Senhas das cartas','lock','community_letters'],['l.peix','let','Cartas para Peixinho','mail','letters'],['l.imp','let','Importar acervo','down','archive-import'],
['c.conv','cht','Conversas privadas','chat','conversations'],['c.grp','cht','Grupos','users','group-management'],['c.stk','cht','Pacotes de figurinhas','image','sticker-manager'],['c.rep','cht','Denúncias','flag','reports'],['c.wrd','cht','Filtro de palavras','shield','word-filter'],['c.gam','cht','Partidas de jogos','game','game-sessions'],['c.cal','cht','Registro de chamadas','phone','call-records'],
['m.mod','cnt','Moderação','shield','posts'],['m.sto','cnt','Stories','image','stories'],['m.gal','cnt','Galeria comunitária','image','community_gallery_media'],['m.old','cnt','Mídias antigas','image','archive_media'],
['s.day','mus','Música do dia','music','setting-song'],['s.cm','mus','Comentários por música','chat','youtube_track_comments'],['s.col','mus','Coleções pessoais','music','music_library'],['s.yt','mus','Playlists do YouTube','music','profiles'],
['b.glo','com','Comunicado global','mega','broadcast'],['b.vip','com','Recado secreto VIP','mail','secret'],['b.psh','com','Notificação push','bell','push-broadcast'],['b.hom','com','Boas-vindas da Home','mega','setting-welcome'],
['y.mnt','sys','Modo de manutenção','power','setting-maint'],['y.look','sys','Aparência','cog','appearance'],['y.flg','sys','Funcionalidades','flag','feature-flags'],['y.lim','sys','Limites','cog','limit-report'],['y.bkp','sys','Backup e exportação','down','server-backup'],['y.db','sys','Banco de dados','db','db-health'],
['a.aud','sec','Trilha de auditoria','list','audit'],['a.log','sec','Tentativas de login','shield','login-audits'],['a.ip','sec','Bloqueio de IP','lock','ip-blocks'],['a.rbc','sec','Permissões','users','role-permissions'],
['t.con','tool','Console','term','console'],['t.sql','tool','Consulta de dados','db','query'],['t.ins','tool','Inspetor de objetos','code','inspector'],['t.rad','tool','Radar em tempo real','radar','radar'],['t.hot','tool','Mapa de calor','grid','server-heatmap'],['t.rpt','tool','Relatórios','list','server-reports']
].map(([id,cat,name,icon,kind])=>({id,cat,name,icon,kind}));
const rawResources=new Set(['profiles','letters','community_letters','conversations','chat_messages','posts','stories','community_gallery_media','archive_media','music_library','music_dedications','youtube_track_comments','audit','archived_cards','post_media','archive_media_comments']);
const preferredFields=['id','username','display_name','name','email','suspended','is_active','created_at','updated_at','author_id','sender_id','recipient_id','conversation_id','type','kind','subject','title','is_protected','is_read','read_at','status','reason','action','resource_type','actor_id','user_id','letter_id','event_kind','letter_source','letter_label','expires_at','moderated'];
const sensitiveKey=/password|hash|secret|token|cipher|salt|private[_-]?key|authorization|encrypted|session[_-]?id|access[_-]?key|body|content|message[_-]?text|refresh|fcm|iv$/i;
const cleanRecord = obj => {
 const result={};for(const [k,v] of Object.entries(obj||{})){
  if(sensitiveKey.test(k))continue;
  if(preferredFields.includes(k)||k==='lastSignInAt'||k==='read_count')result[k]=v;
 }
 return result;
};

let toastTimer, currentTab='home', modalStack=[], verified=false, actor=null;
const dialog=$('#md'), modalBody=$('#mb');
function toast(message,isError=false){const node=$('#toast');node.textContent=String(message||'');node.style.color=isError?'var(--bad)':'var(--neon)';node.classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('on'),3500)}
function showEmpty(root,message='Nenhum registro'){root.append(el('p','cnt',message))}
function makeButton(label,onClick,cls=''){const button=el('button',`btn ${cls}`,label);button.type='button';button.addEventListener('click',onClick);return button}
function openView(title,render,root=false){if(root)modalStack=[];modalStack.push({title,render});drawModal();if(!dialog.open)dialog.showModal()}
function drawModal(){const page=modalStack.at(-1);if(!page)return;$('#mt').textContent=page.title;$('#mback').style.display=modalStack.length>1?'grid':'none';modalBody.replaceChildren();modalBody.scrollTop=0;try{const result=page.render(modalBody);if(result?.catch)result.catch(error=>showFailure(modalBody,error));}catch(error){showFailure(modalBody,error)}}
function backModal(){if(modalStack.length>1){modalStack.pop();drawModal()}else dialog.close()}
$('#mback').onclick=backModal;$('#mx2').onclick=()=>dialog.close();dialog.onclick=e=>{if(e.target===dialog)dialog.close()};dialog.onclose=()=>{modalStack=[]};
function showFailure(root,error){root.replaceChildren();const message=String(error?.message||error||'Falha no servidor');root.append(el('p','cnt',message));toast(message,true)}
function waiting(root){root.replaceChildren(el('p','cnt','Carregando…'))}
function form(root,fields,caption,handler){const node=el('form','frm');for(const f of fields){const label=el('label','f'),title=el('span',null,f.label),input=f.type==='textarea'?el('textarea'):f.type==='select'?el('select'):el('input');input.name=f.key;if(f.type==='select'){for(const [value,text] of f.options||[]){const op=el('option',null,text);op.value=value;input.append(op)}}else if(f.type!=='textarea')input.type=f.type||'text';input.value=f.value??'';input.required=!!f.required;if(f.minlength)input.minLength=f.minlength;label.append(title,input);node.append(label)}const submit=el('button','btn main',caption);submit.type='submit';node.append(submit);node.onsubmit=async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(node).entries());submit.disabled=true;try{const saved=await handler(data);if(saved?.temporaryPassword){node.replaceChildren(el('h3','sec','Senha temporária'),el('pre','js',saved.temporaryPassword));toast('Conta criada no servidor');await refreshDashboard();return}toast('Salvo no servidor');dialog.close();await refreshDashboard()}catch(error){toast(error.message,true)}finally{submit.disabled=false}};root.append(node);return node}
function confirmAction(label,action){openView('Confirmar',root=>{root.append(el('div','card',label));const buttons=el('div','bg2');buttons.append(makeButton('Confirmar',async()=>{try{await action();toast('Concluído no servidor');modalStack.pop();if(modalStack.length)drawModal();else dialog.close();await refreshDashboard()}catch(error){toast(error.message,true)}},'dg'),makeButton('Cancelar',backModal));root.append(buttons)})}
async function callAction(action,payload={}){
 if(!verified)throw Error('Acesso administrativo não autorizado');
 const request={...payload,action,purpose:String(payload.purpose||`Operação administrativa verificada: ${action}`)};
 const {data,error}=await looplyClient.functions.invoke('looply-admin',{body:request});if(error)throw Error(error.message||`Erro: ${action}`);
 if(data?.error)throw Error(data.error);return data;
}
async function panelAction(action,payload={}){
 if(!verified)throw Error('Acesso administrativo não autorizado');
 const session=await activeSession();if(!session?.access_token)throw Error('Sessão expirada');
 const response=await fetch(`${NEON_DATA_API_URL}/rpc/v26_admin_panel_action`,{
  method:'POST',cache:'no-store',headers:{authorization:`Bearer ${session.access_token}`,'content-type':'application/json',accept:'application/json'},
  body:JSON.stringify({p_action:action,p_payload:payload})
 });const body=await response.json().catch(()=>null);
 if(!response.ok)throw Error(String(body?.message||`Operação indisponível: ${action}`));return body;
}
async function readResource(resource,offset=0){if(!rawResources.has(resource))throw Error('Recurso não permitido');const response=await callAction('read',{resourceType:resource,offset,purpose:'Consulta administrativa verificada no Painel Looply'});return Array.isArray(response?.data)?response.data:Array.isArray(response?.data?.data)?response.data.data:Array.isArray(response?.records)?response.records:Array.isArray(response?.items)?response.items:(()=>{throw Error(`Resposta administrativa inválida: ${resource}`)})()}
/** Consulta de projeção explícita no servidor: nunca busca registro integral. */
async function safeQuery(resource,offset=0){
 if(!['profiles','community_letters','audit'].includes(resource))throw Error('Consulta não autorizada');
 if(!verified)throw Error('Sessão administrativa não autorizada');
 const session=await activeSession();if(!session?.access_token)throw Error('Sessão expirada');
 const response=await fetch(`${NEON_DATA_API_URL}/rpc/v26_admin_safe_query`,{
  method:'POST',cache:'no-store',headers:{authorization:`Bearer ${session.access_token}`,'content-type':'application/json',accept:'application/json'},
  body:JSON.stringify({p_resource:resource,p_offset:offset})
 });const result=await response.json().catch(()=>null);
 if(!response.ok)throw Error('Consulta segura indisponível no servidor');
 return Array.isArray(result?.data)?result.data:[];
}
async function directRead(table,columns='*'){
 const {data,error}=await looplyClient.from(table).select(columns).order('created_at',{ascending:false}).limit(200);
 if(error)throw Error(error.message||'Consulta indisponível');return Array.isArray(data)?data:[];
}
function presentRows(root,rows,renderRow,{label='registros',refresh,offset=0}={}){
 root.replaceChildren();const list=el('div','rows'),count=el('div','cnt',`${rows.length} ${label}`);const input=el('input');input.placeholder='Buscar';input.setAttribute('aria-label','Buscar');const search=el('label','srch');search.innerHTML=ico('search');search.append(input);root.append(search,list,count);
 let displayed=rows;
 const draw=()=>{list.replaceChildren();displayed=rows.filter(row=>JSON.stringify(cleanRecord(row)).toLowerCase().includes(input.value.trim().toLowerCase()));count.textContent=`${displayed.length} ${label}`;for(const row of displayed){const entry=el('button','r');entry.type='button';entry.innerHTML=`<span class="ico">${ico('list')}</span><span class="tx"><b>${esc(row.title||row.display_name||row.username||row.subject||row.action||row.name||row.id||'Registro')}</b><small>${esc(row.subtitle||row.created_at&&date(row.created_at)||row.email||row.id||'')}</small></span>`;entry.onclick=()=>renderRow(row);list.append(entry)}if(!displayed.length)showEmpty(list)};
 input.addEventListener('input',draw);draw();if(refresh){const pagination=el('div','bg2');pagination.append(makeButton('Anterior',()=>refresh(Math.max(0,offset-100))),makeButton('Próximos',()=>refresh(offset+100)));root.append(pagination)}
}
function recordPage(title,record){openView(title,root=>{const sanitized=cleanRecord(record);const pre=el('pre','js');pre.textContent=JSON.stringify(sanitized,null,2);root.append(pre)});}
async function resourcePage(title,resource,offset=0,filter=()=>true){openView(title,async root=>{waiting(root);const data=await readResource(resource,offset);presentRows(root,data.filter(filter),row=>openResourceRecord(resource,row),{refresh:next=>{modalStack.pop();resourcePage(title,resource,next,filter)},offset})},true)}
function openResourceRecord(resource,row){const title=row.subject||row.title||row.username||row.id||'Registro';openView(String(title),root=>{
 const pre=el('pre','js');pre.textContent=JSON.stringify(cleanRecord(row),null,2);root.append(pre);
 const kinds={posts:'post',stories:'story',community_gallery_media:'community_gallery_media',archive_media:'archive_media',community_letters:'community_letter',youtube_track_comments:'music_page_comment',music_library:'music_library',conversations:'conversation',chat_messages:'chat_message'};
 const kind=kinds[resource];if(kind&&row.id){const g=el('div','bg2');g.append(makeButton('Ocultar',()=>confirmAction(`Ocultar ${title}?`,()=>callAction('moderate_content',{contentType:kind,contentId:row.id,hidden:true}))),makeButton('Restaurar',()=>confirmAction(`Restaurar ${title}?`,()=>callAction('moderate_content',{contentType:kind,contentId:row.id,hidden:false}))));root.append(g)}
 if(['posts','stories','community_letters','community_gallery_media','youtube_track_comments'].includes(resource)){root.append(makeButton('Excluir',()=>confirmAction(`Excluir ${title}?`,()=>callAction('delete_content',{contentType:kinds[resource],contentId:row.id,confirmDelete:true})),'dg'))}
 });}
function unavailable(root){root.append(el('div','cnt','Ação indisponível no backend atual'))}
async function deleteAccount(root,user){
  waiting(root);
  const preview=await callAction('user_delete_preview',{userId:user.id});
  if(preview?.userId!==user.id||preview?.username!==user.username)
    throw Error('A conta não foi confirmada pelo servidor.');
  root.replaceChildren();
  const header=el('h3','sec','Excluir conta definitivamente');
  const info=el('div','cnt',
    'A autenticação e todas as sessões serão apagadas. A conta não poderá entrar novamente. '+
    'Cartas, conversas e outros históricos compartilhados serão preservados com o perfil anonimizado.');
  const formNode=el('form','frm');
  const target=el('strong','', '@'+user.username);
  const label=el('label','f');
  label.append(el('span',null,'Digite exatamente o username para confirmar:'),target);
  const input=el('input');input.type='text';input.required=true;
  input.autocomplete='off';input.spellcheck=false;
  input.setAttribute('aria-label','Confirme o username da conta');
  label.append(input);
  const consent=el('label','f');
  const check=el('input');check.type='checkbox';check.required=true;
  consent.append(check,el('span',null,'Entendo que a conta será excluída permanentemente e que os registros compartilhados permanecerão anonimizados.'));
  const buttons=el('div','bg2'),confirm=makeButton('Excluir conta permanentemente',()=>{},'dg');
  confirm.type='submit';confirm.disabled=true;
  const cancel=makeButton('Cancelar',backModal);
  const status=el('div','cnt');status.setAttribute('role','status');
  const toggle=()=>{confirm.disabled=input.value.trim()!==user.username||!check.checked};
  input.addEventListener('input',toggle);check.addEventListener('change',toggle);
  buttons.append(confirm,cancel);formNode.append(label,consent,buttons,status);
  formNode.onsubmit=async event=>{
    event.preventDefault();toggle();if(confirm.disabled)return;
    confirm.disabled=true;cancel.disabled=true;status.textContent='Excluindo conta…';
    try{
      const result=await callAction('user_delete_permanently',{
        userId:user.id,confirmUsername:input.value.trim(),
        confirmDelete:true,preserveSharedContent:true
      });
      if(result?.deleted!==true||result?.authDeleted!==true||result?.profileAnonymized!==true)
        throw Error('O servidor não confirmou a exclusão completa da autenticação.');
      modalStack=[];dialog.close();toast('Conta excluída e acesso revogado');
      await refreshDashboard();
    }catch(error){
      status.textContent=String(error?.message||'Exclusão não confirmada');
      toast(status.textContent,true);cancel.disabled=false;toggle();
    }
  };
  root.append(header,info,formNode);
}
async function listUsers(root){
  waiting(root);
  const payload=await callAction('users_list',{resourceType:'profiles'});
  if(!Array.isArray(payload?.users))throw Error('O servidor não retornou uma lista válida de usuários.');
  const users=payload.users.filter(u=>u?.id && u?.username&&!/^deleted_[0-9a-f]{20}$/.test(u.username));
  presentRows(root,users,u=>openView(u.display_name||u.username||'Usuário',body=>{
    const h=el('div','hd');
    h.innerHTML='<div class="av" style="--g1:#7010b0;--g2:#39ff9c">'+
      esc((u.display_name||u.username||'?').slice(0,1))+'</div><div><h4>'+
      esc(u.display_name||u.username||'')+'</h4><small>@'+esc(u.username||'')+'</small></div>';
    body.append(h,el('div','cnt',u.suspended?'Acesso suspenso':'Acesso ativo'));
    const actions=el('div','bg2');
    actions.append(makeButton('Editar perfil',()=>openView('Editar perfil',node=>
      form(node,[{key:'displayName',label:'Nome',value:u.display_name||'',required:true},
        {key:'bio',label:'Biografia',type:'textarea',value:u.bio||''},
        {key:'playlistUrl',label:'Playlist',value:u.playlist_url||''}],
        'Salvar',data=>callAction('user_update_profile',{userId:u.id,...data})))));
    if(String(u.username||'').toLowerCase()!=='peixinho'){
      actions.append(makeButton(u.suspended?'Restaurar acesso':'Suspender acesso',
        ()=>confirmAction((u.suspended?'Restaurar':'Suspender')+' @'+u.username+'?',async()=>{
          const nextSuspended=!u.suspended;
          const action=nextSuspended?'user_set_suspended':'user_restore_access';
          const response=await callAction(action,{userId:u.id});
          if(response?.updated!==true||response?.suspended!==nextSuspended)
            throw Error('O servidor não confirmou a mudança de acesso.');
          const check=await callAction('user_delete_preview',{userId:u.id});
          if(check?.suspended!==nextSuspended)
            throw Error('A alteração de acesso não persistiu no Neon Auth.');
          u.suspended=nextSuspended;
        }),u.suspended?'':'dg'));
      actions.append(makeButton('Excluir definitivamente',()=>openView(
        'Excluir @'+u.username,node=>deleteAccount(node,u)),'dg'));
    }
    body.append(actions);
    const pre=el('pre','js');pre.textContent=JSON.stringify(cleanRecord(u),null,2);
    body.append(pre);
  }),{label:'usuários'});
}
async function createUser(root){
  form(root,[
    {key:'username',label:'Username',required:true,minlength:3},
    {key:'displayName',label:'Nome completo',required:true},
    {key:'playlistUrl',label:'Playlist do YouTube'},
    {key:'password',label:'Senha inicial',type:'password'},
    {key:'confirm',label:'Confirmar senha',type:'password'}
  ],'Cadastrar',async data=>{
    data.username=String(data.username||'').trim().toLowerCase();
    data.displayName=String(data.displayName||'').trim();
    if(!/^[a-z0-9_]{3,30}$/.test(data.username))
      throw Error('Username deve ter de 3 a 30 caracteres: letras, números ou _.');
    if(!data.displayName||data.displayName.length>80)
      throw Error('Informe um nome de 1 a 80 caracteres.');
    if(data.password!==data.confirm)throw Error('As senhas não coincidem.');
    if(data.password&&(data.password.length<8||data.password.length>72))
      throw Error('A senha precisa ter entre 8 e 72 caracteres.');
    const result=await callAction('user_create_with_password',data);
    if(result?.created!==true||!/^[0-9a-f-]{36}$/i.test(String(result.userId||'')))
      throw Error('A criação da conta não foi confirmada no servidor.');
    return result;
  });
}
async function listLog(root){waiting(root);const rows=await directRead('looply_admin_letter_access_log');presentRows(root,rows,row=>recordPage('Leitura privada',row),{label:'eventos'})}
async function listReports(root){waiting(root);const rows=await panelAction('reports_list');presentRows(root,rows,row=>openView('Denúncia',body=>{recordInline(body,row);const actions=el('div','bg2');for(const [label,action] of [['Resolver','reports_resolve'],['Ignorar','reports_ignore']])actions.append(makeButton(label,()=>confirmAction(label+' denúncia?',()=>panelAction(action,{id:row.id}))));body.append(actions)}),{label:'denúncias'})}
async function words(root){waiting(root);const rows=await panelAction('word_list');const holder=el('div');root.replaceChildren();root.append(makeButton('Adicionar termo',()=>openView('Adicionar termo',b=>form(b,[{key:'term',label:'Termo',required:true}],'Adicionar',data=>panelAction('word_add',data))),'main'),holder);
 presentRows(holder,rows.map(r=>({...r,title:r.term})),row=>openView(row.term,b=>{recordInline(b,row);b.append(makeButton('Remover termo',()=>confirmAction('Remover '+row.term+'?',()=>panelAction('word_remove',{id:row.id})),'dg'))}),{label:'termos'});
}
async function listScheduled(root){waiting(root);try{const rows=await directRead('scheduled_letters');presentRows(root,rows,row=>recordPage('Carta agendada',row),{label:'cartas agendadas'})}catch(e){showFailure(root,e)}}
async function settingsForm(root,area){waiting(root);const settings=await looplyClient.from('app_settings').select('*').eq('id',1).single();if(settings.error)throw Error(settings.error.message);const s=settings.data||{};
 const fields=area==='maint'?[{key:'maintenance_mode',label:'Modo de manutenção',type:'select',options:[['true','Ativado'],['false','Desativado']],value:String(!!s.maintenance_mode)},{key:'maintenance_message',label:'Mensagem',value:s.maintenance_message||''}]:area==='welcome'?[{key:'welcome_banner_text',label:'Boas-vindas',type:'textarea',value:s.welcome_banner_text||''}]:[{key:'music_of_the_day_title',label:'Música do dia',value:s.music_of_the_day_title||''},{key:'music_of_the_day_url',label:'URL do YouTube',value:s.music_of_the_day_url||''}];root.replaceChildren();form(root,fields,'Salvar',values=>callAction('app_settings_update',{settings:area==='maint'?{...values,maintenance_mode:values.maintenance_mode==='true'}:values}));
}
async function broadcasts(root){waiting(root);const result=await callAction('broadcast_list');const items=result.announcements||[];root.replaceChildren();const list=el('div');root.append(makeButton('Publicar comunicado',()=>openView('Novo comunicado',b=>form(b,[{key:'title',label:'Título',required:true},{key:'body',label:'Mensagem',type:'textarea',required:true},{key:'expiresAt',label:'Expira em',type:'datetime-local'}],'Publicar',d=>callAction('broadcast_create',{...d,expiresAt:d.expiresAt||null}))),'main'));
 root.append(list);presentRows(list,items,row=>openView(row.title||'Comunicado',b=>{recordInline(b,row);if(row.is_active)b.append(makeButton('Desativar',()=>confirmAction(`Desativar ${row.title}?`,()=>callAction('broadcast_deactivate',{announcementId:row.id})),'dg'))}),{label:'comunicados'});
}
function recordInline(root,row){const pre=el('pre','js');pre.textContent=JSON.stringify(cleanRecord(row),null,2);root.append(pre)}
async function secrets(root){waiting(root);const result=await callAction('secret_list');root.replaceChildren();const list=el('div');root.append(makeButton('Novo recado secreto',()=>openView('Recado VIP',b=>form(b,[{key:'recipientId',label:'UUID destinatário',required:true},{key:'title',label:'Título'},{key:'content',label:'Recado',type:'textarea',required:true}],'Enviar',d=>callAction('secret_create',d))),'main'));root.append(list);presentRows(list,result.messages||[],row=>openView('Recado',b=>{recordInline(b,row);if(!row.is_read)b.append(makeButton('Cancelar',()=>confirmAction('Cancelar recado?',()=>callAction('secret_cancel',{secretId:row.id})),'dg'))}),{label:'recados'})}
function appearance(root){root.append(makeButton('Alternar tema',toggleTheme),makeButton('Alternar Matrix',toggleMatrix))}
/** Diagnóstico somente de leitura, com verificações reais e sem tokens nos resultados. */
async function dbHealth(root){
 waiting(root);
 const probes=[
  ['Identidade ADM',async()=>{const status=await callAction('status');if(status?.isAdmin!==true)throw Error('Sessão sem autorização');return 'Verificada'}],
  ['Usuários',async()=>{const data=await callAction('users_list');if(!Array.isArray(data?.users))throw Error('Resposta inválida');return `${data.users.length} registros`}],
  ['Comunicados',async()=>{const data=await callAction('broadcast_list');if(!Array.isArray(data?.announcements))throw Error('Resposta inválida');return `${data.announcements.length} registros`}],
  ['Trilha de auditoria',async()=>{const rows=await readResource('audit');return `${rows.length} registros na página`}],
  ['Leituras privadas',async()=>{const rows=await directRead('looply_admin_letter_access_log','id,actor_id,event_kind,created_at');return `${rows.length} registros acessíveis`}],
  ['Denúncias',async()=>{const rows=await panelAction('reports_list');if(!Array.isArray(rows))throw Error('Resposta inválida');return `${rows.length} registros`}],
  ['Filtro de palavras',async()=>{const rows=await panelAction('word_list');if(!Array.isArray(rows))throw Error('Resposta inválida');return `${rows.length} termos`}],
  ['Consulta segura',async()=>{await safeQuery('profiles');return 'RPC disponível'}]
 ];
 const checkArray=(label,action,payload={},kind='extended',endpoint='')=>[
  label,async()=>{
    const result=kind==='extended'?await adminExtra(action,payload):
      kind==='final'?await adminFinal(action,payload):
      await adminFinal(action,payload,endpoint);
    if(!Array.isArray(result))throw Error('Resposta inválida: '+action);
    return result.length+' registros (leitura)';
  }
 ];
 probes.push(
  checkArray('VIP','vip_list'),
  checkArray('Sessões','sessions_list',{offset:0}),
  checkArray('Convites','invites_list',{offset:0}),
  checkArray('Funcionalidades','features_list'),
  checkArray('Figurinhas','stickers_list',{offset:0}),
  checkArray('Partidas','games_list',{offset:0}),
  checkArray('Permissões','roles_list',{offset:0}),
  checkArray('Mapa de calor','heatmap'),
  checkArray('Login','login_attempts_list',{offset:0},'final'),
  checkArray('Bloqueio de IP','ip_list',{},'final'),
  checkArray('Limites','limits_list',{},'final'),
  checkArray('Notificações push','push_list',{offset:0},'final'),
  checkArray('Grupos','groups_list',{},'groups','v48_admin_groups_calls'),
  checkArray('Chamadas','calls_list',{},'groups','v48_admin_groups_calls'),
  ['Estatísticas',async()=>{
    const value=await adminExtra('stats');
    if(!value||typeof value!=='object'||!value.checked_at)
      throw Error('Estatísticas não confirmadas');
    return 'Servidor respondeu';
  }],
  ['Suspensão / sessão',async()=>{
    const session=await activeSession();
    if(!session?.access_token)throw Error('Sessão expirada');
    const response=await fetch(NEON_DATA_API_URL+'/rpc/v54_self_account_access',{
      method:'POST',cache:'no-store',
      headers:{authorization:'Bearer '+session.access_token,
        accept:'application/json','content-type':'application/json'},body:'{}'
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok||data?.allowed!==true)
      throw Error('Proteção de contas não confirmada');
    return 'Identidade ativa verificada';
  }]
 );
 root.replaceChildren();
 const list=el('div','rows');root.append(makeButton('Verificar novamente',()=>dbHealth(root)),list);
 const results=[];
 for(let i=0;i<probes.length;i+=5){
  const batch=await Promise.all(probes.slice(i,i+5).map(async([label,probe])=>{
   try{return {label,ok:true,detail:await probe()}}
   catch(error){return {label,ok:false,detail:String(error?.message||'Indisponível').slice(0,140)}}
  }));
  results.push(...batch);
 }
 for(const item of results){
  const row=el('div','r');row.style.cursor='default';
  const symbol=el('span','chip '+(item.ok?'ok':'bad'),item.ok?'OK':'ERRO');
  const content=el('span','tx');content.append(el('b',null,item.label),el('small',null,item.detail));
  row.append(symbol,content);list.append(row);
 }
 const succeeded=results.filter(x=>x.ok).length;
 root.append(el('div','cnt',`${succeeded}/${probes.length} integrações confirmadas`));
}
function stickers(root){root.append(makeButton('Importar pacotes ZIP',()=>window.location.assign('admin-importar-figurinhas.html?origem=admin'),'main'))}
const runModule = async(item,root)=>{
 const kind=item.kind;
 if(adminExtendedKinds.has(kind))return renderAdminExtended(kind,root,{openView,confirmAction,form,toast,recordInline});
 if(kind==='users')return listUsers(root);if(kind==='create-user')return createUser(root);if(kind==='letter-log')return listLog(root);if(kind==='scheduled-letters')return listScheduled(root);if(kind==='reports')return listReports(root);if(kind==='word-filter')return words(root);if(kind==='stickers-link')return stickers(root);if(kind==='broadcast')return broadcasts(root);if(kind==='secret')return secrets(root);
 if(kind.startsWith('setting-'))return settingsForm(root,kind.split('-')[1]);if(kind==='appearance')return appearance(root);if(kind==='db-health')return dbHealth(root);if(kind==='console')return renderConsole(root);
 if(kind==='query'||kind==='inspector')return renderQuery(root);if(kind==='radar')return radar(root);if(kind==='heatmap')return heatMap(root);if(kind==='reports-view')return reportsView(root);
 if(rawResources.has(kind)){
  waiting(root);const rows=await readResource(kind);const subset=item.id==='l.pw'?rows.filter(x=>x.is_protected):item.id==='c.grp'?rows.filter(x=>x.kind==='group'):rows;
  presentRows(root,subset,row=>openResourceRecord(kind,row),{label:'registros',refresh:offset=>{modalStack.pop();resourcePage(item.name,kind,offset)}});return;
 }
 unavailable(root);
};
function openModule(item){if(item.kind==='console'){changeTab('con');return}openView(item.name,root=>runModule(item,root),true)}
function renderModules(filter=''){const root=$('#v-mods');root.replaceChildren();const search=el('label','srch');search.innerHTML=ico('search');const input=el('input');input.placeholder='Buscar funções';input.value=filter;search.append(input);root.append(search);const groups=el('div');root.append(groups);const draw=()=>{groups.replaceChildren();for(const [cat,name] of categories){const items=catalog.filter(x=>x.cat===cat&&x.name.toLowerCase().includes(input.value.toLowerCase()));if(!items.length)continue;const header=el('h3','sec',name);groups.append(header);const tiles=el('div','cats');for(const item of items){const button=el('button','cat');button.type='button';button.innerHTML=`<span class="ci">${ico(item.icon)}</span><span><b>${esc(item.name)}</b></span>`;button.onclick=()=>openModule(item);tiles.append(button)}groups.append(tiles)}};input.addEventListener('input',draw);draw()}
function renderHome(){const root=$('#v-home');root.replaceChildren();const card=el('div','card br');card.innerHTML=`<div class="term"><span class="pr">root@looply</span>:<b>~</b>$ painel --live<span class="cur"></span></div>`;root.append(card);const kpis=el('div','kpis');root.append(kpis);for(const item of [['Usuários','users_list','users'],['Comunicados','broadcast_list','announcements'],['Auditoria','read','audit']]){const cell=el('div','kpi');cell.innerHTML=`<small>${esc(item[0])}</small><b>—</b><span class="d">NEON</span>`;kpis.append(cell);(async()=>{try{const data=item[1]==='read'?await readResource('audit'):await callAction(item[1]);const list=item[1]==='read'?data:data[item[2]];cell.querySelector('b').textContent=Array.isArray(list)?String(list.length):'—'}catch{cell.querySelector('.d').textContent='OFF'}})();}
 root.append(el('h3','sec','Acesso rápido'));const shortcuts=el('div','qa');for(const id of ['u.list','l.log','m.mod','b.glo','y.mnt','a.aud']){const item=catalog.find(x=>x.id===id);const button=el('button','qb');button.innerHTML=ico(item.icon)+esc(item.name);button.onclick=()=>openModule(item);shortcuts.append(button)}root.append(shortcuts);root.append(el('h3','sec','Registro real'));const activity=el('div','card');root.append(activity);loadAudit(activity)}
async function loadAudit(root){try{const rows=await readResource('audit');root.replaceChildren();const feed=el('div','feed');for(const row of rows.slice(0,15)){const line=el('div');line.innerHTML=`<time>${esc(date(row.created_at))}</time><span class="t-s">${esc(row.action||'ação')}</span>`;feed.append(line)}root.append(feed);if(!rows.length)showEmpty(root)}catch(error){root.replaceChildren(el('p','cnt','Auditoria indisponível'))}}
async function refreshDashboard(){if(verified){renderHome();if(currentTab==='log')loadAudit($('#v-log'))}}
function renderQuery(root){const resources=['profiles','community_letters','audit'];const choices=el('div','seg');for(const name of resources){const button=el('button','',name);button.onclick=async()=>{for(const x of choices.children)x.classList.toggle('on',x===button);const results=choices.nextElementSibling;waiting(results);try{const rows=await safeQuery(name);const pre=el('pre','js');pre.textContent=JSON.stringify(rows.slice(0,100).map(cleanRecord),null,2);results.replaceChildren(pre)}catch(error){showFailure(results,error)}};choices.append(button)}root.append(choices,el('div','rows'))}
function renderConsole(root){root.replaceChildren();const commands=['help','status','users','letters','broadcasts','audit','clear'];const suggestion=el('div','sugg');root.append(suggestion);const box=el('div','con');box.innerHTML='<div class="out" role="log" aria-live="polite"></div><form class="in"><span>root@looply$</span><input aria-label="Comando" autocomplete="off"></form>';root.append(box);const output=box.querySelector('.out'),input=box.querySelector('input'),print=(s)=>{const line=el('div');line.textContent=String(s);output.append(line);output.scrollTop=output.scrollHeight};
 print('Looply / Neon / sessão verificada');for(const cmd of commands){const b=el('button','',cmd);b.onclick=()=>{input.value=cmd;input.focus()};suggestion.append(b)};
 box.querySelector('form').onsubmit=async e=>{e.preventDefault();const value=input.value.trim();input.value='';if(!value)return;print('> '+value);const [cmd,...args]=value.split(' ');try{
  if(cmd==='clear'){output.replaceChildren();return}if(cmd==='help'){print('help | status | users | letters | broadcasts | audit | maint on/off | ban UUID | restore UUID | set welcome TEXTO');return}
  if(cmd==='status')print(JSON.stringify(await callAction('status')));
  else if(cmd==='users')print(JSON.stringify((await callAction('users_list')).users?.map(cleanRecord)||[]));
  else if(cmd==='broadcasts')print(JSON.stringify((await callAction('broadcast_list')).announcements?.map(cleanRecord)||[]));
  else if(cmd==='audit'||cmd==='letters')print(JSON.stringify((await safeQuery(cmd==='audit'?'audit':'community_letters')).map(cleanRecord)));
  else if(cmd==='maint'&&['on','off'].includes(args[0])){await callAction('app_settings_update',{settings:{maintenance_mode:args[0]==='on'}});print('OK: servidor confirmou')}
  else if(['ban','restore'].includes(cmd)&&/^[0-9a-f-]{36}$/i.test(args[0]||'')){await callAction(cmd==='ban'?'user_set_suspended':'user_restore_access',{userId:args[0]});print('OK: servidor confirmou')}
  else if(cmd==='set'&&args[0]==='welcome'&&args.slice(1).join(' ')){await callAction('app_settings_update',{settings:{welcome_banner_text:args.slice(1).join(' ')}});print('OK: servidor confirmou')}
  else print('Comando indisponível');
 }catch(err){print('ERRO: '+err.message)}};
}
function radar(root){root.append(el('p','cnt','Eventos confirmados pelo Neon'));const activity=el('div','feed');root.append(activity);loadAudit(activity);const refresh=makeButton('Atualizar',()=>loadAudit(activity));root.append(refresh)}
async function heatMap(root){waiting(root);try{const rows=await readResource('audit');const counts=new Array(7).fill(0);for(const row of rows){const d=new Date(row.created_at);if(!isNaN(d))counts[d.getDay()]++}root.replaceChildren();for(let i=0;i<7;i++){const card=el('div','card');card.textContent=`${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][i]} · ${counts[i]}`;root.append(card)}}catch(error){showFailure(root,error)}}
async function reportsView(root){waiting(root);const [users,audit]=await Promise.all([callAction('users_list'),readResource('audit')]);root.replaceChildren();for(const [name,count] of [['Usuários',users.users?.length],['Operações de auditoria',audit.length]])root.append(el('div','card',`${name}: ${count??'—'}`))}
function changeTab(tab){currentTab=tab;for(const [key,id] of [['home','#v-home'],['mods','#v-mods'],['con','#v-con'],['log','#v-log']])$(id).classList.toggle('on',key===tab);for(const button of $('#dock').querySelectorAll('button'))button.classList.toggle('on',button.dataset.tab===tab);
 const active=$('#dock').querySelector('button.on');const liquid=$('#dock .liq');if(active){liquid.style.width=`${active.getBoundingClientRect().width}px`;liquid.style.transform=`translateX(${active.offsetLeft}px)`}
 if(tab==='home')renderHome();if(tab==='mods')renderModules();if(tab==='con')renderConsole($('#v-con'));if(tab==='log')loadAudit($('#v-log'));
}
function toggleTheme(){const root=document.documentElement;root.dataset.theme=root.dataset.theme==='light'?'dark':'light';try{localStorage.setItem('looply-adm-theme',root.dataset.theme)}catch{}}
let matrixEnabled=true, animation=0;
function toggleMatrix(){matrixEnabled=!matrixEnabled;$('#mx').style.display=matrixEnabled?'block':'none';try{localStorage.setItem('looply-adm-matrix',matrixEnabled?'1':'0')}catch{}if(matrixEnabled)drawMatrix()}
function drawMatrix(){if(!matrixEnabled||animation)return;const canvas=$('#mx');const ctx=canvas.getContext('2d');if(!ctx)return;let columns=[],last=0;
 const frame=now=>{if(!matrixEnabled){cancelAnimationFrame(animation);animation=0;return}if(now-last>110){last=now;const width=window.innerWidth,height=window.innerHeight;if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;columns=Array.from({length:Math.ceil(width/18)},()=>0)}ctx.fillStyle='rgba(8,5,15,.13)';ctx.fillRect(0,0,width,height);ctx.font='12px monospace';ctx.fillStyle='#39ff9c';columns.forEach((v,i)=>{ctx.fillText(String.fromCharCode(0x30a0+((i*17+Math.floor(now/600))%90)),i*18,v*18);columns[i]=v*18>height&&Math.random()>.985?0:v+1})}animation=requestAnimationFrame(frame)};animation=requestAnimationFrame(frame)}
function setupPalette(){const palette=$('#pal'),query=$('#palQ'),results=$('#palR');const close=()=>palette.hidden=true;const open=()=>{palette.hidden=false;query.value='';search();query.focus()};const search=()=>{results.replaceChildren();for(const item of catalog.filter(x=>x.name.toLowerCase().includes(query.value.toLowerCase())).slice(0,25)){const b=el('button');b.innerHTML=`${ico(item.icon)}<span>${esc(item.name)}</span>`;b.onclick=()=>{close();openModule(item)};results.append(b)}};query.oninput=search;palette.onclick=e=>{if(e.target===palette)close()};$('#bPal').onclick=open;document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open()}if(e.key==='Escape')close()});}
function authorizedLayout(){verified=true;try{document.documentElement.dataset.theme=localStorage.getItem('looply-adm-theme')==='light'?'light':'dark';matrixEnabled=localStorage.getItem('looply-adm-matrix')!=='0'}catch{}$('#mx').style.display=matrixEnabled?'block':'none';if(matrixEnabled)drawMatrix();$('#bPal').innerHTML=ico('search');$('#bMx').innerHTML=ico('grid');$('#bTh').innerHTML=ico('moon');$('#bMx').onclick=toggleMatrix;$('#bTh').onclick=toggleTheme;$('#mback').innerHTML=ico('back');$('#mx2').innerHTML=ico('x');$('#palI').innerHTML=ico('search');
 const dock=$('#dock');for(const [id,label,icon] of [['home','Painel','grid'],['mods','Módulos','list'],['con','Console','term'],['log','Registro','clock']]){const b=el('button');b.type='button';b.dataset.tab=id;b.innerHTML=ico(icon)+`<span>${label}</span>`;b.onclick=()=>changeTab(id);dock.append(b)}setupPalette();changeTab('home');}
async function boot(){const overlay=$('#boot');overlay.textContent='LOOPLY // NEON AUTH';try{
 const session=await activeSession();if(!session?.access_token)throw Error('Sessão expirada');const status=await looplyClient.functions.invoke('looply-admin',{body:{action:'status'}});
 if(status.error||status.data?.isAdmin!==true)throw Error('Acesso administrativo negado');const profile=await selfProfile(session);if(String(profile?.username||'').toLowerCase()!=='peixinho')throw Error('Acesso reservado ao Peixinho');actor=profile;
 authorizedLayout();overlay.classList.add('out');window.setTimeout(()=>overlay.remove(),600);
 }catch(error){overlay.classList.remove('out');overlay.replaceChildren();const msg=el('div','',String(error?.message||'Acesso negado'));const link=el('a','', 'Voltar ao Looply');link.href='home.html';link.style.color='#39ff9c';overlay.append(msg,link);}}
boot();

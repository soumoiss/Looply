/** Módulos operacionais adicionais — somente respostas da API Neon verificadas. */
import {activeSession, NEON_DATA_API_URL, neon, looplyClient} from './neon-production-client.js';
import {archiveImportMarkup,bindArchiveImport} from './archive-import.js';

export const adminExtendedKinds = new Set([
 'vip-members','active-sessions','user-invites','feature-flags','game-sessions',
 'call-records','group-management','sticker-manager','role-permissions',
 'server-backup','server-heatmap','server-reports',
 'password-reset','archive-import','push-broadcast','login-audits','ip-blocks','limit-report'
]);

export async function adminExtra(action,payload={}){
 const session=await activeSession();
 if(!session?.access_token)throw Error('Sessão expirada');
 const response=await fetch(NEON_DATA_API_URL+'/rpc/v47_admin_extended_action',{
  method:'POST',cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,accept:'application/json','content-type':'application/json'},
  body:JSON.stringify({p_action:action,p_payload:payload})
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok||data===null||data?.error||data?.success===false)throw Error(data?.message||data?.error||'Ação administrativa indisponível: '+action);
 return data;
}

export async function adminFinal(action,payload={},endpoint='v48_admin_final_actions'){
 const session=await activeSession();
 if(!session?.access_token)throw Error('Sessão expirada');
 const response=await fetch(NEON_DATA_API_URL+'/rpc/'+endpoint,{
  method:'POST',cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,accept:'application/json','content-type':'application/json'},
  body:JSON.stringify({p_action:action,p_payload:payload})
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok||data===null||data?.error||data?.success===false)throw Error(data?.message||data?.error||'Operação indisponível: '+action);
 return data;
}

async function adminExport(resource,format,offset){
 const session=await activeSession();
 if(!session?.access_token)throw Error('Sessão expirada');
 const response=await fetch(NEON_DATA_API_URL+'/rpc/v47_admin_export',{
  method:'POST',cache:'no-store',
  headers:{authorization:'Bearer '+session.access_token,accept:'application/json','content-type':'application/json'},
  body:JSON.stringify({p_resource:resource,p_format:format,p_offset:offset})
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data||typeof data.content!=='string'||!Number.isInteger(data.count))
  throw Error(data?.message||'Exportação não confirmada');
 return data;
}
const elem=(tag,cls='',value)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(value!==undefined)e.textContent=String(value);return e;};
function btn(label,onClick,className=''){
 const b=elem('button','btn '+className,label);b.type='button';b.onclick=onClick;return b;
}
function line(container,label,value){const e=elem('div','r');e.append(elem('strong','',label),elem('span','',value));container.append(e);}
function empty(container){container.append(elem('p','cnt','Nenhum registro'));}

export async function renderAdminExtended(kind,root,ui,offset=0){
 const {openView,confirmAction,form,toast,recordInline}=ui;
 root.replaceChildren(elem('p','cnt','Carregando…'));
 const retry=()=>renderAdminExtended(kind,root,ui,offset);
 const showError=error=>{root.replaceChildren(elem('p','cnt',String(error?.message||error||'Operação indisponível')));root.append(btn('Tentar novamente',retry));};
 const list=(data,titleFn,subtitleFn,openRow)=>{
  root.replaceChildren();
  const wrap=elem('div','rows');root.append(wrap);
  if(!Array.isArray(data))throw Error('Resposta inválida do servidor');
  if(!data.length)empty(wrap);
  for(const item of data){
   const b=elem('button','r');b.type='button';
   b.append(elem('strong','',titleFn(item)),elem('small','',subtitleFn(item)));
   b.onclick=()=>openRow(item);
   wrap.append(b);
  }
  const tools=elem('div','bg2');
  tools.append(btn('Atualizar',retry));
  if(offset>0)tools.append(btn('Anterior',()=>renderAdminExtended(kind,root,ui,Math.max(0,offset-200))));
  if(data.length===200)tools.append(btn('Mais registros',()=>renderAdminExtended(kind,root,ui,offset+200)));
  root.append(tools);
 };
 const runMutation=async(action,payload)=>{
  const result=await adminExtra(action,payload);
  const check=({
    vip_set:()=>result?.userId===payload.userId&&result.enabled===payload.enabled,
    features_set:()=>result?.feature===payload.feature&&result.enabled===payload.enabled,
    sessions_revoke:()=>result?.revoked===true&&result.id===payload.id,
    stickers_set:()=>result?.id===payload.id&&result.is_active===payload.enabled,
    groups_rename:()=>result?.id===payload.id&&result.subject===payload.subject,
    games_finish:()=>result?.id===payload.id&&result.status==='finished'
  })[action];
  if(!check||!check())throw Error('O Neon não confirmou a alteração administrativa.');
  toast('Confirmado pelo Neon');
  return result;
 };
 try{

 if(kind==='password-reset'){
  const api=neon.auth?.getBetterAuthInstance?.()?.admin || neon.auth?.admin;
  if(typeof api?.listUsers!=='function'||typeof api?.setUserPassword!=='function')
   throw Error('API administrativa de senha do Neon Auth indisponível');
  const response=await api.listUsers({query:{limit:200}});
  if(response.error)throw Error(response.error.message||'Não foi possível listar as contas');
  const users=response.data?.users;
  if(!Array.isArray(users))throw Error('Resposta de contas inválida');
  list(users,x=>(x.name||x.email||'Conta'),x=>(x.email||'')+' · '+(x.role||'user'),x=>openView('Redefinir senha',body=>{
   body.append(elem('div','cnt',x.name||x.email||x.id));
   form(body,[{key:'password',label:'Nova senha',type:'password',required:true},
    {key:'confirm',label:'Confirmar senha',type:'password',required:true}],
    'Redefinir',async fields=>{
     if(fields.password!==fields.confirm)throw Error('As senhas não coincidem');
     if(fields.password.length<8)throw Error('A senha precisa ter pelo menos 8 caracteres');
     const saved=await api.setUserPassword({userId:x.id,newPassword:fields.password});
     if(saved.error)throw Error(saved.error.message||'Neon Auth rejeitou a senha');
     return {updated:true};
    });
  }));
 }else if(kind==='archive-import'){
  root.innerHTML=archiveImportMarkup();
  bindArchiveImport(root,looplyClient);
 }else if(kind==='push-broadcast'){
  const users=await adminExtra('vip_list');
  const choices=[['','Todos os usuários'],...users.map(u=>[u.id,'@'+u.username])];
  root.replaceChildren();
  form(root,[{key:'targetUserId',label:'Destinatários',type:'select',options:choices},
   {key:'title',label:'Título',required:true},
   {key:'body',label:'Mensagem',type:'textarea',required:true}],
   'Enviar notificação',async values=>{
    const saved=await adminFinal('push_create',{title:values.title,body:values.body,targetUserId:values.targetUserId||null});
    toast('Notificação registrada para '+saved.recipients+' usuário(s)');
    return saved;
   });
  const history=await adminFinal('push_list',{offset});
  const wrap=elem('div','rows');root.append(wrap);
  if(!history.length)empty(wrap);
  for(const row of history){const line=elem('div','r');line.append(elem('strong','',row.title),
   elem('small','',row.recipient_count+' destinatários · '+new Date(row.created_at).toLocaleString('pt-BR')));wrap.append(line);}
 }else if(kind==='login-audits'){
  const attempts=await adminFinal('login_attempts_list',{offset});
  list(attempts,x=>'@'+(x.username||'conta sem perfil'),
   x=>(x.origin==='neon_auth'?'Sessão confirmada':'Falha informada pelo navegador')+' · '+new Date(x.created_at).toLocaleString('pt-BR'),
   x=>openView('Registro de acesso',body=>recordInline(body,x)));
 }else if(kind==='ip-blocks'){
  const blocks=await adminFinal('ip_list');
  list(blocks,x=>x.network,x=>x.reason||'Bloqueio de acesso',x=>openView('IP ou rede',body=>{
   recordInline(body,x);
   body.append(btn('Desbloquear',()=>confirmAction('Remover bloqueio de '+x.network+'?',
     ()=>adminFinal('ip_remove',{network:x.network})),'dg'));
  }));
  root.prepend(btn('Bloquear IP ou rede',()=>openView('Bloquear IP',body=>
   form(body,[{key:'network',label:'IP ou CIDR',required:true},
    {key:'reason',label:'Motivo'}],'Bloquear',
    values=>adminFinal('ip_add',values))),'main'));
 }else if(kind==='limit-report'){
  const limits=await adminFinal('limits_list');
  list(limits,x=>x.table+' · '+x.constraint,x=>String(x.rule||'').slice(0,140),
    x=>openView('Regra do servidor',body=>recordInline(body,x)));
 }else if(kind==='vip-members'){
  const data=await adminExtra('vip_list',{offset});
  list(data,x=>'@'+x.username,x=>x.enabled?'VIP':'Padrão',x=>openView('@'+x.username,body=>{
   recordInline(body,x);
   body.append(btn(x.enabled?'Remover VIP':'Conceder VIP',()=>confirmAction('Alterar VIP de @'+x.username+'?',()=>runMutation('vip_set',{userId:x.id,enabled:!x.enabled}))));
  }));
 }else if(kind==='active-sessions'){
  const data=await adminExtra('sessions_list',{offset});
  list(data,x=>'@'+(x.username||'sem perfil'),x=>(x.active?'Ativa':'Expirada')+' · '+new Date(x.created_at).toLocaleString('pt-BR'),x=>openView('Sessão',body=>{
   recordInline(body,{id:x.id,username:x.username,created_at:x.created_at,expires_at:x.expires_at,active:x.active});
   if(x.active)body.append(btn('Encerrar sessão',()=>confirmAction('Encerrar esta sessão?',()=>runMutation('sessions_revoke',{id:x.id})),'dg'));
  }));
 }else if(kind==='user-invites'){
  const data=await adminExtra('invites_list',{offset});
  list(data,x=>'@'+x.username,x=>x.display_name+' · '+new Date(x.expires_at).toLocaleDateString('pt-BR'),x=>openView(x.username,body=>recordInline(body,x)));
  root.prepend(btn('Criar convites em lote',()=>openView('Novos convites',body=>{
   form(body,[{key:'batch',label:'username;Nome — uma pessoa por linha',type:'textarea',required:true}],'Cadastrar convites',async value=>{
    const entries=value.batch.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(!entries.length)throw Error('Informe ao menos um convite');
    let created=0;const failures=[];
    for(const entry of entries){
     const i=entry.indexOf(';');
     if(i<1){failures.push(entry+': formato inválido');continue}
     try{await adminExtra('invites_create',{username:entry.slice(0,i).trim(),displayName:entry.slice(i+1).trim()});created++}
     catch(error){failures.push(entry+': '+error.message)}
    }
    if(failures.length)throw Error(created+' criados; falhas: '+failures.slice(0,8).join(' | '));
    return {created};
   });
  }),'main'));
 }else if(kind==='feature-flags'){
  const flags=await adminExtra('features_list');
  list(flags,x=>({'chat':'Chat','cartas':'Cartas','feed':'Feed','reels':'Reels','music':'Músicas','gallery':'Galeria','stories':'Why Now','games':'Jogos','calls':'Chamadas'}[x.feature]||x.feature),
   x=>x.enabled?'Ativado':'Desativado',
   x=>openView('Funcionalidade',body=>{
    recordInline(body,x);
    body.append(btn(x.enabled?'Desativar':'Ativar',()=>confirmAction('Alterar '+x.feature+' para todos os usuários?',()=>runMutation('features_set',{feature:x.feature,enabled:!x.enabled})),x.enabled?'dg':'main'));
   }));
 }else if(kind==='group-management'){
  const groups=await adminFinal('groups_list',{},'v48_admin_groups_calls');
  list(groups,x=>x.subject||'Grupo sem nome',x=>x.members+' participantes'+(x.archived_at?' · arquivado':''),x=>openView('Grupo',body=>{
   recordInline(body,x);
   body.append(btn('Renomear grupo',()=>openView('Renomear',b=>form(b,[{key:'subject',label:'Novo nome',value:x.subject,required:true}],'Salvar',v=>runMutation('groups_rename',{id:x.id,subject:v.subject})))));
   body.append(btn(x.archived_at?'Restaurar grupo':'Arquivar grupo',
    ()=>confirmAction((x.archived_at?'Restaurar':'Arquivar')+' '+x.subject+'?',
    ()=>adminFinal(x.archived_at?'group_restore':'group_archive',{id:x.id},'v48_admin_groups_calls')),
    x.archived_at?'main':'dg'));
  }));
 }else if(kind==='sticker-manager'){
  const items=await adminExtra('stickers_list',{offset});
  list(items,x=>x.title||x.slug,x=>x.is_active?'Publicada':'Oculta',x=>openView('Figurinha',body=>{
   recordInline(body,x);
   body.append(btn(x.is_active?'Ocultar':'Publicar',()=>confirmAction('Alterar visibilidade desta figurinha?',()=>runMutation('stickers_set',{id:x.id,enabled:!x.is_active}))));
  }));
  root.prepend(btn('Importar pacote ZIP',()=>window.location.assign('admin-importar-figurinhas.html?origem=admin'),'main'));
 }else if(kind==='game-sessions'){
  const games=await adminExtra('games_list',{offset});
  list(games,x=>x.game_type==='gartic'?'Gartic':'Jogo da Velha',x=>x.status+' · '+new Date(x.created_at).toLocaleString('pt-BR'),x=>openView('Partida',body=>{
   recordInline(body,x);
   if(['waiting','active','invited'].includes(x.status))body.append(btn('Encerrar partida',()=>confirmAction('Encerrar partida ativa?',()=>runMutation('games_finish',{id:x.id,gameType:x.game_type})),'dg'));
  }));
 }else if(kind==='call-records'){
  const calls=await adminFinal('calls_list',{},'v48_admin_groups_calls');
  list(calls,x=>'Chamada: '+(x.signal_type||x.kind),
   x=>new Date(x.created_at).toLocaleString('pt-BR'),x=>openView('Evento de chamada',body=>{
    recordInline(body,x);
    if(['offer','answer'].includes(x.signal_type)&&x.call_id){
     body.append(btn('Encerrar sinalização',()=>confirmAction('Encerrar esta chamada?',
      ()=>adminFinal('call_terminate',{conversationId:x.conversation_id},'v48_admin_groups_calls')),'dg'));
    }
   }));
 }else if(kind==='role-permissions'){
  const users=await adminExtra('roles_list',{offset});
  list(users,x=>'@'+x.username,x=>'Papel Neon: '+(x.role||'user')+(x.banned?' · suspenso':''),x=>openView('Permissões',body=>recordInline(body,x)));
 }else if(kind==='server-backup'){
  root.replaceChildren();
  root.append(elem('h3','sec','Exportação segura'));
  const state=elem('div','cnt','CSV ou JSON gerado no Neon · lotes de 200 registros');
  root.append(state);
  for(const resource of ['profiles','audit','reports']){
   const row=elem('div','bg2');
   row.append(elem('strong','',resource));
   for(const format of ['csv','json'])row.append(btn(format.toUpperCase(),async()=>{
    state.textContent='Gerando arquivo no Neon…';
    try{
     const exportData=await adminExport(resource,format,offset);
     const mime=format==='csv'?'text/csv;charset=utf-8':'application/json;charset=utf-8';
     const dataBlob=new Blob([exportData.content],{type:mime});
     const href=URL.createObjectURL(dataBlob);
     const anchor=document.createElement('a');anchor.href=href;
     anchor.download='looply-'+resource+'-'+offset+'.'+format;
     document.body.append(anchor);anchor.click();anchor.remove();
     setTimeout(()=>URL.revokeObjectURL(href),30000);
     state.textContent=exportData.count+' registros exportados · próximo índice '+exportData.next_offset;
     if(exportData.count===200)root.append(btn('Próximo lote',()=>renderAdminExtended(kind,root,ui,exportData.next_offset)));
    }catch(error){state.textContent=error.message}
   }));
   root.append(row);
  }
 }else if(kind==='server-heatmap'){
  const data=await adminExtra('heatmap');
  if(!Array.isArray(data))throw Error('Agregação inválida');
  const totals=new Map(data.map(x=>[Number(x.weekday),Number(x.total)]));
  root.replaceChildren();
  ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach((day,i)=>line(root,day,totals.get(i)||0));
  root.append(btn('Atualizar',retry));
 }else if(kind==='server-reports'){
  const data=await adminExtra('stats');
  if(!data||typeof data!=='object'||!('checked_at' in data))throw Error('Estatísticas indisponíveis');
  root.replaceChildren();
  for(const [key,title] of [['users','Usuários'],['posts','Publicações'],['letters','Cartas'],['messages','Mensagens'],['reports','Denúncias'],['stickers','Figurinhas'],['sessions','Sessões ativas']]){
   line(root,title,data[key]??'—');
  }
  root.append(btn('Atualizar',retry));
 }else throw Error('Módulo não implementado');
 }catch(error){showError(error)}
}

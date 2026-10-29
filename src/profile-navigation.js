const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function bindProfileNavigation({root,header,user}) {
  function navigate(event) {
    const target=event.target.closest?.('[data-profile-open], [data-profile-link], [data-profile-avatar-id]');
    const id=target?.dataset.profileOpen||target?.dataset.profileLink||target?.dataset.profileAvatarId;
    if(!uuid.test(id||'')||target.closest('[data-pr-edit]'))return;
    event.preventDefault();event.stopPropagation();
    window.location.assign(new URL('perfil.html?usuario='+encodeURIComponent(id),window.location.href).href);
  }
  root.addEventListener('click',navigate,{capture:true});
  function ownAvatar(event){
    if(!event.target.closest?.('.looply-user-avatar, .looply-user-initial'))return;
    event.preventDefault();event.stopPropagation();window.location.assign('perfil.html');
  }
  header.addEventListener('click',ownAvatar,{capture:true});
  function sync(event){
    const d=event.detail;if(!d?.profileId)return;
    document.querySelectorAll('[data-profile-name-id]').forEach(el=>{if(el.dataset.profileNameId===d.profileId)el.textContent=d.display_name;});
    if(d.profileId===user.id){const label=header.querySelector('.looply-account strong');if(label)label.textContent=d.display_name;}
  }
  window.addEventListener('looply:profile-updated',sync);
  const bus=typeof BroadcastChannel==='function'?new BroadcastChannel('looply-profile-social'):null;
  if(bus)bus.onmessage=event=>{if(event.data?.type==='profile'){sync({detail:event.data});window.dispatchEvent(new CustomEvent('looply:avatar-updated',{detail:event.data}));}};
  return ()=>{root.removeEventListener('click',navigate,{capture:true});header.removeEventListener('click',ownAvatar,{capture:true});window.removeEventListener('looply:profile-updated',sync);bus?.close();};
}

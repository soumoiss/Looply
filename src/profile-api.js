import { cachedSignedUrls } from './storage-url-cache.js';
import { prepareAvatarSource } from './avatar-image-processing.js';

export const PROFILE_TABS = Object.freeze(['fotos', 'videos', 'mencoes', 'publicacoes']);
export const isProfileId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
const RPCS = new Set(['v11_profile_overview', 'v11_profile_connections', 'v11_profile_content', 'v11_set_follow', 'v11_edit_profile_content']);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function profileError(error) {
  if (error?.status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
  if (error?.status === 403 || error?.code === '42501') return 'Esta ação não está autorizada para sua conta.';
  if (error?.code === '40001') return 'O perfil mudou em outra sessão. Feche a edição e tente novamente.';
  if (error?.message === 'avatar-file-invalid' || error?.message === 'avatar-dimensions-invalid') return 'Escolha uma foto JPEG, PNG ou WebP válida, com pelo menos 128 px e até 35 MB.';
  return 'Não foi possível concluir agora. Confira sua conexão e tente novamente.';
}
export async function profileRpc(client, name, args, fetchImpl = fetch) {
  if (!RPCS.has(name)) throw Error('Invalid profile operation');
  const {data, error} = await client.auth.getSession();
  if (error || !data?.session?.access_token) throw Object.assign(Error('Session required'), {status:401});
  const response = await fetchImpl(client.dataApiUrl.replace(/\/$/, '') + '/rpc/' + name, {
    method:'POST', cache:'no-store', headers:{authorization:'Bearer ' + data.session.access_token,
      'content-type':'application/json', accept:'application/json'}, body:JSON.stringify(args)
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(Error('Profile request failed'), {status:response.status, code:value?.code});
  return value;
}
export async function signPeople(client, people) {
  const list = people.map(p => ({...p, avatarUrl:p.avatarUrl || ''}));
  const withPaths = list.filter(p => p.avatar_path);
  if (withPaths.length) {
    const result = await cachedSignedUrls(client, 'looply-avatars', withPaths.map(p => p.avatar_path), 1800);
    if (!result.error) withPaths.forEach((p,i) => p.avatarUrl = result.data?.[i]?.signedUrl || '');
  }
  return list;
}
export async function signContentCovers(client, items) {
  const covers = items.map(item => item.media?.[0]).filter(Boolean);
  for (const bucket of ['looply-media','looply-gallery']) {
    const group = covers.filter(m => m.bucket === bucket);
    if (!group.length) continue;
    const result = await cachedSignedUrls(client,bucket,group.map(m => m.storage_path),1800);
    if (!result.error) group.forEach((m,i) => m.signedUrl = result.data?.[i]?.signedUrl || '');
  }
  return items;
}
export function optimisticFollow(stats, next) {
  return {...stats, isFollowing:next, followers:Math.max(0,Number(stats.followers || 0) + (next === stats.isFollowing ? 0 : next ? 1 : -1))};
}
// Selection stays local until the single "Salvar alterações" submission.
export async function prepareProfileAvatar(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file?.type)) throw Error('avatar-file-invalid');
  const {bitmap} = await prepareAvatarSource(file);
  try {
    const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=512;
    const context = canvas.getContext('2d',{alpha:false});
    if (!context) throw Error('avatar-decode-failed');
    const side=Math.min(bitmap.width,bitmap.height);
    context.fillStyle='#fff';context.fillRect(0,0,512,512);
    context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,512,512);
    const blob = await new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('avatar-decode-failed')),'image/jpeg',.92));
    return new File([blob],'perfil.jpg',{type:'image/jpeg'});
  } finally { bitmap.close(); }
}

import { cachedSignedUrls } from './storage-url-cache.js';
import { esc } from './profile-api.js';

// Verified by the pre-media-reset Neon branch (2026-10-25).
// This is provenance metadata, NOT a replacement photo or a fake upload.
export const HISTORICAL_LOST_MEDIA = Object.freeze({
  '5eb79af6-152d-4a08-971f-1a5796491c9b': 'Olhem que cachinho perfeito',
  '981fe68f-fa14-42ff-ba85-26a448ca8d34': '',
  '3f2a80bd-dcaf-4f24-b9eb-423b28dddc57': ''
});

export async function loadProfilePublications(client, profileId, offset = 0, count = 30) {
  const { data: posts, error } = await client.from('posts')
    .select('id,author_id,body,visibility,created_at,external_url')
    .eq('author_id', profileId).eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + count - 1);
  if (error) throw error;
  const items = posts || [];
  if (!items.length) return items;
  const ids = items.map(item => item.id);
  // Optional decorations must never hide an original publication.
  const [mediaResult, commentsResult] = await Promise.all([
    client.from('post_media').select('id,post_id,storage_path,kind,mime_type,alt_text').in('post_id', ids),
    client.from('comments').select('id,post_id,author_id,body,created_at').in('post_id', ids).order('created_at')
  ]);
  const media = mediaResult.error ? [] : mediaResult.data || [];
  const comments = commentsResult.error ? [] : commentsResult.data || [];
  const paths = media.filter(item => item.storage_path);
  if (paths.length) {
    try {
      const signed = await cachedSignedUrls(client, 'looply-media', paths.map(item => item.storage_path), 1800);
      if (!signed.error) paths.forEach((item, index) => {
        item.signedUrl = signed.data?.[index]?.signedUrl || '';
      });
    } catch {
      // Photos are secondary to authorship and historical captions.
    }
  }
  const idsOfCommenters = [...new Set(comments.map(item => item.author_id).filter(Boolean))];
  let people = [];
  if (idsOfCommenters.length) {
    const result = await client.from('profiles').select('id,username,display_name').in('id', idsOfCommenters);
    if (!result.error) people = result.data || [];
  }
  const names = new Map(people.map(person => [person.id, person.display_name || person.username]));
  return items.map(post => ({
    ...post,
    media: media.filter(item => item.post_id === post.id),
    comments: comments.filter(item => item.post_id === post.id).map(comment => ({
      ...comment, authorName: names.get(comment.author_id) || 'Membro'
    }))
  }));
}

const dateLabel = date => {
  const value = new Date(date);
  return Number.isNaN(value.valueOf()) ? '' :
    new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
};

export function profilePublicationsMarkup(items) {
  if (!items.length) return '<p class="pr-empty">Nenhuma publicação pública neste perfil.</p>';
  return '<div class="pr-publications">' + items.map(post => {
    const cover = post.media?.[0];
    const oldPicture = Object.prototype.hasOwnProperty.call(HISTORICAL_LOST_MEDIA, post.id);
    const alt = HISTORICAL_LOST_MEDIA[post.id];
    let media = '';
    if (cover?.signedUrl) {
      media = cover.kind === 'video'
        ? '<video controls playsinline preload="metadata" src="' + esc(cover.signedUrl) + '"></video>'
        : '<img loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="' + esc(cover.alt_text || 'Imagem publicada') + '" src="' + esc(cover.signedUrl) + '">';
    } else if (oldPicture) {
      media = '<p class="pr-publication-lost">A fotografia original desta publicação não foi preservada na migração.' +
        (alt ? '<span>Descrição original da imagem: “' + esc(alt) + '”</span>' : '') + '</p>';
    } else if (cover) {
      media = '<p class="pr-publication-lost">A mídia desta publicação está indisponível.</p>';
    }
    const comments = post.comments?.length
      ? '<div class="pr-publication-comments"><strong>Comentários originais</strong>' +
        post.comments.map(c => '<p><span>' + esc(c.authorName) + '</span> ' + esc(c.body) + '</p>').join('') + '</div>'
      : '';
    const link = /^https:\/\//.test(post.external_url || '')
      ? '<a href="' + esc(post.external_url) + '" target="_blank" rel="noopener noreferrer">Abrir publicação compartilhada</a>' : '';
    return '<article class="pr-publication" data-original-post="' + esc(post.id) + '">' +
      '<time datetime="' + esc(post.created_at) + '">' + esc(dateLabel(post.created_at)) + '</time>' +
      (post.body ? '<p class="pr-publication-caption">' + esc(post.body) + '</p>' : '') +
      media + link + comments + '</article>';
  }).join('') + '</div>';
}

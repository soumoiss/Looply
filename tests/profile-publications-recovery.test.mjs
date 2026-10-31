import test from 'node:test';
import assert from 'node:assert/strict';
import { HISTORICAL_LOST_MEDIA, profilePublicationsMarkup } from '../src/profile-publications.js';

test('historic source IDs and alt text correspond to the pre-reset Neon snapshot', () => {
  assert.deepEqual(Object.keys(HISTORICAL_LOST_MEDIA).sort(), [
    '3f2a80bd-dcaf-4f24-b9eb-423b28dddc57',
    '5eb79af6-152d-4a08-971f-1a5796491c9b',
    '981fe68f-fa14-42ff-ba85-26a448ca8d34'
  ]);
  assert.equal(HISTORICAL_LOST_MEDIA['5eb79af6-152d-4a08-971f-1a5796491c9b'], 'Olhem que cachinho perfeito');
});

test('a real original comment remains readable without inventing a deleted photo', () => {
  const html = profilePublicationsMarkup([{
    id:'3f2a80bd-dcaf-4f24-b9eb-423b28dddc57',
    body:'✌️',created_at:'2026-10-19T00:07:12.771Z',media:[],
    comments:[{authorName:'Moisés',body:'Ôh bixim bonito'}]
  }]);
  assert.match(html,/Ôh bixim bonito/);
  assert.match(html,/fotografia original desta publicação não foi preservada/);
  assert.doesNotMatch(html,/<img |blob:|data:image/);
});
test('old alt text is distinguished from the historical body text', () => {
  const html = profilePublicationsMarkup([{
    id:'5eb79af6-152d-4a08-971f-1a5796491c9b',
    body:'Capturando...',created_at:'2026-10-16T08:21:13.308Z',media:[],comments:[]
  }]);
  assert.match(html,/Capturando\.\.\./);
  assert.match(html,/Descrição original da imagem/);
  assert.match(html,/Olhem que cachinho perfeito/);
});
test('publications markup escapes user content and never fabricates media', () => {
  const html = profilePublicationsMarkup([{
    id:'abc',body:'<img src=x onerror=alert(1)>',created_at:'2026-10-20T00:00:00Z',
    media:[],comments:[{authorName:'<script>',body:'<b>hey</b>'}]
  }]);
  assert.doesNotMatch(html,/<script>|<img src=x|<b>hey<\/b>/);
  assert.match(html,/&lt;script&gt;/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync('assets/css/pages/chat-reference-complete.css','utf8');
const icons=readFileSync('src/chat-model-icons.js','utf8');
test('official model SVG icons remain within 20px',()=>{
 assert.match(icons,/class="i /);
 assert.match(css,/\.page-chat\.chat-model-live svg\.i\s*\{/);
 assert.match(css,/width:20px!important;/);
 assert.match(css,/height:20px!important;/);
 assert.match(css,/max-width:20px!important;/);
 assert.match(css,/max-height:20px!important;/);
});
test('contact profile photo is square 92px not inherited full width',()=>{
 assert.match(css,/\.dr\[data-ref-drawer\] \.ref-avatar-wrap>\.av\.lg/);
 assert.match(css,/width:92px!important;height:92px!important;/);
 assert.match(css,/object-fit:cover!important;/);
 assert.match(css,/max-width:92px!important;max-height:92px!important;/);
});
test('model details compact action row and switches',()=>{
 assert.match(css,/\.dr\[data-ref-drawer\] \.qa svg\.i/);
 assert.match(css,/\.dr\[data-ref-drawer\] \.opt svg\.i/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
 assert.match(css,/\.dr\[data-ref-drawer\] \.sw\s*\{/);
 assert.match(css,/width:46px!important;height:27px!important/);
});
test('both chat routes request fixed geometry stylesheet',()=>{
 for(const page of ['chat.html','conversa.html'])
 assert.match(readFileSync(page,'utf8'),/chat-reference-complete\.css\?v=official-model-20261104-r2/);
});

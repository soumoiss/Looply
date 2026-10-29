// Run with Playwright and ffmpeg installed. Optional LOOPLY_CHROMIUM_PATH selects a local browser.
const {chromium}=require(process.env.LOOPLY_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs/promises');const assert=require('assert/strict');const root=require('node:path').resolve(__dirname,'..');
const temp=require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'looply-profile-ui-'));
const videoPath=require('node:path').join(temp,'video.mp4');
const videoResult=require('node:child_process').spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=0xaa88cc:s=320x480:d=1','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-y',videoPath]);
if(videoResult.status!==0)throw Error('ffmpeg is required for the real video smoke test');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const image='https://profile.test/image.svg';
const persons=[{id:A,username:'peixinho',display_name:'Peixinho',bio:'Meu perfil',avatar_path:null},{id:B,username:'missol',display_name:'Missol',bio:'Minha biografia',avatar_path:null},{id:C,username:'yara',display_name:'Yara',bio:'Minha bio',avatar_path:null}];
const runtime=(admin)=>`export async function mountAppPage({render}){
const people=${JSON.stringify(persons)},actor=people[0];
const client={dataApiUrl:'https://profile.test/api',auth:{getSession:async()=>({data:{session:{access_token:'a.b.c'}}})},
 storage:{from(bucket){return {upload:async(path,file)=>{window.testUploads=(window.testUploads||0)+1;return {data:{path},error:null}},createSignedUrls:async paths=>({data:paths.map(path=>({signedUrl:path.endsWith('.mp4')?'https://profile.test/video.mp4':'${image}'})),error:null}),createSignedUrl:async(path)=>({data:{signedUrl:path.endsWith('.mp4')?'https://profile.test/video.mp4':'${image}'},error:null}),remove:async()=>({data:[],error:null})}}},
 functions:{invoke:async()=>({data:{conversationId:'test-conversation'},error:null})},rpc:async()=>({data:'comment-id',error:null}),
 from(table){const state={table,mode:'select',filters:[]};const q=new Proxy({}, {get(_,key){if(key==='then')return (ok,fail)=>fetch('/test/query',{method:'POST',body:JSON.stringify(state)}).then(r=>r.json()).then(ok,fail);return (...args)=>{if(['insert','upsert','delete','update'].includes(key)){state.mode=key;state.payload=args[0]}if(['eq','in'].includes(key))state.filters.push([key,...args]);if(['single','maybeSingle'].includes(key))state.single=true;return q;}}});return q;}};
await render({root:document.querySelector('#pageContent'),client,user:{id:actor.id},profile:actor,isAdmin:${admin}});window.testReady=true;
}`;
(async()=>{const browser=await chromium.launch({executablePath:process.env.LOOPLY_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
try{for(const mine of [true,false])for(const width of [320,360,390,428]){
const state={people:structuredClone(persons),following:false,failFollow:false,comments:[],likes:[]};let saveCalls=0;
const p=await browser.newPage({viewport:{width,height:860}}),errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message)});
p.on('requestfailed',r=>console.log('FAILED REQUEST',r.url(),r.failure()));p.on('console',msg=>{if(msg.type()==='error'&&!msg.text().includes('status of 403'))errors.push('console: '+msg.text()+' '+JSON.stringify(msg.location()))});
await p.route('https://profile.test/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname;
const json=value=>route.fulfill({json:value});
if(path==='/video.mp4')return route.fulfill({contentType:'video/mp4',body:await fs.readFile(videoPath)});
if(path==='/image.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#bc8bcf"/></svg>'});
if(path==='/src/page-runtime.js')return route.fulfill({contentType:'text/javascript',body:runtime(mine&&width===428)});
if(path==='/api/profiles')return json([state.people[0]]);
if(path==='/api/rpc/v3_save_self_profile'){saveCalls++;const b=req.postDataJSON();Object.assign(state.people[0],{display_name:b.p_display_name,bio:b.p_bio,profile_visibility:b.p_profile_visibility,playlist_url:b.p_playlist_url,avatar_path:b.p_replace_avatar?b.p_next_avatar:state.people[0].avatar_path});return json([state.people[0]]);}
if(path.startsWith('/api/rpc/')){const name=path.split('/').pop(),b=req.postDataJSON();
 if(name==='v11_profile_overview')return json({profile:state.people.find(x=>x.id===b.p_profile_id),posts:2,followers:state.following?3:2,following:1,isFollowing:state.following});
 if(name==='v11_set_follow'){if(state.failFollow){state.failFollow=false;return route.fulfill({status:403,json:{code:'42501'}})}state.following=b.p_follow;return json({targetId:b.p_target_id,isFollowing:b.p_follow,followers:b.p_follow?3:2,following:1,actorFollowing:b.p_follow?2:1})}
 if(name==='v11_profile_connections')return json(state.people.filter(x=>!b.p_query||(x.username+' '+x.display_name).toLowerCase().includes(b.p_query.toLowerCase())).map(x=>({...x,isFollowing:state.following&&x.id===B})));
 if(name==='v11_profile_content'){if(b.p_offset)return json([]);const id=b.p_tab==='mencoes'?C:(mine?A:B);return json([{id:'44444444-4444-4444-8444-444444444444',source:'post',owner_id:id,caption:'Uma lembrança',created_at:'2026-10-29',media:[{id:'media',kind:b.p_tab==='videos'?'video':'image',storage_path:b.p_tab==='videos'?'videos/test.mp4':'photos/test.jpg',bucket:'looply-media',signedUrl:image}]}]);}
 if(name==='v11_edit_profile_content')return json(true);
 throw Error('Unexpected RPC '+name);
}
if(path==='/test/query'){const s=req.postDataJSON();let data=[];
if(s.table==='profiles')data=state.people;if(s.table==='comments'){if(s.mode==='insert'){state.comments.push({id:'comment',...s.payload});data={id:'comment'}}else data=state.comments;}
if(s.table==='post_likes'){if(s.mode==='upsert')state.likes=[s.payload];if(s.mode==='delete')state.likes=[];data=state.likes;}
return json({data,error:null});}
if(path==='/conversa.html')return route.fulfill({contentType:'text/html',body:'Conversa privada'});
const file=path==='/'?'perfil.html':path.slice(1);const body=await fs.readFile(root+'/'+file);return route.fulfill({body,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
});
await p.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await p.goto('https://profile.test/perfil.html'+(mine?'':'?usuario='+B));await p.waitForFunction(()=>window.testReady).catch(async e=>{console.log('DEBUG',errors,await p.locator('body').innerText());throw e;});await p.locator('.pr-media-open').first().waitFor();
assert.equal(await p.locator('[role=tab]').count(),3);assert.equal(await p.locator('[data-pr-open-edit]').count(),mine?1:0);
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow at '+width);
await p.locator('[data-pr-list=followers]').click();await p.locator('.pr-person').first().waitFor();await p.locator('[data-pr-user-search]').fill('Yara');await p.waitForTimeout(250);assert.equal(await p.locator('.pr-person').count(),1);await p.locator('[data-pr-connections] [data-pr-close]').click();
if(mine){await p.locator('[data-pr-list=following]').click();await p.locator('[data-pr-connections] [data-pr-follow=\"'+B+'\"]').click();await p.waitForFunction(()=>document.querySelector('[data-pr-status]').textContent.includes('está seguindo'));await p.locator('[data-pr-connections] [data-pr-follow=\"'+B+'\"]').click();await p.waitForFunction(id=>!document.querySelector('[data-pr-connections] [data-pr-follow=\"'+id+'\"]'),B);await p.locator('[data-pr-connections] [data-pr-close]').click();await p.locator('[data-pr-open-edit]').click();assert.equal(await p.locator('[name=playlistUrl]').count(),width===428?1:0);
await p.locator('[name=displayName]').fill('Novo nome');await p.locator('[name=bio]').fill('Nova biografia');
await p.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=200;canvas.height=200;canvas.getContext('2d').fillRect(0,0,200,200);return new Promise(resolve=>canvas.toBlob(blob=>{const dt=new DataTransfer();dt.items.add(new File([blob],'test.png',{type:'image/png'}));const input=document.querySelector('[name=avatar]');input.files=dt.files;input.dispatchEvent(new Event('change'));resolve();},'image/png'))});
await p.waitForFunction(()=>document.querySelector('[data-pr-save-status]').textContent.includes('Foto selecionada'));
assert.equal(saveCalls,0);assert.equal(await p.evaluate(()=>window.testUploads||0),0,'selection must not upload');
await p.locator('[data-pr-edit-form] [type=submit]').click();await p.waitForFunction(()=>document.querySelector('.pr-bio h1').textContent==='Novo nome');assert.equal(saveCalls,1);assert.equal(await p.evaluate(()=>window.testUploads),1);assert.equal(await p.locator('[data-pr-edit]').evaluate(x=>x.open),false);
}else{
state.failFollow=true;await p.locator('[data-pr-card] [data-pr-follow]').click();await p.waitForFunction(()=>document.querySelector('[data-pr-status]').textContent.includes('autorizada'));assert.equal(await p.locator('[data-pr-card] [data-pr-follow]').textContent(),'Seguir');
await p.locator('[data-pr-card] [data-pr-follow]').click();await p.waitForFunction(()=>document.querySelector('[data-pr-status]').textContent.includes('está seguindo'));assert.equal(await p.locator('[data-pr-card] [data-pr-follow]').textContent(),'Seguindo');}
await p.locator('[data-pr-media]').first().click();await p.locator('[data-mv-stage] img').waitFor();await p.locator('[data-mv-like]').click();await p.waitForFunction(()=>document.querySelector('[data-mv-like]').getAttribute('aria-pressed')==='true');
await p.locator('#prCommentBody').fill('Comentário de teste');await p.locator('[data-mv-comment-form] [type=submit]').click();await p.locator('.pr-comment').waitFor();await p.locator('[data-mv-close]').click();
for(const tab of ['videos','mencoes','fotos']){await p.locator('[data-pr-tab='+tab+']').click();await p.locator('#grid-'+tab+' .pr-media-open').first().waitFor();if(tab==='videos'){await p.locator('#grid-videos .pr-media-open').first().click();await p.waitForFunction(()=>document.querySelector('[data-mv-stage] video')?.readyState>=2);await p.locator('[data-mv-close]').click();}}
if(mine&&width===390){await p.locator('[data-pr-media]').first().click();await p.locator('[data-mv-action=caption]').click();await p.locator('[data-mv-edit-form] [name=caption]').fill('Legenda editada');await p.locator('[data-mv-edit-form] [type=submit]').click();await p.waitForFunction(()=>document.querySelector('[data-pr-status]').textContent==='Legenda atualizada.');await p.locator('[data-mv-close]').click();}
assert.deepEqual(errors,[]);if(width===390)await p.screenshot({path:require('node:path').join(temp,'profile-'+(mine?'self':'other')+'.png'),fullPage:true});console.log('PASS',mine?'SELF':'OTHER',width,'startup, counts, lists/search, permissions, save/follow, viewer/like/comment, tabs');await p.close();
}}finally{await browser.close();await fs.rm(temp,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exit(1)});

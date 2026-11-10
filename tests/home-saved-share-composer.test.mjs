import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("salvos consultam o Neon por IDs completos, não só o feed carregado",async()=>{
 const src=await read("src/social.js"),saved=await read("src/home-reels-saved.js");
 assert.match(src,/export async function loadSavedSocialPage/);
 assert.match(src,/\.from\("post_saves"\)/);
 assert.match(src,/\.range\(start,start\+limit\)/);
 assert.match(src,/loadPosts\(client,"all",ids\)/);
 assert.match(src,/\.in\("id",ids\)/);
 assert.match(saved,/loadSavedSocialPage\(client,userId,offset,24\)/);
 assert.match(saved,/data-saved-remove/);
 assert.match(saved,/v13_set_post_saved/);
 assert.match(saved,/post\.media\?\.find/);
 assert.match(saved,/looply:saved-change/);
});
test("share externo não copia link e usa seletor nativo Chrome ou APK",async()=>{
 const src=await read("src/social.js"),android=await read("android/app/src/main/java/com/soumoiss/looply/MainActivity.kt");
 const from=src.indexOf('const shareButton = event.target.closest("[data-share-post]")');
 const to=src.indexOf("const deleteButton",from);
 assert.ok(from>0&&to>from);
 const handler=src.slice(from,to);
 assert.match(handler,/LooplyExternalShare\.postMessage/);
 assert.match(handler,/navigator\.share\(/);
 assert.doesNotMatch(handler,/clipboard|window\.prompt/);
 assert.match(android,/WebViewCompat\.addWebMessageListener/);
 assert.match(android,/isMainFrame/);
 assert.match(android,/Intent\.ACTION_SEND/);
 assert.match(android,/Intent\.createChooser/);
 assert.match(android,/origin\.host != "soumoiss\.github\.io"/);
 assert.match(android,/uri\.path == "\/Looply\/home\.html"/);
});
test("compositor premium usa formulário original e seleção múltipla por avatares",async()=>{
 const src=await read("src/home-reels-composer.js");
 const shell=await read("src/home-reels-premium.js");
 const css=await read("assets/css/pages/home-reels.css");
 assert.match(shell,/enhancePublicationComposer\(\{form:composer,client,userId:ownId,profile,external:!isHome\}\)/);
 assert.match(src,/const select=fields\.querySelector\("#postRecipients"\)/);
 assert.match(src,/option\.selected=forceOff\?false:!option\.selected/);
 assert.match(src,/const signed=await signPeople\(client,data\)/);
 assert.match(src,/looply-compose-people-grid/);
 assert.match(css,/\.looply-compose-person-avatar/);
 assert.match(css,/\.looply-saved-grid/);
 assert.match(shell,/data-open-saved/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  normalizeShareAudience,shareProvider,shareSearchMatches,MAX_SELECTED_SHARE_PEOPLE
} from "../src/share-audience.js";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
const peixinho="d17bbcab-8723-498b-b925-3d9be59fc19d";
const other="6b60554d-b45b-48e3-b35d-06b851cd591a";
const third="2c309ab7-07d7-414c-8905-6f4b0c08c4cc";

test("an external share defaults to all Looply members with no stale recipient ids",()=>{
 assert.deepEqual(normalizeShareAudience("public",[other],peixinho),
   {visibility:"public",recipientIds:[]});
 assert.deepEqual(normalizeShareAudience("selected",[other,third],peixinho),
   {visibility:"selected",recipientIds:[other,third]});
 assert.deepEqual(normalizeShareAudience("selected",[other],peixinho),
   {visibility:"selected",recipientIds:[other]});
});

test("selected audience rejects empty, malformed, repeated, self or over-20 recipients",()=>{
 for(const recipients of [[],[other,other],[peixinho],["bad-id"],Array(21).fill(other)]){
   assert.throws(()=>normalizeShareAudience("selected",recipients,peixinho),/Escolha de 1 a 20 pessoas/);
 }
 assert.equal(MAX_SELECTED_SHARE_PEOPLE,20);
});

test("people search handles accents, handles and partial matches",()=>{
 const person={username:"eukeiliane",display_name:"Keiliane São"};
 assert.equal(shareSearchMatches(person,"sao"),true);
 assert.equal(shareSearchMatches(person,"EUK"),true);
 assert.equal(shareSearchMatches(person,"xyz"),false);
 assert.equal(shareProvider("https://youtube.com/watch?v=abc"),"YouTube");
 assert.equal(shareProvider("https://www.instagram.com/reel/abc/"),"Instagram");
 assert.equal(shareProvider("https://vm.tiktok.com/abc"),"TikTok");
});

test("sharesheet keeps media and URL receipt in the original Android host",async()=>{
 const [share,native]=await Promise.all([read("share.html"),
   read("android/app/src/main/java/com/soumoiss/looply/ShareReceiverActivity.kt")]);
 for(const required of [
   'name="shareAudience" value="public" checked',
   'name="shareAudience" value="selected"',
   'id="choosePeople"','id="peoplePicker"','id="sharePeopleList"',
   'id="chosenPeople"','id="sharePersonSearch"',
   'id="confirmPeople"','id="peopleCount"','id="status"',
   'id="imagePreview"','id="videoPreview"','id="linkSection"'
 ])assert.ok(share.includes(required),required);
 assert.match(share,/addEventListener\("submit",async event/);
 assert.match(share,/if\(submitting\|\|\(!link&&!isMedia\)\)return/);
 assert.match(share,/v5_create_post/);
 assert.match(share,/p_visibility:"private"/);
 assert.match(share,/v5_attach_post_media/);
 assert.match(share,/v24_publish_shared_post/);
 assert.match(share,/mediaCheck\.data\?\.some/);
 assert.match(share,/window\.LooplyShare\?\.complete/);
 assert.match(native,/getParcelableExtra<Uri>\(Intent\.EXTRA_STREAM\)/);
 assert.match(native,/addPathHandler\("\/Looply\/"/);
 assert.match(native,/path != "media"/);
});

test("publication staging precedes verified upload and atomic final audience",async()=>{
 const share=await read("share.html");
 const a=share.indexOf('postId=await call("v5_create_post"');
 const b=share.indexOf('upload(storagePath,media');
 const c=share.indexOf('const mediaCheck=await looplyClient.from("post_media")');
 const d=share.indexOf('const confirmed=await call("v24_publish_shared_post"');
 const e=share.indexOf('postCheck.data?.visibility!==selected.visibility');
 assert.ok(a>0&&b>a&&c>b&&d>c&&e>d);
 assert.match(share,/if\(postId&&!published\)/);
 assert.match(share,/selected\.recipientIds/);
 assert.match(share,/const selected=await audience\.audience\(\)/);
 const backend=await read("migration/20261031_v24_external_shared_post_audience.sql");
 assert.match(backend,/public\.looply_legacy_uid\(\)/);
 assert.match(backend,/visibility = 'private'/);
 assert.match(backend,/FOR UPDATE/);
 assert.match(backend,/INSERT INTO public\.post_recipients/);
 assert.ok(backend.indexOf("INSERT INTO public.post_recipients")<
   backend.indexOf("UPDATE public.posts SET visibility="));
 assert.match(backend,/v_count NOT BETWEEN 1 AND 20/);
 assert.match(backend,/v_count <> \(SELECT count\(DISTINCT id\)/);
 assert.match(backend,/v_count <> \(SELECT count\(\*\) FROM public\.profiles/);
 assert.match(backend,/REVOKE ALL ON FUNCTION public\.v24_publish_shared_post/);
 assert.match(backend,/GRANT EXECUTE ON FUNCTION public\.v24_publish_shared_post.*TO authenticated/);
});

test("search, avatar, selected chips and removal are fully integrated without unsafe HTML interpolation",async()=>{
 const picker=await read("src/share-audience.js");
 assert.match(picker,/from\("profiles"\)/);
 assert.match(picker,/client\.auth\.getUser\(\)/);
 assert.match(picker,/p\.id!==ownerId/);
 assert.match(picker,/createSignedUrl\(p\.avatar_path,300\)/);
 assert.match(picker,/shareSearchMatches/);
 assert.match(picker,/selection\.delete\(person\.id\)/);
 assert.match(picker,/document\.createElement\(tag\)/);
 assert.match(picker,/node\.textContent=text/);
 assert.match(picker,/return normalizeShareAudience\("selected",authorized,ownerId\)/);
 assert.doesNotMatch(picker,/innerHTML\s*=/);
});

test("native share layout fits small mobile windows and modal remains scrollable",async()=>{
 const css=await read("assets/css/pages/share-external.css");
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/max-height:calc\(96dvh/);
 assert.match(css,/overflow-y:auto/);
 assert.match(css,/\.share-picker::backdrop/);
 assert.match(css,/max-height:50dvh/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(css,/@import.*https?:/);
});

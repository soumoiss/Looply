import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {primaryDestinations} from "../src/primary-navigation.js";
import {isExternalPost,postsForSurface,socialMarkup} from "../src/social.js";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
function post(id,external_url=null,comments=[]){
  return {id,author_id:"person-1",author:{id:"person-1",username:"testuser",display_name:"Test user"},
    body:"Publicação de exemplo",visibility:"public",external_url,created_at:"2026-11-02T11:15:00Z",
    media:[],comments,likeCount:1,likedByMe:false};
}
test("Reels remains a main destination after Avisos moves to the header",()=>{
  assert.equal(primaryDestinations.length,6);
  assert.ok(primaryDestinations.some(([key,label,href,icon])=>
    key==="reels"&&label==="Reels"&&href==="reels.html"&&icon==="video"));
  assert.match(read("reels.html"),/assets\/js\/reels\.js/);
  assert.match(read("scripts/build.mjs"),/"reels\.html"/);
  assert.match(read("assets\/js\/reels.js"),/loadSocialData\(client,"external"\)/);
});
test("External provider links and native uploads are partitioned without deleting any record",()=>{
  const rows=[
    post("native-1"),post("external-ig","https://www.instagram.com/reel/abcdefgh/"),
    post("native-2",null),post("external-yt","https://www.youtube.com/shorts/abcdefghijk")];
  assert.equal(postsForSurface(rows,"native").length,2);
  assert.equal(postsForSurface(rows,"external").length,2);
  assert.ok(isExternalPost(rows[1]));
  assert.ok(!isExternalPost(rows[0]));
  assert.equal(postsForSurface(rows,"all").length,rows.length);
  const home=read("assets/js/home.js");
  assert.match(home,/loadSocialData\(client,"native"\)/);
  assert.match(home,/root\.dataset\.socialStream="native"/);
  assert.match(home,/reels\.html\?share_url=/);
  const social=read("src/social.js");
  assert.match(social,/for\(let offset=0;offset<1000/);
  assert.match(social,/postsForSurface\(batch,surface\)/);
});
test("Both feeds display author portrait, date and persistent comment hearts and replies",()=>{
  const comment={id:"comment-id",post_id:"post-native",author_id:"other",body:"Esse momento ficou lindo",
    parent_comment_id:null,created_at:"2026-11-02T14:55:00Z",
    author:{id:"other",display_name:"Pessoa",username:"pessoa",avatarUrl:"https://example.test/avatar.jpg"},
    likeCount:2,likedByMe:true,likesAvailable:true};
  const html=socialMarkup({people:[],posts:[post("post-native",null,[comment])],postsError:null},"person-1",false,"native");
  assert.match(html,/class="comment-avatar"/);
  assert.match(html,/https:\/\/example\.test\/avatar\.jpg/);
  assert.match(html,/data-toggle-comment-like="comment-id"/);
  assert.match(html,/aria-pressed="true"/);
  assert.match(html,/2<\/span> <span>curtidas/);
  assert.match(html,/data-parent-comment-id="comment-id"/);
  assert.match(html,/11/);
  const code=read("src/social.js");
  assert.match(code,/client\.from\("comment_likes"\)\.upsert/);
  assert.match(code,/client\.from\("comment_likes"\)\.delete/);
  assert.match(read("src/neon-rest-bridge.js"),/comment_likes: \["comment_id","user_id"\]/);
});
test("Notification inbox, online banners and FCM route authorized text with proper visibility",()=>{
  const notice=read("assets/js/notifications.js");
  assert.match(notice,/externalPost\?"reels":"home"/);
  assert.match(notice,/escapeHtml\(item\.preview\)/);
  const live=read("src/live-notification-toast.js");
  assert.match(live,/recipient_id",userId/);
  assert.match(live,/user_id",userId/);
  assert.match(live,/safePreview\(item\.preview\)/);
  assert.match(read("src/page-runtime.js"),/mountLiveNotificationToasts\(supabase,user\.id\)/);
  const sql=read("migration/20261103_comment_engagement_and_text_previews.sql");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS public\.comment_likes/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/v35_notify_post_comment/);
  assert.match(sql,/v19_queue_chat_notifications/);
  assert.match(sql,/LEFT\(regexp_replace\(btrim\(COALESCE\(NEW\.body/);
  assert.match(sql,/v35_fcm_safe_comment_preview/);
  assert.match(sql,/t\.id=p_token_id/);
  assert.match(sql,/GRANT EXECUTE.*v35_fcm_safe_comment_preview/s);
  const worker=read("backend/cloudflare/android-push-worker.mjs");
  assert.match(worker,/events\.source='feed-comment'/);
  assert.match(worker,/v35_fcm_safe_comment_preview/);
});
test("All new and changed web modules parse",()=>{
  for(const path of ["src/social.js","src/live-notification-toast.js","src/page-runtime.js",
      "assets/js/reels.js","assets/js/notifications.js","assets/js/home.js",
      "src/home-comments-sheet.js","backend/cloudflare/android-push-worker.mjs"]){
    const result=spawnSync(process.execPath,["--check",fileURLToPath(new URL("../"+path,import.meta.url))],{encoding:"utf8"});
    assert.equal(result.status,0,path+"\n"+result.stderr);
  }
});

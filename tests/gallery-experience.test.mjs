import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
const read = (p) => readFile(resolve(process.cwd(),p),"utf8");
test("gallery uses real cloud media, not mock sample items",async()=>{
 const [ui,controller,community]=await Promise.all([read("galeria.html"),read("src/gallery-experience.js"),read("src/community-gallery.js")]);
 assert.match(ui,/data-gallery-category="private"/); assert.match(ui,/data-gallery-view="masonry"/);
 assert.match(controller,/gallery_media_people/); assert.match(controller,/create_community_gallery_comment/);
 assert.ok(community.includes("client.storage.from(bucketName).upload")); assert.match(community,/community_gallery_media/);
 assert.doesNotMatch(controller,/mediaItems\s*=\s*\[/);
});
test("gallery privacy migration stores a hash and scopes notifications",async()=>{
 const sql=await read("supabase/migrations/20261018120000_gallery_social_experience.sql");
 assert.match(sql,/extensions\.crypt/); assert.match(sql,/verify_gallery_private_passcode/);
 assert.match(sql,/community_gallery_comment_recipients/); assert.match(sql,/gallery_tag/);
 assert.match(sql,/Tagged person must be able to view this media/); assert.match(sql,/Comment recipient must be able to view this media/);
});

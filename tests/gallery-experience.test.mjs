import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
const read = (p) => readFile(resolve(process.cwd(),p),"utf8");
test("gallery uses real cloud media, not mock sample items",async()=>{
 const [ui,controller,community,archive]=await Promise.all([read("galeria.html"),read("src/gallery-experience.js"),read("src/community-gallery.js"),read("src/gallery-archive.js")]);
 assert.match(ui,/data-gallery-category="private"/); assert.match(ui,/data-gallery-view="masonry"/);
 assert.match(controller,/gallery_media_people/); assert.match(controller,/create_community_gallery_comment/);
 assert.ok(community.includes("client.storage.from(bucketName).upload")); assert.match(community,/community_gallery_media/);
 assert.doesNotMatch(controller,/mediaItems\s*=\s*\[/);
 assert.match(controller,/gallery-private-unlocked/);
 assert.match(community,/query = query\.eq\("visibility", "members"\)/);
 assert.match(archive,/if \(!includePrivate\) mediaQuery = mediaQuery\.eq\("visibility", "members"\)/);
});
test("gallery privacy migration stores a hash and scopes notifications",async()=>{
 const sql=await read("supabase/migrations/20261018120000_gallery_social_experience.sql");
 assert.match(sql,/extensions\.crypt/); assert.match(sql,/verify_gallery_private_passcode/);
 assert.match(sql,/community_gallery_comment_recipients/); assert.match(sql,/gallery_tag/);
 assert.match(sql,/Tagged person must be able to view this media/); assert.match(sql,/Comment recipient must be able to view this media/);
});

test("gallery recovers individual signed URLs and uses the supplied visual shell",async()=>{
 const [archive,community,css,ui]=await Promise.all([read("src/gallery-archive.js"),read("src/community-gallery.js"),read("assets/css/pages/gallery.css"),read("galeria.html")]);
 assert.match(archive,/createSignedUrl\(item\.storage_path, 1800\)/);
 assert.match(archive,/thumbnail retry failed/i);
 assert.match(community,/Community media URL recovery failed/);
 assert.match(community,/createSignedUrl\(item\.storage_path, 1800\)/);
 assert.match(css,/GalleryPro visual replacement/);
 assert.match(css,/data-site-header/);
 assert.match(css,/gallery-category:nth-child\(5\)/);
 assert.match(ui,/data-gallery-upload/);
 assert.match(ui,/data-gallery-view="masonry"/);
});

test("gallery upload SQL accepts ordinary UUID filenames",async()=>{
 const sql=await read("supabase/migrations/20261018170000_fix_gallery_upload_path_regex.sql");
 assert.ok(sql.includes(String.raw`/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|heic|mp4|webm|mp3|m4a|ogg|wav|aac)$`));
 assert.ok(sql.includes(String.raw`\'^[a-f0-9-]{36}\.(jpg|jpeg|png|webp|heic|mp4|webm|mp3|m4a|ogg|wav|aac)$\'`));
});

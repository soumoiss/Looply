import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"..");
const read=path=>readFile(resolve(root,path),"utf8");

test("centralized theme catalog offers all legacy and new fonts and palettes",async()=>{
  const [settings,api,bootstrap,originalMigration,newMigration,css]=await Promise.all([
    read("assets/js/settings.js"),read("src/theme.js"),read("src/theme-bootstrap.js"),
    read("supabase/migrations/20261020120000_expand_profile_style_options.sql"),
    read("migration/20261110_global_theme_font_presets.sql"),
    read("assets/css/app.css")
  ]);
  for(const key of ["manrope","dm_sans","jakarta","space_grotesk","cormorant","playfair","fraunces","caveat","syne"]){
    assert.match(settings,new RegExp('["\\x27]'+key+'["\\x27]'),key);
    assert.match(bootstrap,new RegExp('\\b'+key+':'),key);
    assert.ok(originalMigration.includes("'"+key+"'"));
  }
  for(const key of ["aurora","coral","menta","sunset","grafite"]){
    assert.ok(settings.includes('"'+key+'"'),key);
    assert.match(bootstrap,new RegExp('\\b'+key+':'),key);
    assert.ok(originalMigration.includes("'"+key+"'"));
  }
  for(const key of ["hacker","bts","blackpink","bob_esponja","jovens_titas","teen_wolf","cyberpunk","kawaii","vaporwave"]){
    assert.ok(settings.includes('"'+key+'"'),key);
    assert.match(bootstrap,new RegExp('\\b'+key+':'),key);
    assert.ok(newMigration.includes("'"+key+"'"),key);
  }
  for(const key of ["ibm_plex_mono","orbitron","fredoka","bangers","oswald","outfit","urbanist","vt323"]){
    assert.ok(settings.includes('"'+key+'"'),key);
    assert.match(bootstrap,new RegExp('\\b'+key+':'),key);
    assert.ok(newMigration.includes("'"+key+"'"),key);
  }
  assert.match(settings,/themeOptions\(themeIds\.creative/);
  assert.match(settings,/fontOptions\(fontGroups\.tech/);
  assert.match(settings,/formTheme\.addEventListener\("change"/);
  assert.match(settings,/client\.from\("profiles"\)\.update\(updates\)/);
  assert.match(api,/import "\.\/theme-bootstrap\.js"/);
  assert.match(css,/fonts\.googleapis\.com\/css2/);
});

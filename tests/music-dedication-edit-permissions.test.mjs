import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readOwnDedicationForEdit, saveOwnDedicationNote } from "../src/music-dedication-edit.js";
import { musicMarkup } from "../src/music.js";
import { profileAreaMarkup } from "../src/profiles.js";

const source = path => readFile(new URL("../" + path, import.meta.url), "utf8");

function mockNeon({ row, actor = "sender", rpcAllowed = true } = {}) {
  const record = structuredClone(row || {
    id:"dedication-01",sender_id:"sender",recipient_id:"recipient",title:"Música",artist:"Artista",dedication_note:"Texto anterior"
  });
  const calls = [];
  const client = {
    dataApiUrl:"https://example.test/neon",
    auth:{ getSession:async()=>({data:{session:{access_token:"test.jwt.token"}},error:null}) },
    from(table) {
      assert.equal(table,"music_dedications");
      const filters=[];
      const q={
        select(cols){calls.push({operation:"read",columns:cols});return q;},
        eq(col,value){filters.push([col,value]);return q;},
        single(){
          const allowed = filters.every(([k,v])=>record[k]===v) && (actor===record.sender_id || actor===record.recipient_id);
          return Promise.resolve(allowed?{data:structuredClone(record),error:null}:{data:null,error:{message:"row_count_mismatch"}});
        }
      };
      return q;
    }
  };
  const fetchImpl = async (url,args) => {
    calls.push({operation:"rpc",url,headers:args.headers,body:JSON.parse(args.body)});
    if (!rpcAllowed || actor !== record.sender_id) return {ok:false,json:async()=>({code:"42501"})};
    const {p_note,p_dedication_id} = JSON.parse(args.body);
    if (p_dedication_id !== record.id) return {ok:false,json:async()=>({code:"42501"})};
    record.dedication_note=p_note;
    return {ok:true,json:async()=>[{id:record.id,dedication_note:p_note}]};
  };
  return {client,fetchImpl,record,calls};
}

test("author edits short, long and multiline notes exactly, verifies persistence and sends no song changes", async () => {
  const notes=["Nova dedicatória!", "Texto longo com coração 💜 e acentuação.\n".repeat(15), "x".repeat(1000), "  Início\n\nFim com 😀.  "];
  for (const note of notes) {
    const db=mockNeon();
    const current=await readOwnDedicationForEdit(db.client,"dedication-01","sender");
    assert.equal(current.dedication_note,"Texto anterior");
    const result=await saveOwnDedicationNote(db.client,current.id,"sender",note,db.fetchImpl);
    assert.equal(result.dedication_note,note);
    assert.equal(db.record.dedication_note,note);
    assert.equal(db.record.title,"Música");
    assert.equal(db.record.recipient_id,"recipient");
    assert.deepEqual(db.calls.find(x=>x.operation==="rpc").body,{p_dedication_id:"dedication-01",p_note:note});
    assert.equal(db.calls.filter(x=>x.operation==="read").length,3);
  }
});

test("missing authorization fails closed without modifying dedication",async()=>{
  const db=mockNeon({actor:"recipient"});
  await assert.rejects(saveOwnDedicationNote(db.client,"dedication-01","recipient","Invadindo",db.fetchImpl),/permissão/);
  assert.equal(db.record.dedication_note,"Texto anterior");
  const other=mockNeon({actor:"sender",rpcAllowed:false});
  await assert.rejects(saveOwnDedicationNote(other.client,"dedication-01","sender","Falhar",other.fetchImpl),/permissão/);
  assert.equal(other.record.dedication_note,"Texto anterior");
});

test("missing or partial reread after a successful RPC is not counted as confirmed persistence",async()=>{
  const db=mockNeon();
  const fetchImpl=async()=>({ok:true,json:async()=>[{id:"dedication-01",dedication_note:"Novo"}]});
  await assert.rejects(saveOwnDedicationNote(db.client,"dedication-01","sender","Novo",fetchImpl),/leitura posterior/);
  assert.equal(db.record.dedication_note,"Texto anterior");
});

test("edit controls only appear on sent dedications; private comments and player remain",()=>{
  const entry={id:"d",sender_id:"sender",recipient_id:"recipient",title:"Canção",artist:"Artista",dedication_note:"Olá\nOutro verso",listen_url:"https://www.youtube.com/watch?v=abcdefghijk",created_at:"2026-10-28T12:00:00Z",comments:[]};
  const base={people:[],dedications:[entry],library:[],generalComments:[],dedicationsError:null,libraryError:null,peopleError:null,generalCommentsError:null};
  const sent=musicMarkup(base,"sender");
  const received=musicMarkup(base,"recipient");
  assert.match(sent,/data-music-edit-dedication="d"/);
  assert.match(sent,/data-music-dedication-edit-form/);
  assert.match(sent,/data-music-comment/);
  assert.match(sent,/music-player|music-embed|music-listen/);
  const receiverPanel=received.match(/data-music-direction-panel="received"[^]*?<\/section>/)?.[0]||"";
  assert.doesNotMatch(receiverPanel,/data-music-edit-dedication=/);
  assert.match(received,/Comentários/);
});

test("admin paragraph removed without removing private-comment controls and profile URL is admin-only",async()=>{
  const [admin,playlist,music,sql] = await Promise.all([
    source("src/music-admin-playlists.js"),source("src/youtube-playlist.js"),
    source("src/music.js"),source("migration/20261028_music_dedication_edit_playlist_guard.sql")
  ]);
  assert.doesNotMatch(admin,/Inspecione playlists reais e escreva comentários privados visíveis/);
  assert.match(admin,/data-admin-music-comment-form/);
  assert.match(admin,/admin_music_track_comments/);
  assert.match(admin,/v3_self_is_admin/);
  assert.match(playlist,/playlistMarkup/);
  assert.match(playlist,/bindYouTubePlaylist/);
  assert.match(music,/saveOwnDedicationNote/);
  assert.doesNotMatch(profileAreaMarkup({id:"u",username:"u",display_name:"Usuario"}),/name="playlistUrl"/);
  assert.match(profileAreaMarkup({id:"u",username:"u",display_name:"ADM"},true),/name="playlistUrl"/);
  assert.match(sql,/v6_guard_playlist_url_update/);
  assert.match(sql,/v6_update_own_music_dedication/);
});

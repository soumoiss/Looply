import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dedicationTrackFromUrl, normalizeDedicationTrack, spotifyTrackFromLink, searchDedicationProvider } from "../src/music-track-dedications.js";
import { musicEmbedForUrl, musicPlayerMarkup, musicMarkup } from "../src/music.js";
import { deleteOwnDedication } from "../src/music-dedication-delete.js";

const spotifyId = "4uLU6hMCjMI75M1A2tKUQC";
const spotifyUrl = "https://open.spotify.com/track/" + spotifyId;
const appleId = "1234567890";
const appleUrl = "https://music.apple.com/br/album/cancao/55667788?i=" + appleId;
const source = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Spotify: only one track, never an album, playlist, artist or remote host", () => {
  assert.equal(dedicationTrackFromUrl(spotifyUrl)?.id, spotifyId);
  assert.equal(dedicationTrackFromUrl("https://open.spotify.com/intl-pt-br/track/" + spotifyId + "?si=123")?.id,spotifyId);
  for (const kind of ["album","playlist","artist","show"]) {
    assert.equal(dedicationTrackFromUrl("https://open.spotify.com/" + kind + "/" + spotifyId),null);
    assert.equal(musicEmbedForUrl("https://open.spotify.com/" + kind + "/" + spotifyId),null);
  }
  assert.equal(dedicationTrackFromUrl("https://open.spotify.com.evil.example/track/" + spotifyId), null);
  const song = spotifyTrackFromLink(spotifyUrl,"Canção","Artista");
  assert.equal(song?.provider,"spotify");
  assert.equal(song?.url,spotifyUrl);
  assert.equal(spotifyTrackFromLink(spotifyUrl,"","Artista"),null);
  assert.equal(spotifyTrackFromLink("https://open.spotify.com/playlist/" + spotifyId,"Canção","Artista"),null);
  const widget = musicPlayerMarkup({title:"Canção",artist:"Artista",listen_url:spotifyUrl});
  assert.match(widget,/open\.spotify\.com\/embed\/track\//);
  assert.doesNotMatch(widget,/embed\/(?:album|playlist)/);
  assert.match(widget,/height="152"/);
});

test("Apple: album link with i identifier becomes one song and only its official preview is rendered", () => {
  assert.equal(dedicationTrackFromUrl(appleUrl)?.id,appleId);
  assert.equal(dedicationTrackFromUrl(appleUrl)?.url,"https://music.apple.com/br/song/"+appleId);
  assert.equal(dedicationTrackFromUrl("https://music.apple.com/br/album/album/55667788"),null);
  assert.equal(dedicationTrackFromUrl("https://music.apple.com/br/playlist/hits/pl.123"),null);
  const song = normalizeDedicationTrack({provider:"apple",title:"Canção",artist:"Artista",url:appleUrl,id:appleId});
  assert.equal(song?.url,"https://music.apple.com/br/song/"+appleId);
  assert.equal(normalizeDedicationTrack({provider:"apple",title:"Canção",artist:"Artista",url:appleUrl,id:"1234567899"}),null);
  assert.equal(normalizeDedicationTrack({provider:"deezer",title:"Canção",artist:"Artista",url:"https://deezer.com/track/123"}),null);
  const html=musicPlayerMarkup({title:"Canção",artist:"Artista",listen_url:appleUrl});
  assert.match(html,/data-music-apple-preview="1234567890"/);
  assert.match(html,/data-music-apple-play/);
  assert.doesNotMatch(html,/<iframe|embed\.music\.apple\.com/);
});

test("Spotify search calls the authenticated metadata service while Apple search remains public", async () => {
  let calledUrl="";
  const apple=await searchDedicationProvider("canção","apple",null,{
    fetcher:async (url)=>{
      calledUrl=String(url);
      return new Response(JSON.stringify({results:[
        {kind:"song",trackId:1234567890,trackName:"Canção",artistName:"Artista",
          trackViewUrl:appleUrl,artworkUrl100:"https://is1-ssl.mzstatic.com/123",
          previewUrl:"https://audio-ssl.itunes.apple.com/some.m4a"}
      ]}),{status:200});
    }
  });
  assert.match(calledUrl,/itunes\.apple\.com\/search/);
  assert.equal(apple.length,1);
  assert.equal(apple[0].provider,"apple");
  const calls=[];
  const spotify=await searchDedicationProvider("canção","spotify",{
    auth:{getSession:async()=>({data:{session:{access_token:"test-session"}},error:null})}
  },{
    fetcher:async (url,init)=>{
      calls.push({url,init});
      return new Response(JSON.stringify({items:[{id:spotifyId,name:"Canção",artist:"Artista"}]}),{status:200});
    }
  });
  assert.equal(spotify.length,1);
  assert.equal(spotify[0].provider,"spotify");
  assert.match(calls[0].url,/\/spotify\/search\?/);
  assert.equal(calls[0].init.headers.authorization,"Bearer test-session");
});

test("the sender sees edit and delete; recipient never gets author-only controls", () => {
  const data={people:[],peopleError:null,
    dedications:[{id:"d-1",sender_id:"sender",recipient_id:"receiver",title:"Canção",artist:"Artista",listen_url:spotifyUrl,created_at:"2026-10-01T00:00:00Z",comments:[],sender:{username:"sender"},recipient:{username:"receiver"}}],
    dedicationsError:null,library:[],libraryError:null,generalComments:[],generalCommentsError:null};
  const sent=musicMarkup(data,"sender"),received=musicMarkup(data,"receiver");
  assert.match(sent,/data-music-delete-dedication="d-1"/);
  assert.match(sent,/data-music-edit-dedication="d-1"/);
  assert.doesNotMatch(received,/data-music-delete-dedication/);
  assert.doesNotMatch(received,/data-music-edit-dedication/);
});

test("sender deletion uses authenticated Neon RPC and verifies that recipient record is gone", async () => {
  const calls=[];
  const client={
    dataApiUrl:"https://example.neon.tech",
    auth:{getSession:async()=>({data:{session:{access_token:"jwt"}},error:null})},
    from:(table)=>{
      assert.equal(table,"music_dedications");
      const q={
        select:()=>q,eq:(key,val)=>{calls.push({key,val});return q},
        single:async()=>({data:{id:"d1",sender_id:"sender",dedication_note:""},error:null}),
        limit:async()=>({data:[],error:null})
      };
      return q;
    }
  };
  let requested;
  await deleteOwnDedication(client,"d1","sender",async (url,options)=>{
    requested={url,options};
    return new Response(JSON.stringify([{id:"d1"}]),{status:200});
  });
  assert.match(requested.url,/\/rpc\/v7_delete_own_music_dedication$/);
  assert.deepEqual(JSON.parse(requested.options.body),{p_dedication_id:"d1"});
  assert.equal(requested.options.headers.authorization,"Bearer jwt");
  assert.ok(calls.some(x=>x.key==="sender_id"&&x.val==="sender"));
});

test("SQL exposes no direct REST deletion and authenticates sender_id inside a DEFINER RPC", async () => {
  const sql=await source("migration/20261110_music_sender_delete_rpc.sql");
  assert.match(sql,/REVOKE DELETE ON TABLE public\.music_dedications FROM PUBLIC, authenticated/);
  assert.doesNotMatch(sql,/FROM PUBLIC, anon/);
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/d\.sender_id = actor/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.v7_delete_own_music_dedication/);
  const controller=await source("src/music.js");
  assert.match(controller,/normalizeDedicationTrack\(selectedDedicationSong\)/);
  assert.match(controller,/data-music-provider="spotify"/);
  assert.match(controller,/data-music-provider="apple"/);
  assert.match(controller,/deleteOwnDedication\(client,dedicationId,userId\)/);
});

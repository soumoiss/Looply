import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  normalizeLicensedStorySong,searchLicensedStorySongs,downloadLicensedStorySong,
  licensedStoryAttribution,captionWithLicensedMusic
} from "../src/story-licensed-music.js";

const licensed=(override={})=>({
  id:"6d40d6a7-0bed-41ec-a234-cc412e9a73ff",
  title:"Uma canção livre",creator:"Autoria original",license:"by",license_version:"4.0",
  license_url:"https://creativecommons.org/licenses/by/4.0/",
  url:"https://upload.wikimedia.org/wikipedia/commons/8/8b/music.mp3",
  foreign_landing_url:"https://commons.wikimedia.org/wiki/File:music.mp3",
  filetype:"mp3", filesize:4096,source:"wikimedia",
  ...override
});

test("Search returns only CC0 or CC BY works with explicit credible metadata and source",async()=>{
  const records=[
    licensed(),licensed({id:"cc0-track",license:"cc0",license_version:"1.0",license_url:"https://creativecommons.org/publicdomain/zero/1.0/"}),
    licensed({id:"restricted",license:"by-nc",license_url:"https://creativecommons.org/licenses/by-nc/4.0/"}),
    licensed({id:"no-license-proof",license_url:"https://example.com/terms"}),
    licensed({id:"prohibited-host",url:"http://127.0.0.1/internal"}),
    licensed({id:"wrong-format",filetype:"exe"})
  ];
  let requested="";
  const fetcher=async url=>{
    requested=String(url);
    return {ok:true,json:async()=>({results:records})};
  };
  const result=await searchLicensedStorySongs("paz",{fetcher});
  assert.equal(result.length,2);
  assert.match(requested,/license=cc0%2Cby/);
  assert.match(requested,/category=music/);
  assert.equal(result[1].license,"cc0");
});

test("Creative Commons license claims are not treated as proof of rights",()=>{
  assert.equal(normalizeLicensedStorySong(licensed({license:"by-sa",license_url:"https://creativecommons.org/licenses/by-sa/4.0/"})),null);
  assert.equal(normalizeLicensedStorySong(licensed({license:"by",license_version:"4.0",license_url:"https://creativecommons.org/licenses/by-nc/4.0/"})),null);
  assert.equal(normalizeLicensedStorySong(licensed({filetype:"mp3",filesize:16*1024*1024})),null);
});

test("Download imports actual audio bytes into a File, keeping credits intact",async()=>{
  const track=normalizeLicensedStorySong(licensed());
  const mp3=Uint8Array.from([73,68,51,4,0,0,0,0,0,0,3,4,5,6,7,8]);
  const download=await downloadLicensedStorySong(track,{
    fetcher:async(_,options)=>{
      assert.equal(options.credentials,"omit");
      return {ok:true,headers:{get:k=>k==="content-type"?"audio/mpeg":""},arrayBuffer:async()=>mp3.buffer};
    }
  });
  assert.equal(download.kind,"file");
  assert.equal(download.licenseVerifiedByUser,true);
  assert.equal(download.file.type,"audio/mpeg");
  assert.deepEqual(new Uint8Array(await download.file.arrayBuffer()),mp3);
  const attributed=captionWithLicensedMusic("Meu Story",download);
  assert.match(attributed,/Meu Story/);
  assert.match(attributed,/Autoria original/);
  assert.match(attributed,/creativecommons.org\/licenses\/by\/4.0/);
  assert.match(attributed,/commons.wikimedia.org/);
  assert.ok(attributed.length<=700);
});

test("Rejects fake audio, hostile responses, oversized headers and empty downloads",async()=>{
  const track=normalizeLicensedStorySong(licensed());
  const response=bytes=>({
    ok:true,headers:{get:()=> "audio/mpeg"},
    arrayBuffer:async()=>Uint8Array.from(bytes).buffer
  });
  await assert.rejects(()=>downloadLicensedStorySong(track,{fetcher:async()=>response([1,2,3,4])}),/formato de áudio/);
  await assert.rejects(()=>downloadLicensedStorySong(track,{fetcher:async()=>response([])}),/maior que|vazio/i);
  await assert.rejects(()=>downloadLicensedStorySong(track,{fetcher:async()=>({
    ok:true,headers:{get:key=>key==="content-length"?String(16*1024*1024):"audio/mpeg"}
  })}),/maior que/);
});

test("Story music UI keeps imported music in-app, and caption credits persist with uploads",async()=>{
  const picker=await readFile(new URL("../src/story-music-picker.js",import.meta.url),"utf8");
  const studio=await readFile(new URL("../src/story-studio.js",import.meta.url),"utf8");
  assert.match(picker,/data-studio-provider="openverse"/);
  assert.match(picker,/downloadLicensedStorySong\(track,\{signal:task.signal\}\)/);
  assert.match(picker,/onSelect\(imported\)/);
  assert.match(picker,/window\.confirm/);
  assert.doesNotMatch(picker,/fileInput\.click\(\)/);
  assert.match(studio,/captionWithLicensedMusic\(caption.value,music\)/);
  assert.match(studio,/const media = await exportFinal\(armedAudioContext\)/);
  assert.match(studio,/source\.connect\(destination\)/);
  assert.match(studio,/await uploadResumable\(client, uploadedPath, normalized/);
});

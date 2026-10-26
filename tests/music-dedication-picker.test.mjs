import test from "node:test";
import assert from "node:assert/strict";
import { musicMarkup } from "../src/music.js";
import { normalizeStorySong, officialSongPreview, searchStorySongs } from "../src/story-music-catalog.js";

const userId = "user-current";
const sample = (id, sender, recipient) => ({
  id, sender_id: sender, recipient_id: recipient,
  title: "Canção " + id, artist: "Artista",
  listen_url: "https://music.apple.com/br/album/teste/123?i=456",
  created_at: "2026-10-26T10:00:00Z",
  sender: { username: sender, display_name: sender },
  recipient: { username: recipient, display_name: recipient },
  comments: []
});

test("dedication composer uses catalog selection, keeps note optional, and offers official preview", () => {
  const data = {
    people: [{ id: "recipient", username: "destino", display_name: "Destino" }],
    peopleError: null,
    dedications: [], dedicationsError: null,
    library: [], libraryError: null,
    generalComments: [], generalCommentsError: null
  };
  const markup = musicMarkup(data, userId);
  assert.match(markup, /data-music-open-search/);
  assert.match(markup, /data-music-picker-confirm disabled/);
  assert.match(markup, /data-music-catalog-query/);
  assert.match(markup, /name="title" type="hidden"/);
  assert.match(markup, /name="artist" type="hidden"/);
  assert.match(markup, /name="listenUrl" type="hidden"/);
  assert.match(markup, /name="note" maxlength="1000"/);
  assert.doesNotMatch(markup, /id="musicTitle" name="title" type="text"/);
  assert.doesNotMatch(markup, /id="musicUrl" name="listenUrl" type="url"/);
  assert.match(markup, /data-music-direction="received"/);
  assert.match(markup, /data-music-direction="sent"/);
});

test("received and sent dedications render in separate user-scoped panels", () => {
  const data = {
    people: [], peopleError: null,
    dedications: [sample("in", "friend", userId), sample("out", userId, "friend")],
    dedicationsError: null, library: [], libraryError: null,
    generalComments: [], generalCommentsError: null
  };
  const markup = musicMarkup(data, userId);
  const receivedPanel = markup.slice(markup.indexOf('data-music-direction-panel="received"'), markup.indexOf('data-music-direction-panel="sent"'));
  const sentPanel = markup.slice(markup.indexOf('data-music-direction-panel="sent"'));
  assert.match(receivedPanel, /dedication-in/);
  assert.doesNotMatch(receivedPanel, /dedication-out/);
  assert.match(sentPanel, /dedication-out/);
  assert.doesNotMatch(sentPanel, /dedication-in/);
  assert.match(markup, /1 recebida · 1 enviada/);
});

test("unavailable received or sent views have explicit empty states", () => {
  const data = {
    people: [], peopleError: null, dedications: [], dedicationsError: null,
    library: [], libraryError: null, generalComments: [], generalCommentsError: null
  };
  const markup = musicMarkup(data, userId);
  assert.match(markup, /Você ainda não recebeu músicas dedicadas/);
  assert.match(markup, /Você ainda não dedicou músicas/);
});

test("catalog selector uses the existing official unified search and only normalizes provider URLs", async () => {
  let requestedUrl = "";
  const { items } = await searchStorySongs("artista teste", {
    fetcher: async url => {
      requestedUrl = url;
      return new Response(JSON.stringify({
        providers: [{
          provider: "apple", available: true,
          items: [{
            provider: "apple", id: "456", title: "Música teste", artist: "Artista",
            url: "https://music.apple.com/br/album/teste/123?i=456",
            artwork: "https://is1-ssl.mzstatic.com/image.jpg",
            previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a"
          }]
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.match(requestedUrl, /\?q=artista%20teste/);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Música teste");
  assert.equal(items[0].provider, "apple");
  assert.equal(officialSongPreview(items[0]).kind, "audio");
  assert.equal(normalizeStorySong({ ...items[0], url: "https://attacker.example/track" }), null);
});

test("dedication saves only the selected normalized catalog song, not editable manual metadata", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/music.js", import.meta.url), "utf8");
  assert.match(source, /const song = normalizeStorySong\(selectedDedicationSong\)/);
  assert.match(source, /listen_url: listenUrl/);
  assert.match(source, /searchStorySongs\(normalized, \{ signal: catalogSearchController.signal \}\)/);
  assert.match(source, /catalogSearchSequence/);
  assert.match(source, /catalogSearchController\?\.abort\(\)/);
  assert.match(source, /safeMusicArtwork/);
});

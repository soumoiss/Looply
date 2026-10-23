import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/youtube-playlist.js";

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = String(value); }
  };
}

function createRequest(url = "/api/youtube-playlist?playlistId=PLD5PXwJcU-Sg", authorization = "Bearer valid-session-token", method = "GET", origin = "") {
  return { method, url, headers: { ...(authorization ? { authorization } : {}), ...(origin ? { origin } : {}) } };
}

const env = {
  LOOPLY_SUPABASE_URL: "https://qixocgetiwlrsbadpbvh.supabase.co",
  LOOPLY_SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
  LOOPLY_YOUTUBE_API_KEY: "server-only-test-key"
};

test("YouTube playlist API rejects unauthenticated requests before network access", async () => {
  const response = createResponse();
  let calls = 0;
  await handler(createRequest(undefined, ""), response, {
    env,
    fetchImpl: async () => { calls += 1; throw new Error("unexpected network request"); }
  });
  assert.equal(response.statusCode, 401);
  assert.equal(calls, 0);
  assert.equal(JSON.parse(response.body).error, "youtube_unauthorized");
});

test("YouTube playlist API validates the Supabase session and only allows configured playlist IDs", async () => {
  const response = createResponse();
  let calls = 0;
  await handler(createRequest("/api/youtube-playlist?playlistId=attacker-playlist"), response, {
    env,
    fetchImpl: async (url) => {
      calls += 1;
      if (/auth\/v1\/user$/.test(String(url))) return { ok: true, status: 200, json: async () => ({ id: "authenticated-user" }) };
      assert.match(String(url), /rest\/v1\/profiles\?id=eq\.authenticated-user/);
      return { ok: true, status: 200, json: async () => [] };
    }
  });
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).error, "youtube_playlist_not_allowed");
  assert.equal(calls, 2);
});


test("YouTube playlist API allows a verified administrator to inspect another user's playlist", async () => {
  const response = createResponse();
  const calls = [];
  await handler(createRequest("/api/youtube-playlist?playlistId=custom-user-playlist"), response, {
    env,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/auth/v1/user")) return { ok: true, status: 200, json: async () => ({ id: "admin-user" }) };
      if (String(url).includes("/rest/v1/profiles")) return { ok: true, status: 200, json: async () => [{ playlist_url: "https://www.youtube.com/playlist?list=somebody-elses-list" }] };
      if (String(url).includes("/functions/v1/looply-admin")) {
        assert.equal(init.method, "POST");
        assert.equal(init.headers.authorization, "Bearer valid-session-token");
        assert.deepEqual(JSON.parse(init.body), { resourceType: "status" });
        return { ok: true, status: 200, json: async () => ({ isAdmin: true }) };
      }
      assert.equal(new URL(String(url)).searchParams.get("playlistId"), "custom-user-playlist");
      return { ok: true, status: 200, json: async () => ({ items: [], pageInfo: { totalResults: 0 } }) };
    }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(calls.some((call) => call.url.includes("/functions/v1/looply-admin")), true);
});

test("YouTube playlist API does not allow another user's playlist to a non-admin", async () => {
  const response = createResponse();
  await handler(createRequest("/api/youtube-playlist?playlistId=custom-user-playlist"), response, {
    env,
    fetchImpl: async (url) => {
      if (String(url).includes("/auth/v1/user")) return { ok: true, status: 200, json: async () => ({ id: "ordinary-user" }) };
      if (String(url).includes("/rest/v1/profiles")) return { ok: true, status: 200, json: async () => [{ playlist_url: "https://www.youtube.com/playlist?list=somebody-elses-list" }] };
      if (String(url).includes("/functions/v1/looply-admin")) return { ok: true, status: 200, json: async () => ({ isAdmin: false }) };
      throw new Error("non-admin must not reach YouTube");
    }
  });
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).error, "youtube_playlist_not_allowed");
});

test("YouTube playlist API keeps the Google key server-side and returns normalized track data", async () => {
  const response = createResponse();
  const calls = [];
  await handler(createRequest("/api/youtube-playlist?playlistId=PLD5PXwJcU-Sg&pageToken=next-page"), response, {
    env,
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("/auth/v1/user")) {
        assert.equal(init.headers.authorization, "Bearer valid-session-token");
        assert.equal(init.headers.apikey, env.LOOPLY_SUPABASE_PUBLISHABLE_KEY);
        return { ok: true, status: 200, json: async () => ({ id: "authenticated-user" }) };
      }
      const upstreamUrl = new URL(String(url));
      assert.equal(upstreamUrl.searchParams.get("key"), env.LOOPLY_YOUTUBE_API_KEY);
      assert.equal(upstreamUrl.searchParams.get("pageToken"), "next-page");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [{
            snippet: {
              resourceId: { videoId: "abcdefghijk" },
              title: "Faixa privada ao app",
              channelTitle: "Canal de teste",
              position: 7
            }
          }],
          nextPageToken: "next-page-2"
        })
      };
    }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 2);
  const body = JSON.parse(response.body);
  assert.deepEqual(body.items, [{
    videoId: "abcdefghijk",
    title: "Faixa privada ao app",
    channel: "Canal de teste",
    position: 7,
    thumbnail: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"
  }]);
  assert.equal(body.nextPageToken, "next-page-2");
  assert.doesNotMatch(response.body, /server-only-test-key|publishable-test-key|valid-session-token/);
  assert.equal(response.headers["cache-control"], "no-store");
});

test("YouTube playlist API does not reveal upstream error payloads", async () => {
  const response = createResponse();
  await handler(createRequest(), response, {
    env,
    fetchImpl: async (url) => String(url).includes("/auth/v1/user")
      ? { ok: true, status: 200, json: async () => ({ id: "authenticated-user" }) }
      : { ok: false, status: 403, json: async () => ({ error: { message: "contains-secret", errors: [{ reason: "quotaExceeded" }] } }) }
  });
  assert.equal(response.statusCode, 502);
  assert.deepEqual(JSON.parse(response.body), {
    error: "youtube_quota_exceeded",
    reason: "quotaExceeded",
    upstreamStatus: 403
  });
  assert.doesNotMatch(response.body, /contains-secret|server-only-test-key/);
});

test("YouTube playlist API answers CORS preflight only for the configured public app origins", async () => {
  const response = createResponse();
  let calls = 0;
  await handler(createRequest(undefined, "", "OPTIONS", "https://soumoiss.github.io"), response, {
    env,
    fetchImpl: async () => { calls += 1; throw new Error("preflight must not call upstream services"); }
  });
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "https://soumoiss.github.io");
  assert.match(response.headers["access-control-allow-headers"], /authorization/i);
  assert.equal(calls, 0);
});

test("YouTube playlist API rejects unapproved cross-origin callers", async () => {
  const response = createResponse();
  let calls = 0;
  await handler(createRequest(undefined, "Bearer valid-session-token", "GET", "https://attacker.example"), response, {
    env,
    fetchImpl: async () => { calls += 1; throw new Error("untrusted origin must be rejected"); }
  });
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error, "origin_not_allowed");
  assert.equal(calls, 0);
});

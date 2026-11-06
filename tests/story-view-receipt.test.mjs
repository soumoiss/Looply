import test from "node:test";
import assert from "node:assert/strict";
import { recordStoryView } from "../src/story-view-receipt.js";

const storyId = "00000000-0000-4000-8000-000000000001";
const viewerId = "00000000-0000-4000-8000-000000000002";

function clientWith({ rpc, insert, receipt }) {
  const calls = [];
  const client = {
    rpc: async (name, params) => { calls.push([name, params]); return rpc; },
    from: table => {
      assert.equal(table, "story_views");
      return {
        insert: async values => { calls.push(["insert", values]); return insert; },
        select: columns => {
          calls.push(["select", columns]);
          const query = {
            eq: (field, value) => { calls.push([field, value]); return query; },
            maybeSingle: async () => receipt
          };
          return query;
        }
      };
    }
  };
  return { client, calls };
}

test("a successful story RPC saves the ring without a second write", async () => {
  const { client, calls } = clientWith({ rpc: { data: true, error: null } });
  assert.equal(await recordStoryView(client, storyId, viewerId), true);
  assert.deepEqual(calls, [["record_story_view", { p_story_id: storyId }]]);
});

test("the deployed RPC's missing columns fall back to the viewer-scoped receipt insert", async () => {
  const { client, calls } = clientWith({
    rpc: { data: null, error: { code: "42703", message: 'column "last_viewed_at" does not exist' } },
    insert: { error: null }
  });
  assert.equal(await recordStoryView(client, storyId, viewerId), true);
  assert.deepEqual(calls.at(-1), ["insert", { story_id: storyId, viewer_id: viewerId }]);
});

test("an existing receipt counts as seen without creating another view", async () => {
  const { client } = clientWith({
    rpc: { data: null, error: { code: "42703", message: 'column "view_count" does not exist' } },
    insert: { error: { code: "23505" } },
    receipt: { data: { story_id: storyId }, error: null }
  });
  assert.equal(await recordStoryView(client, storyId, viewerId), true);
});

test("permission failures never mark a story as seen or bypass the server", async () => {
  const denied = { code: "42501", message: "Story not available" };
  const { client, calls } = clientWith({ rpc: { data: null, error: denied } });
  await assert.rejects(recordStoryView(client, storyId, viewerId), error => error === denied);
  assert.equal(calls.length, 1);
});

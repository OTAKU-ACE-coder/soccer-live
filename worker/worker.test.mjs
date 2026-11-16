import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

test("proxy limits the upstream, caches valid feeds, and reports schema changes", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new Map();
  const ctx = { waitUntil: (promise) => promise };
  let calls = 0;
  globalThis.caches = { default: {
    match: async key => cache.get(key.url)?.clone(),
    put: async (key, value) => cache.set(key.url, value),
  } };
  globalThis.fetch = async (url) => {
    calls++;
    assert.equal(url.hostname, "site.api.espn.com");
    assert.match(url.pathname, /\/uefa\.nations\/scoreboard$/);
    return Response.json(url.searchParams.size ? { changed: true } : { events: [] });
  };
  const request = (path, options) => worker.fetch(new Request("https://soccer-worker.example" + path, options), {}, ctx);
  try {
    assert.equal((await request("/scores/uefa.nations/scoreboard", { method: "POST" })).status, 405);
    assert.equal((await request("/scores/elsewhere/scoreboard")).status, 404);
    assert.equal((await request("/scores/uefa.nations/scoreboard?site=example.com")).status, 404);
    assert.equal((await request("/scores/uefa.nations/scoreboard?dates=20261116&dates=20261117")).status, 404);
    const first = await request("/scores/uefa.nations/scoreboard");
    assert.equal(first.headers.get("cache-control"), "public, max-age=30, s-maxage=45");
    assert.deepEqual(await first.json(), { events: [] });
    assert.equal((await request("/scores/uefa.nations/scoreboard")).status, 200);
    assert.equal(calls, 1);
    const wrong = await request("/scores/uefa.nations/scoreboard?dates=20261116");
    assert.equal(wrong.status, 502);
    assert.equal(wrong.headers.get("x-soccer-feed-error"), "format");
    assert.equal(cache.size, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

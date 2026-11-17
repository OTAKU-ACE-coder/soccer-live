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
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url.hostname, "site.api.espn.com");
    assert.equal(options.redirect, "manual");
    if (url.searchParams.get("dates") === "20261117") return Response.redirect("https://example.com/");
    if (url.pathname === "/apis/v2/sports/soccer/eng.1/standings") return Response.json({ children: [] });
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
    assert.equal((await request("/scores/uefa.nations/scoreboard?dates=20261117")).status, 502);
    assert.equal(cache.size, 1);
    const standings = await request("/tables/eng.1/standings");
    assert.equal(standings.status, 200);
    assert.deepEqual(await standings.json(), { children: [] });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("football lookup accepts only bounded searches and player identifiers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(url.hostname, "site.web.api.espn.com");
    if (url.pathname === "/apis/search/v2") {
      assert.equal(url.searchParams.get("query"), "Al Nassr");
      assert.equal(url.searchParams.get("type"), "player,team");
      return Response.json({ results: [] });
    }
    assert.equal(url.pathname, "/apis/common/v3/sports/soccer/all/athletes/45843");
    return Response.json({ athlete: { displayName: "Lionel Messi" }, unrelated: {} });
  };
  const request = path => worker.fetch(new Request("https://soccer-worker.example" + path), {}, {});
  try {
    assert.equal((await request("/lookup/search?query=x")).status, 404);
    assert.equal((await request("/lookup/search?query=Al+Nassr&limit=99")).status, 404);
    assert.equal((await request("/lookup/player?id=../../45843")).status, 404);
    assert.equal((await request("/lookup/player?id=1&id=2")).status, 404);
    assert.deepEqual(await (await request("/lookup/search?query=Al+Nassr")).json(), { results: [] });
    assert.deepEqual(await (await request("/lookup/player?id=45843")).json(), { athlete: { displayName: "Lionel Messi" } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
globalThis.SOCCER_LIVE_CONFIG = { footballProxy: "https://feeds.example.test" };
const { searchFootball } = await import("./api.js");
const group = count => ({ results: [{ type: "player", contents: Array.from({ length: count }, (_, id) => ({ uid: "s:600~a:" + id })) }] });
test("expand a capped cached search instead of silently losing players", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const urls = [];
  globalThis.fetch = async url => {
    urls.push(String(url));
    return Response.json(group(String(url).includes("feeds.example.test") ? 23 : 60));
  };
  const data = await searchFootball("Ronaldo");
  assert.equal(data.results.at(-1).contents.length, 60);
  assert.equal(urls.length, 2);
  assert.equal(new URL(urls[1]).searchParams.get("limit"), "100");
});
test("keep usable cached results when expanded search fails", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async url => {
    if (String(url).includes("feeds.example.test")) return Response.json(group(23));
    throw Error("Offline");
  };
  assert.equal((await searchFootball("Ronaldo")).results[0].contents.length, 23);
});
test("do not issue a second request for uncapped search results", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(group(4)); };
  assert.equal((await searchFootball("Neymar")).results[0].contents.length, 4);
  assert.equal(calls, 1);
});
test("cancelled expanded searches cannot replace a newer search", async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const controller = new AbortController();
  globalThis.fetch = async url => {
    if (String(url).includes("feeds.example.test")) return Response.json(group(23));
    controller.abort();
    throw new DOMException("Aborted", "AbortError");
  };
  await assert.rejects(searchFootball("Ronaldo", controller.signal), { name: "AbortError" });
});

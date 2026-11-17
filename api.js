import { validateFeed } from "./feed-format.js?v=d0b99a1d540a";

const provider = {
  scores: "https://site.api.espn.com/apis/site/v2/sports/soccer/",
  tables: "https://site.web.api.espn.com/apis/v2/sports/soccer/",
};
const proxy = globalThis.SOCCER_LIVE_CONFIG?.footballProxy?.trim().replace(/\/+$/, "");
const root = (service) => proxy ? proxy + "/" + service + "/" : provider[service];
export const API = root("scores");
export const TABLE_API = root("tables");
const webProvider = "https://site.web.api.espn.com";

async function lookup(feed, params, fallback, signal) {
  if (proxy) {
    try {
      const proxyTimeout = AbortSignal.timeout(3500);
      return await fetchJson(proxy + "/lookup/" + feed + "?" + params, signal ? AbortSignal.any([signal, proxyTimeout]) : proxyTimeout);
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return fetchJson(webProvider + fallback, signal, feed);
}

export function searchFootball(query, signal) {
  const params = new URLSearchParams({ query });
  const fallback = new URLSearchParams({ query, type: "player,team", limit: "24" });
  return lookup("search", params, "/apis/search/v2?" + fallback, signal);
}

export function getPlayerProfile(id, signal) {
  return lookup("player", new URLSearchParams({ id }), "/apis/common/v3/sports/soccer/all/athletes/" + encodeURIComponent(id), signal);
}

export async function fetchJson(url, signal, feed = new URL(url).pathname.split("/").pop()) {
  const timeout = AbortSignal.timeout(12000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (response.status === 502 && response.headers.get("x-soccer-feed-error") === "format") {
    return validateFeed(feed, null);
  }
  if (!response.ok) throw new Error("Feed unavailable");
  const data = await response.json().catch(() => null);
  return validateFeed(feed, data);
}

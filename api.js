import { validateFeed } from "./feed-format.js?v=c98ccd0efea7";

const provider = {
  scores: "https://site.api.espn.com/apis/site/v2/sports/soccer/",
  tables: "https://site.web.api.espn.com/apis/v2/sports/soccer/",
};
const proxy = globalThis.SOCCER_LIVE_CONFIG?.footballProxy?.trim().replace(/\/+$/, "");
const root = (service) => proxy ? proxy + "/" + service + "/" : provider[service];
export const API = root("scores");
export const TABLE_API = root("tables");
const webProvider = "https://site.web.api.espn.com";

export function searchFootball(query, signal) {
  const params = new URLSearchParams({ query });
  if (proxy) return fetchJson(proxy + "/lookup/search?" + params, signal);
  params.set("type", "player,team");
  params.set("limit", "24");
  return fetchJson(webProvider + "/apis/search/v2?" + params, signal, "search");
}

export function getPlayerProfile(id, signal) {
  if (proxy) return fetchJson(proxy + "/lookup/player?" + new URLSearchParams({ id }), signal);
  return fetchJson(webProvider + "/apis/common/v3/sports/soccer/all/athletes/" + encodeURIComponent(id), signal, "player");
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

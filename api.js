import { validateFeed } from "./feed-format.js?v=6feaefbe941b";

const provider = {
  scores: "https://site.api.espn.com/apis/site/v2/sports/soccer/",
  tables: "https://site.web.api.espn.com/apis/v2/sports/soccer/",
};
const proxy = globalThis.SOCCER_LIVE_CONFIG?.footballProxy?.trim().replace(/\/+$/, "");
const root = (service) => proxy ? proxy + "/" + service + "/" : provider[service];
export const API = root("scores");
export const TABLE_API = root("tables");

export async function fetchJson(url, signal) {
  const timeout = AbortSignal.timeout(12000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (response.status === 502 && response.headers.get("x-soccer-feed-error") === "format") {
    return validateFeed(new URL(url).pathname.split("/").pop(), null);
  }
  if (!response.ok) throw new Error("Feed unavailable");
  const feed = new URL(url).pathname.split("/").pop();
  const data = await response.json().catch(() => null);
  return validateFeed(feed, data);
}

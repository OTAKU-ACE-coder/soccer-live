import catalogue from "../football-catalog.json" with { type: "json" };
import { FeedFormatError, validateFeed } from "../feed-format.js";

const leagues = new Set(catalogue.map(league => league.id));
const athleteID = /^\d{1,12}$/;
const lookupHost = "https://site.web.api.espn.com";
const route = /^\/(scores|tables)\/([a-z0-9][a-z0-9_.]{0,47})\/(scoreboard|standings|summary|teams\/\d{1,12}\/(?:schedule|roster))$/;
const date = /^\d{8}$/;

function upstreamFor(url) {
  if (url.pathname === "/lookup/search") {
    const query = url.searchParams.get("query")?.trim();
    if (!query || query.length < 2 || query.length > 80 || url.searchParams.size !== 1) return null;
    const upstream = new URL("/apis/search/v2", lookupHost);
    upstream.search = new URLSearchParams({ query, type: "player,team", limit: "24" });
    return { upstream, feed: "search" };
  }
  if (url.pathname === "/lookup/player") {
    const id = url.searchParams.get("id");
    if (!athleteID.test(id || "") || url.searchParams.size !== 1) return null;
    const upstream = new URL("/apis/common/v3/sports/soccer/all/athletes/" + id, lookupHost);
    return { upstream, feed: "player" };
  }
  const match = route.exec(url.pathname);
  if (!match) return null;
  const [, service, league, endpoint] = match;
  if (!leagues.has(league) && (endpoint === "scoreboard" || endpoint === "standings")) return null;
  if ((service === "tables") !== (endpoint === "standings")) return null;
  const feed = endpoint.split("/").at(-1);
  const params = url.searchParams;
  const key = { scoreboard: "dates", summary: "event", schedule: "fixture" }[feed];
  const value = key && params.get(key);
  if (params.size > (key ? 1 : 0) || (params.size && !value)) return null;
  if (feed === "scoreboard" && value && !date.test(value)) return null;
  if (feed === "summary" && !/^\d{1,12}$/.test(value || "")) return null;
  if (feed === "schedule" && value && value !== "true") return null;
  const host = service === "tables"
    ? "https://site.api.espn.com/apis/v2/sports/soccer/"
    : "https://site.api.espn.com/apis/site/v2/sports/soccer/";
  const upstream = new URL(league + "/" + endpoint, host);
  if (value) upstream.searchParams.set(key, value);
  return { upstream, feed };
}

function failure(message, status, format = false) {
  return Response.json({ error: message }, { status, headers: {
    "access-control-allow-origin": "*",
    "access-control-expose-headers": "x-soccer-feed-error",
    "cache-control": "no-store",
    ...(format ? { "x-soccer-feed-error": "format" } : {}),
  } });
}

export default {
  async fetch(request, _env, context) {
    if (request.method !== "GET") return failure("Method not allowed", 405);
    const url = new URL(request.url);
    const target = upstreamFor(url);
    if (!target) return failure("Feed not found", 404);
    const cache = globalThis.caches?.default;
    if (target.feed === "search") url.searchParams.set("query", url.searchParams.get("query").trim().toLowerCase());
    const key = new Request(url.toString());
    try {
      const cached = await cache?.match(key);
      if (cached) return cached;
      const response = await fetch(target.upstream, { signal: AbortSignal.timeout(8000), redirect: "manual" });
      if (!response.ok) return failure("Upstream football feed unavailable", 502);
      const data = validateFeed(target.feed, await response.json().catch(() => null));
      const payload = target.feed === "player" ? { athlete: data.athlete } : data;
      const result = Response.json(payload, { headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=30, s-maxage=45",
        "x-content-type-options": "nosniff",
      } });
      if (cache) context.waitUntil(cache.put(key, result.clone()).catch(() => {}));
      return result;
    } catch (error) {
      return error instanceof FeedFormatError
        ? failure(error.message, 502, true)
        : failure("Upstream football feed unavailable", 502);
    }
  },
};

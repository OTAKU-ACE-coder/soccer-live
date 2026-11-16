import catalogue from "../football-catalog.json" with { type: "json" };
import { FeedFormatError, validateFeed } from "../feed-format.js";

const leagues = new Set(catalogue.map(league => league.id));
const route = /^\/(scores|tables)\/([a-z0-9_.]+)\/(scoreboard|standings|summary|teams\/\d{1,12}\/(?:schedule|roster))$/;
const date = /^\d{8}$/;

function upstreamFor(url) {
  const match = route.exec(url.pathname);
  if (!match || !leagues.has(match[2])) return null;
  const [, service, league, endpoint] = match;
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
    const key = new Request(url.toString());
    try {
      const cached = await cache?.match(key);
      if (cached) return cached;
      const response = await fetch(target.upstream, { signal: AbortSignal.timeout(8000), redirect: "manual" });
      if (!response.ok) return failure("Upstream football feed unavailable", 502);
      const data = validateFeed(target.feed, await response.json().catch(() => null));
      const result = Response.json(data, { headers: {
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

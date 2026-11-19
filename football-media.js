const requests = new Map();
const queue = [];
let active = 0;
const key = value => String(value || "").normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clubKey = value => key(value).replace(/^(?:clubdeportivo|clubdesportivo|afc|fc|cf|cd|sc|ud)/, "").replace(/(?:afc|fc|cf)$/, "");
const https = value => {
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; } catch { return ""; }
};
export function birthday(value) {
  const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value || "");
  if (parts) return parts[3] + "-" + parts[2].padStart(2, "0") + "-" + parts[1].padStart(2, "0");
  return /^\d{4}-\d{2}-\d{2}/.exec(value || "")?.[0] || "";
}
export function matchedPortraits(player, candidates) {
  const names = [player.displayName, player.fullName, [player.firstName, player.lastName].filter(Boolean).join(" ")].map(key).filter(Boolean);
  const dob = birthday(player.displayDOB || player.dateOfBirth);
  const club = clubKey(player.team?.displayName);
  const matches = (Array.isArray(candidates) ? candidates : []).filter(candidate =>
    candidate?.strSport === "Soccer" && names.includes(key(candidate.strPlayer)) &&
    (dob ? birthday(candidate.dateBorn) === dob : club && clubKey(candidate.strTeam) === club));
  if (matches.length !== 1) return [];
  return [...new Set([matches[0].strCutout, matches[0].strThumb].map(https).filter(Boolean))];
}
export function matchedBadges(team, candidates) {
  const names = [team.name, team.displayName, team.shortName].map(clubKey).filter(Boolean);
  const matches = (Array.isArray(candidates) ? candidates : []).filter(candidate => candidate?.strSport === "Soccer" &&
    [candidate.strTeam, ...(candidate.strAlternate || "").split(",")].some(name => names.includes(clubKey(name))));
  if (matches.length !== 1) return [];
  return [...new Set([matches[0].strBadge, matches[0].strLogo].map(https).filter(Boolean))];
}
function drain() {
  while (active < 1 && queue.length) {
    const job = queue.shift();
    active++;
    job().finally(() => { active--; setTimeout(drain, 2200); });
  }
}
function lookup(kind, name) {
  const cacheKey = kind + ":" + key(name);
  if (!requests.has(cacheKey)) {
    const request = new Promise(resolve => {
      queue.push(async () => {
        try {
          const parameter = kind === "players" ? "p" : "t";
          const url = "https://www.thesportsdb.com/api/v1/json/123/search" + kind + ".php?" + new URLSearchParams({ [parameter]: name });
          const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
          if (!response.ok) throw Error("Image directory unavailable");
          resolve(await response.json());
        } catch {
          requests.delete(cacheKey);
          resolve({});
        }
      });
      drain();
    });
    requests.set(cacheKey, request);
  }
  return requests.get(cacheKey);
}
export async function additionalPortraits(player) {
  if (!birthday(player.displayDOB || player.dateOfBirth) && !player.team?.displayName) return [];
  const name = player.displayName || player.fullName;
  if (!name) return [];
  const wiki = await wikipediaPortrait(player);
  if (wiki) return [wiki];
  const data = await lookup("players", name);
  return matchedPortraits(player, data.player);
}
export async function additionalClubBadges(team) {
  const name = team.name || team.displayName;
  if (!name) return [];
  const data = await lookup("teams", name);
  return matchedBadges(team, data.teams);
}

export function matchedWikiPortrait(player, pages) {
  const dob = birthday(player.displayDOB || player.dateOfBirth);
  if (!dob) return "";
  const [year, month, day] = dob.split("-").map(Number);
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const born = new RegExp("\\bborn\\s+(?:on\\s+)?" + day + "\\s+" + months[month - 1] + "\\s+" + year + "\\b", "i");
  const names = [player.displayName, player.fullName].map(key).filter(Boolean);
  const matches = (Array.isArray(pages) ? pages : []).filter(page => {
    const text = page.extract || "";
    return /footballer|soccer player/i.test(text) && born.test(text) &&
      names.some(name => key(page.title).startsWith(name)) && https(page.thumbnail?.source);
  });
  return matches.length === 1 ? https(matches[0].thumbnail.source) : "";
}
const wikiRequests = new Map();
export async function wikipediaPortrait(player) {
  const dob = birthday(player.displayDOB || player.dateOfBirth);
  const name = player.displayName || player.fullName;
  if (!dob || !name) return "";
  const cacheKey = name + ":" + dob;
  if (!wikiRequests.has(cacheKey)) {
    const request = (async () => {
      try {
        const params = new URLSearchParams({
          action: "query", generator: "search", gsrsearch: '"' + name + '" footballer "' + dob.slice(0,4) + '"',
          gsrlimit: "3", prop: "pageimages|extracts", piprop: "thumbnail", pithumbsize: "300",
          exintro: "1", explaintext: "1", exlimit: "3", format: "json", origin: "*",
        });
        const response = await fetch("https://en.wikipedia.org/w/api.php?" + params, { signal: AbortSignal.timeout(6500) });
        if (!response.ok) return "";
        const data = await response.json();
        return matchedWikiPortrait(player, Object.values(data.query?.pages || {}));
      } catch { return ""; }
    })();
    wikiRequests.set(cacheKey, request);
  }
  return wikiRequests.get(cacheKey);
}

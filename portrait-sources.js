import { normalize } from "./football-format.js?v=b76234c3ac2c";

export function portraitSource(value) {
  if (typeof value !== "string") return "";
  if (/^assets\/players\/(?:current\/)?[a-z0-9.-]+$/i.test(value)) return value;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : ""; } catch { return ""; }
}
export function portraitCandidates(player, index = {}) {
  const names = [player.fullName, player.displayName, [player.firstName, player.lastName].filter(Boolean).join(" ")].filter(Boolean);
  // Name-based images require a full name. Short names use the identity-checked ID cache.
  const keys = [...new Set(names.filter(name => name.trim().split(/\s+/).length > 1)
    .flatMap(name => {
      const normalized = normalize(name);
      const folded = normalized.replaceAll("ø", "o").replaceAll("æ", "ae").replaceAll("œ", "oe").replaceAll("ł", "l").replaceAll("ß", "ss");
      return [folded, normalized].map(value => value.replace(/[^a-z0-9]/g, ""));
    }))];
  const primary = portraitSource(index.current?.[String(player.id)]) || keys.map(key => portraitSource(index.current?.[key])).find(Boolean);
  const uefa = index.uefa?.[String(player.id)];
  const season = new Date();
  const endYear = season.getUTCFullYear() + Number(season.getUTCMonth() >= 6);
  const uefaRoot = "https://img.uefa.com/imgml/TP/players/";
  const uefaSources = /^\d{1,9}$/.test(uefa || "") ? [
    uefaRoot + "1/" + endYear + "/324x324/" + uefa + ".jpg",
    uefaRoot + "2014/" + (endYear % 2 ? endYear : endYear + 1) + "/324x324/" + uefa + ".jpg",
  ] : [];
  const local = portraitSource(index.local?.[String(player.id)]);
  const code = keys.map(key => index.league?.[key]).find(value => /^\d+$/.test(value || ""));
  return [...new Set([
    primary,
    portraitSource(index.backups?.[primary]),
    ...keys.map(key => portraitSource(index.clubs?.[key])),
    code ? "https://resources.premierleague.com/premierleague/photos/players/250x250/p" + code + ".png" : "",
    local,
    portraitSource(player.headshot?.href || player.headshot?.url),
    /^\d{1,12}$/.test(player.id || "") ? "https://a.espncdn.com/i/headshots/soccer/players/full/" + player.id + ".png" : "",
    ...uefaSources,
  ].filter(Boolean))];
}

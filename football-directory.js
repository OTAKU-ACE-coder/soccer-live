import { playerStatus } from "./player-status.js?v=f32d6faa25e2";
import { normalize } from "./football-format.js?v=f32d6faa25e2";

const identifiers = { team: /(?:^|~)t:(\d{1,12})$/, player: /(?:^|~)a:(\d{1,12})$/ };
const leagueSlug = /^[a-z0-9_.]{1,48}$/;

export function directoryResults(data, query) {
  const countryTournaments = /^(?:fifa\.|caf\.nations|uefa\.(?:nations|euro)|concacaf\.nations|conmebol\.(?:copa|america))/;
  const result = { team: new Map(), player: new Map() };
  for (const group of data.results) {
    if (group.type !== "team" && group.type !== "player") continue;
    const { type } = group;
    for (const item of group.contents) {
      const id = identifiers[type].exec(item?.uid)?.[1];
      const name = item?.displayName;
      if ((item?.sport !== "soccer" && !(item?.sport == null && item?.uid?.startsWith("s:600~"))) || !id || typeof name !== "string" || !name.trim()) continue;
      const competitionId = leagueSlug.test(item.defaultLeagueSlug || "") ? item.defaultLeagueSlug : "";
      result[type].set(id, {
        id, name, competitionId,
        leagueName: typeof item.subtitle === "string" ? item.subtitle : "",
        logo: item.image?.default,
        national: countryTournaments.test(competitionId),
      });
    }
  }
  const fullNameQuery = query.trim().split(/\s+/).length > 1;
  const ordered = (items) => [...items.values()].sort((a, b) =>
    fullNameQuery ? Number(normalize(b.name) === normalize(query)) - Number(normalize(a.name) === normalize(query)) : 0).slice(0, 100);
  return { clubs: ordered(result.team), players: ordered(result.player) };
}

export function profileFacts(player) {
  const status = playerStatus(player);
  return [
    ["Status", status.label],
    [status.kind === "retired" ? "Last listed club" : "Club", player.team?.displayName],
    ["Nationality", player.citizenship],
    ["Age", player.age],
    ["Position", player.position?.displayName || player.position?.name],
    ["Shirt number", player.jersey],
    ["Birthplace", player.displayBirthPlace],
    ["Height", player.displayHeight],
    ["Retired", status.year],
    [status.historical ? "Last reported injury" : "Injury", status.injury],
    ["Availability", status.historical ? "Current availability unconfirmed" : status.availability],
    ["Injury reported", status.reported],
  ].filter(([, value]) => (typeof value === "string" && value.trim()) || (typeof value === "number" && Number.isFinite(value)));
}

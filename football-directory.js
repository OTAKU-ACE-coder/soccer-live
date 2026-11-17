import { normalize } from "./football-format.js?v=deffb300c842";

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
      if (item?.sport !== "soccer" || !id || typeof name !== "string" || !name.trim()) continue;
      const competitionId = leagueSlug.test(item.defaultLeagueSlug || "") ? item.defaultLeagueSlug : "";
      result[type].set(id, {
        id, name, competitionId,
        leagueName: typeof item.subtitle === "string" ? item.subtitle : "",
        logo: item.image?.default,
        national: countryTournaments.test(competitionId),
      });
    }
  }
  const ordered = (items) => [...items.values()].sort((a, b) =>
    Number(normalize(b.name) === normalize(query)) - Number(normalize(a.name) === normalize(query))).slice(0, 12);
  return { clubs: ordered(result.team), players: ordered(result.player) };
}

export function profileFacts(player) {
  return [
    ["Club", player.team?.displayName],
    ["Nationality", player.citizenship],
    ["Age", player.age],
    ["Position", player.position?.displayName || player.position?.name],
    ["Shirt number", player.jersey],
    ["Birthplace", player.displayBirthPlace],
    ["Height", player.displayHeight],
    ["Status", player.status?.name],
  ].filter(([, value]) => (typeof value === "string" && value.trim()) || (typeof value === "number" && Number.isFinite(value)));
}

export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
export const contains = (text, term) => normalize(text).includes(normalize(term));
const names = {
  "Paris Saint-Germain": ["PSG"],
  "Atlético Madrid": ["Atletico Madrid"],
  "Tottenham Hotspur": ["Spurs", "Tottenham"],
  "Manchester United": ["Man Utd", "Man United"],
  "Manchester City": ["Man City"],
  Internazionale: ["Inter Milan"],
  "Bayern Munich": ["FC Bayern München", "Bayern München"],
};

export function aliases(team) {
  return [team.name, team.shortName, ...(names[team.name] || [])].filter(
    Boolean,
  );
}

export function teamMatches(team, text) {
  return aliases(team).some((name) => {
    const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(?:^|[^a-z0-9])" + escaped + "(?:$|[^a-z0-9])").test(
      normalize(text),
    );
  });
}

export function dateLabel(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf())
    ? parsed.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date unavailable";
}
export function localDate(value) {
  return (
    value.getFullYear() +
    "-" +
    String(value.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(value.getDate()).padStart(2, "0")
  );
}

export function competition(event) {
  return event.competitions?.[0];
}
export function opponents(event) {
  const competitors = competition(event)?.competitors || [];
  return ["home", "away"]
    .map((side) => competitors.find((entry) => entry?.homeAway === side && entry.team?.id != null))
    .filter(Boolean);
}
export function asTeam(competitor) {
  const team = competitor.team;
  return {
    id: String(team.id),
    name: team.displayName,
    shortName: team.shortDisplayName,
    abbreviation: team.abbreviation,
    logo: team.logo || team.logos?.[0]?.href,
    url: team.links?.find((link) => link.rel?.includes("clubhouse"))?.href,
  };
}

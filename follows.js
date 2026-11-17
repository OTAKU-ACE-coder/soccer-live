import { readAlertSettings } from "./news-alerts.js?v=b9b75ab61a0e";
import { aliases, normalize } from "./football-format.js?v=b9b75ab61a0e";

export const preferenceKey = "soccer-live-preferences";

export function readPreferences() {
  try {
    const value = JSON.parse(
      localStorage.getItem(preferenceKey) ||
        localStorage.getItem("touchline-preferences") ||
        "{}",
    );
    return {
      following: Array.isArray(value.following)
        ? value.following.filter((v) => typeof v === "string").slice(0, 150)
        : [],
      discoveredClubs: Array.isArray(value.discoveredClubs)
        ? value.discoveredClubs.filter(team => team && /^\d{1,12}$/.test(team.id)
          && typeof team.name === "string" && /^[a-z0-9_.]{1,48}$/.test(team.competitionId)).slice(0, 150)
        : [],
      searches: Array.isArray(value.searches)
        ? value.searches.filter((v) => typeof v === "string").slice(0, 10)
        : [],
      saved: Array.isArray(value.saved)
        ? value.saved
            .filter((v) => v && typeof v.title === "string" && typeof v.id === "string" && Array.isArray(v.paragraphs))
            .slice(0, 100)
        : [],
      alerts: readAlertSettings(value.alerts),
      league: typeof value.league === "string" ? value.league : "eng.1",
    };
  } catch {
    return { following: [], discoveredClubs: [], searches: [], saved: [], league: "eng.1", alerts: readAlertSettings() };
  }
}

export function savePreferences(preferences, onError) {
  try {
    localStorage.setItem(
      preferenceKey,
      JSON.stringify(preferences),
    );
  } catch {
    onError(
      "Your browser could not save this change. It will last for this visit.",
    );
  }
}

export function updateFollowing(following, team, national, active) {
  const next = following.filter(preference => !matchesFollow(team, preference, national));
  if (!active) next.unshift(national ? "national:" + team.id : team.name);
  return next.slice(0, 150);
}

export function matchesFollow(team, preference, national) {
  return national ? preference === "national:" + team.id
    : aliases(team).some(alias => normalize(alias) === normalize(preference));
}

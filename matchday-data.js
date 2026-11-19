import { competition, dateLabel, localDate, opponents } from "./football-format.js?v=a5579f21e051";

const providerCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});

function providerDay(timestamp) {
  const parts = Object.fromEntries(providerCalendar.formatToParts(timestamp).map(part => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

export function providerMatchDates(start, end) {
  const days = [];
  const last = providerDay(end);
  for (let date = providerDay(start); date <= last; date += 86400000) {
    days.push(new Date(date).toISOString().slice(0, 10).replaceAll("-", ""));
  }
  return days;
}

export function matchesForLocalDay(events, selected) {
  return [...new Map(events.filter(event => localDate(new Date(event.date)) === selected)
    .map(event => [String(event.id), event])).values()];
}

export function fixtureState(event) {
  const type = (competition(event)?.status || event.status)?.type;
  if (type?.state === "in") return "live";
  if (type?.completed && type.state === "post") return "final";
  if (type?.state === "pre" && type.name === "STATUS_SCHEDULED") return "upcoming";
  return "other";
}

export function filterMatchday(events, filter, matchesTeam, followsTeam) {
  return events.filter(event => {
    const teams = opponents(event);
    return teams.length === 2 && teams.some(matchesTeam) && (
      filter === "all" ||
      (filter === "following" ? teams.some(followsTeam) : fixtureState(event) === filter)
    );
  }).sort((a,b) => Date.parse(a.date) - Date.parse(b.date));
}

const stamp = value => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = value => String(value ?? "").replace(/\\/g, "\\\\")
  .replace(/\r\n|\r|\n/g, "\\n").replace(/([;,])/g, "\\$1");

function fold(line) {
  const encoder = new TextEncoder();
  let result = "", size = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (size + bytes > 75) { result += "\r\n "; size = 1; }
    result += character;
    size += bytes;
  }
  return result;
}

export function fixtureCalendar(event, competitionId, now = Date.now()) {
  const time = Date.parse(event.date);
  if (fixtureState(event) !== "upcoming" || !Number.isFinite(time) || time <= now) return "";
  const teams = opponents(event);
  if (teams.length !== 2 || !/^\d+$/.test(event.id) || !/^[a-z0-9_.]+$/.test(competitionId)) return "";
  const label = teams.map(item => item.team.displayName).join(" vs ");
  const venue = competition(event)?.venue?.fullName;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Soccer Live//Matchday//EN", "BEGIN:VEVENT",
    "UID:" + competitionId + "-" + event.id + "@soccer-live",
    "DTSTAMP:" + stamp(now), "DTSTART:" + stamp(time), "SUMMARY:" + escape(label),
    ...(venue ? ["LOCATION:" + escape(venue)] : []),
    "DESCRIPTION:" + escape("Kickoff listed by Soccer Live for " + dateLabel(event.date) + ". Check the match centre for schedule changes."),
    "END:VEVENT", "END:VCALENDAR", "",
  ].map(fold).join("\r\n");
}

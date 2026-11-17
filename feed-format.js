export class FeedFormatError extends Error {
  constructor(feed) {
    super("The " + feed + " feed format changed. Try again later.");
    this.name = "FeedFormatError";
  }
}

export function validateFeed(feed, value) {
  const validTable = (table) => table && (
    (Array.isArray(table.standings?.entries) && table.standings.entries.every(entry => entry?.team?.id != null)) ||
    (Array.isArray(table.children) && table.children.every(validTable))
  );
  const events = value?.events;
  const valid = {
    scoreboard: () => Array.isArray(events) && events.every(event =>
      event && event.id != null && Number.isFinite(Date.parse(event.date)) &&
      (!event.competitions || Array.isArray(event.competitions) && event.competitions.every(match =>
        match && (!match.competitors || Array.isArray(match.competitors))))),
    schedule: () => Array.isArray(events),
    standings: () => validTable(value),
    roster: () => Array.isArray(value?.athletes),
    summary: () => Boolean(value?.header && typeof value.header === "object"),
    search: () => Array.isArray(value?.results) && value.results.every(group => Array.isArray(group?.contents)),
    player: () => typeof value?.athlete?.displayName === "string",
  };
  if (!valid[feed]?.()) throw new FeedFormatError(feed);
  return value;
}

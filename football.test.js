import test from "node:test";
import { playerStatus } from "./player-status.js";
import { profileFacts } from "./football-directory.js";
import assert from "node:assert/strict";
import { filterMatchday, fixtureCalendar, matchesForLocalDay, providerMatchDates } from "./matchday-data.js";
import { aliases, dateLabel, localDate, normalize, teamMatches } from "./football-format.js";
import { matchesFollow, updateFollowing } from "./follows.js";
import { recentResults, upcomingFixtures } from "./match-data.js";
import { buildReports } from "./newsroom.js";
import { FeedFormatError, validateFeed } from "./feed-format.js";
import { applyPreferenceChanges, createPreferenceSync, preferenceChanges } from "./preference-sync.js";

const home = { id: "1", displayName: "Atlético Madrid", shortDisplayName: "Atlético" };
const away = { id: "2", displayName: "Paris Saint-Germain" };
const league = { id: "uefa.champions", name: "Champions League" };
const fixture = (id, day, a, b, completed = true) => ({
  id: String(id), date: "2026-11-" + String(day).padStart(2, "0") + "T18:00:00Z",
  competitions: [{ status: { type: { completed, state: completed ? "post" : "pre",
    name: completed ? "STATUS_FULL_TIME" : "STATUS_SCHEDULED" } },
  competitors: [{ homeAway: "home", team: home, score: a }, { homeAway: "away", team: away, score: b }] }],
});

test("format dates by the visitor's calendar and handle unavailable dates", () => {
  const date = new Date(2026, 0, 2, 0, 15);
  assert.equal(localDate(date), "2026-01-02");
  assert.equal(dateLabel(date), new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date));
  assert.equal(dateLabel("invalid"), "Date unavailable");
});

test("normalize diacritics, match aliases on word boundaries, and keep national follows separate", () => {
  const team = { id: "1", name: "Atlético Madrid", shortName: "Atlético" };
  assert.equal(normalize(team.name), "atletico madrid");
  assert.ok(aliases(team).includes("Atletico Madrid"));
  assert.ok(teamMatches(team, "A win for Atletico Madrid!"));
  const psg = { name: "Paris Saint-Germain" };
  assert.ok(teamMatches(psg, "PSG wins"));
  assert.ok(!teamMatches(psg, "XPSG beat Paris FC"));
  assert.ok(matchesFollow(team, "Atletico", false));
  assert.ok(!matchesFollow(team, "Atletico", true));
  assert.deepEqual(updateFollowing(["Atletico", "PSG"], team, false, true), ["PSG"]);
  assert.deepEqual(updateFollowing(["PSG"], team, true, false), ["national:1", "PSG"]);
});

test("limit recent form to the last five completed matches, oldest first", () => {
  const fixtures = [fixture(1, 1, "1", "0"), fixture(2, 2, "0", "1"), fixture(3, 3, "1", "1"),
    fixture(4, 4, { value: 2 }, { value: 0 }), fixture(5, 5, "0", "3"), fixture(6, 6, "2", "0"),
    fixture(7, 7, "0", "0", false), fixture(8, 8, "–", "0")];
  assert.deepEqual(recentResults(fixtures, "1").map(entry => entry.result), ["Loss", "Draw", "Win", "Loss", "Win"]);
  assert.equal(recentResults(fixtures, "1")[2].score, "2–0");
  assert.deepEqual(recentResults(fixtures, "999"), []);
});

test("upcoming fixtures exclude past or finished events and deduplicate event IDs", () => {
  const next = fixture(2, 9, "0", "0", false);
  assert.deepEqual(upcomingFixtures([next, next, fixture(3, 5, "0", "0", false), fixture(4, 10, "2", "0")],
    Date.parse("2026-11-08")), [next]);
});

test("matchday merges adjacent provider dates and filters by local date and fixture status", () => {
  assert.deepEqual(providerMatchDates(Date.parse("2026-11-16T23:00Z"), Date.parse("2026-11-17T22:59Z")), ["20261116", "20261117"]);
  const scheduled = fixture(2, 17, "0", "0", false);
  const finished = fixture(3, 17, "2", "0");
  const local = localDate(new Date(scheduled.date));
  assert.deepEqual(matchesForLocalDay([scheduled, scheduled, fixture(4, 16, "0", "0")], local), [scheduled]);
  assert.deepEqual(filterMatchday([finished, scheduled], "upcoming", () => true, () => false), [scheduled]);
  assert.deepEqual(filterMatchday([finished, scheduled], "following", () => true, () => false), []);
  assert.deepEqual(filterMatchday([finished, scheduled], "final", () => true, () => false), [finished]);
});

test("calendar exports UTC kickoff and escapes and folds fixture text", () => {
  const scheduled = fixture(2, 17, "0", "0", false);
  scheduled.competitions[0].venue = { fullName: "Á".repeat(80) + ", South Stand; Gate B\nEntrance" };
  const calendar = fixtureCalendar(scheduled, "uefa.nations", Date.parse("2026-11-17T10:00Z"));
  assert.match(calendar, /DTSTART:20261117T180000Z/);
  assert.ok(calendar.replace(/\r\n /g, "").includes("\\, South Stand\\; Gate B\\nEntrance"));
  assert.ok(calendar.split("\r\n").every(line => new TextEncoder().encode(line).length <= 75));
  assert.equal(fixtureCalendar(scheduled, "uefa.nations", Date.parse("2026-11-17T19:00Z")), "");
  assert.equal(fixtureCalendar(fixture(3, 18, "2", "0"), "uefa.nations", Date.parse("2026-11-17T10:00Z")), "");
});

test("reports use verified final scores and deduplicate while skipping incomplete provider events", () => {
  const match = fixture(3, 4, "2", "0");
  const [report] = buildReports([match, match, fixture(4, 5, "0", "0", false), { id: "5", status: match.competitions[0].status }], league);
  assert.equal(buildReports([match, match], league).length, 1);
  assert.equal(report.id, "uefa.champions~20261104~3");
  assert.equal(report.title, "Atlético Madrid 2–0 Paris Saint-Germain");
  assert.match(report.summary, /^Atlético Madrid won/);
  assert.match(report.paragraphs[0], /Atlético Madrid 2, Paris Saint-Germain 0/);
  assert.match(buildReports([fixture(8, 6, "1", "1")], league)[0].summary, /finished level/);
});

test("feed validation distinguishes genuinely empty feeds from unexpected schemas", () => {
  assert.deepEqual(validateFeed("scoreboard", { events: [] }), { events: [] });
  assert.deepEqual(validateFeed("standings", { children: [{ standings: { entries: [] } }] }),
    { children: [{ standings: { entries: [] } }] });
  assert.throws(() => validateFeed("scoreboard", { matches: [] }), FeedFormatError);
  assert.throws(() => validateFeed("standings", { children: [{ standings: { entries: [{ stats: [] }] } }] }), FeedFormatError);
});

test("sync merges specific follow and save edits without dropping other-device items", () => {
  const changes = preferenceChanges("following", ["Arsenal"], ["Chelsea"]);
  const article = { id: "story-1", title: "A headline", paragraphs: [] };
  const saves = preferenceChanges("saved", [], [article]);
  assert.deepEqual(applyPreferenceChanges({ following: ["Arsenal", "Liverpool"], saved: [] }, [...changes, ...saves]),
    { following: ["Chelsea", "Liverpool"], saved: [article] });
});

test("account sync retries concurrent updates and stores a separate snapshot per account", async () => {
  const persisted = new Map();
  let view, status, updates = 0;
  const rows = new Map([["a", { follows: ["Arsenal"], saved: [], revision: 0 }]]);
  const client = { from() {
    const filters = {};
    let patch;
    return {
      select() { return this; },
      eq(field, value) { filters[field] = value; return this; },
      async insert(value) { rows.set(value.user_id, { ...value, revision: 0 }); return {}; },
      update(value) { patch = value; return this; },
      async maybeSingle() {
        const row = rows.get(filters.user_id);
        if (!patch) return { data: row || null };
        if (++updates === 1) {
          rows.set("a", { follows: ["Liverpool", ...row.follows], saved: [], revision: 1 });
          return { data: null };
        }
        assert.equal(filters.revision, row.revision);
        rows.set(filters.user_id, { ...row, ...patch });
        return { data: { revision: patch.revision } };
      },
    };
  } };
  const sync = createPreferenceSync({ storage: () => ({ getItem: key => persisted.get(key), setItem: (key, v) => persisted.set(key,v) }),
    apply: value => { view = value; }, status: value => { status = value; } });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  sync.connect(client, "a", { following: ["Guest"] });
  await settle();
  assert.deepEqual(view.following, ["Arsenal"]);
  sync.record("following", ["Arsenal"], ["Chelsea"]);
  await settle();
  assert.equal(status, "Follows and saved stories synced.");
  assert.deepEqual(rows.get("a").follows, ["Chelsea", "Liverpool"]);
  sync.disconnect();
  sync.connect(client, "b", { following: ["Guest"] });
  await settle();
  assert.deepEqual(view.following, ["Guest"]);
  assert.deepEqual(rows.get("a").follows, ["Chelsea", "Liverpool"]);
});

test("confirmed retirement overrides stale provider status without guessing for an inactive player", () => {
  const retired = { id: "103173", active: true, status: { name: "Active" }, team: { displayName: "Real Madrid" } };
  assert.equal(playerStatus(retired).label, "Retired");
  const facts = Object.fromEntries(profileFacts(retired));
  assert.equal(facts["Last listed club"], "Real Madrid");
  assert.equal(facts.Status, "Retired");
  assert.equal(facts.Retired, 2024);
  assert.equal(playerStatus({ id: "unknown", active: false }).kind, "unconfirmed");
  assert.equal(playerStatus({ id: "unknown", active: true }).label, "Playing");
  assert.equal(playerStatus({ id: "210397", displayName: "Nicolas Pépé" }).kind, "unconfirmed");
  assert.equal(playerStatus({ id: "unknown", status: { type: "retired" } }).label, "Retired");
});

test("injury reports include the diagnosis and expire their current availability label", () => {
  const player = { id: "236721", active: true };
  const current = playerStatus(player, Date.parse("2026-11-19T12:00:00Z"));
  assert.equal(current.label, "Injured");
  assert.match(current.injury, /left hamstring/);
  assert.equal(current.reported, "2026-11-16");
  assert.match(current.url, /fcbayern\.com/);
  const old = playerStatus(player, Date.parse("2026-12-10T12:00:00Z"));
  assert.equal(old.label, "Injury update needed");
  assert.ok(old.historical);
  assert.equal(playerStatus({ active: true, injuries: [{ status: "Out", description: "Ankle injury" }] }).label, "Injured");
  assert.equal(playerStatus({ active: true, injuries: [{ status: "Recovered", description: "Ankle injury" }] }).label, "Playing");
});

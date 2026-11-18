import { cataloguePortraits } from "./player-photos.js?v=3b9ff4909e27";
import { competitionMark } from "./competition-marks.js?v=3b9ff4909e27";
import { buildReports, editorialStories } from "./newsroom.js?v=3b9ff4909e27";
import { collectAlerts, followsInterest } from "./news-alerts.js?v=3b9ff4909e27";
import { upcomingFixtures } from "./match-data.js?v=3b9ff4909e27";
import { getTheme, getThemeColors, setTheme, setThemeColors } from "./theme.js?v=3b9ff4909e27";
import { directoryResults, profileFacts } from "./football-directory.js?v=3b9ff4909e27";
import { API, TABLE_API, fetchJson, getPlayerProfile, searchFootball } from "./api.js?v=3b9ff4909e27";
import { FeedFormatError } from "./feed-format.js?v=3b9ff4909e27";
import { aliases, asTeam, competition, contains, dateLabel, localDate, normalize, opponents, teamMatches } from "./football-format.js?v=3b9ff4909e27";
import { clubCrests, crest, crestSource, empty, materialIcon, node, safeUrl } from "./render.js?v=3b9ff4909e27";
import { matchesFollow, preferenceKey, readPreferences, savePreferences as storePreferences, updateFollowing } from "./follows.js?v=3b9ff4909e27";
import { createStandings, entriesOf, hasStandings } from "./standings.js?v=3b9ff4909e27";
import { createAlerts } from "./alerts.js?v=3b9ff4909e27";
import { createMatchday } from "./matchday.js?v=3b9ff4909e27";
import { fixtureCalendar } from "./matchday-data.js?v=3b9ff4909e27";
import { createPreferenceSync } from "./preference-sync.js?v=3b9ff4909e27";

const $ = (id) => document.getElementById(id);
const routes = ["home", "matches", "matchday", "news", "standings", "clubs", "saved", "alerts", "settings"];
const titles = {
  home: "Your football, all in one place.",
  search: "Search results",
  matches: "Every match. Every moment.",
  matchday: "The day in football.",
  news: "The stories behind the game.",
  standings: "The race for the top.",
  clubs: "Follow the badge.",
  saved: "Your football reading list.",
  alerts: "Your football notifications.",
  settings: "Make Soccer Live yours.",
};
const preferences = readPreferences();
let catalog = [],
  allTeams = [],
  events = [],
  stories = [],
  groups = [];
let league, controller, dialogOpener, toastTimer;
let view = "home",
  query = "",
  filter = "all",
  sort = "personal",
  date = "";
let generation = 0,
  newsLimit = 8;
let errors = {};
let requestedStory = "";
let selectedMatchReports = [];
let archivedReport;
const reportFeeds = new Map();
const nationalTeamIds = new Set();
const loadedNewsDates = new Map();
let checkingNews = false;
let lookupController;
let directoryClubs = [];
let directoryState = "";

function toast(message) {
  clearTimeout(toastTimer);
  $("announcement").textContent = message;
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
    $("announcement").textContent = "";
  }, 3500);
}
function savePreferences() {
  const { following, saved } = accountSync.isConnected() ? readPreferences() : preferences;
  storePreferences({ ...preferences, following, saved }, toast);
}

function follows(team) {
  return preferences.following.some(preference => matchesFollow(team, preference, team.national || nationalTeamIds.has(team.id)));
}

function renderLeagues() {
  $("league-strip").replaceChildren();
  $("competition-select").replaceChildren();
  $("competition-picker-mark").replaceChildren(competitionMark(league));
  for (const [label, international] of [["Club competitions", false], ["International", true]]) {
    const heading = node("p", label, "competition-heading");
    const buttons = node("div", undefined, "competition-chips");
    buttons.setAttribute("role", "group");
    buttons.setAttribute("aria-label", label);
    const options = node("optgroup");
    options.label = label;
    for (const item of catalog.filter(entry => Boolean(entry.international) === international)) {
      const button = node("button", undefined, "league-chip");
      button.type = "button";
      button.dataset.competition = item.id;
      button.setAttribute("aria-pressed", String(item.id === league.id));
      button.append(competitionMark(item), node("span", item.name));
      button.addEventListener("click", () => selectCompetition(item.id));
      const option = node("option", item.name);
      option.value = item.id;
      option.selected = league.id === item.id;
      options.append(option);
      buttons.append(button);
    }
    $("competition-select").append(options);
    $("league-strip").append(heading, buttons);
  }
}
function selectCompetition(id) {
  const selected = catalog.find(item => item.id === id);
  if (!selected || league.id === id) return;
  league = selected;
  preferences.league = selected.id;
  savePreferences();
  for (const button of $("league-strip").querySelectorAll("[data-competition]")) {
    button.setAttribute("aria-pressed", String(button.dataset.competition === league.id));
  }
  $("competition-select").value = league.id;
  $("competition-picker-mark").replaceChildren(competitionMark(league));
  const url = new URL(location.href);
  if (url.searchParams.has("competition")) {
    url.searchParams.set("competition", league.id);
    history.replaceState(null, "", url);
  }
  renderClubs();
  loadData();
}
$("competition-select").addEventListener("change", event => selectCompetition(event.target.value));

function toggleFollow(team) {
  const active = follows(team);
  const previous = preferences.following;
  if (team.national) nationalTeamIds.add(team.id);
  if (team.competitionId && !allTeams.some(item => item.id === team.id)) allTeams.push(team);
  preferences.following = updateFollowing(previous, team, nationalTeamIds.has(team.id), active);
  preferences.discoveredClubs = allTeams.filter(item => item.competitionId && follows(item));
  accountSync.record("following", previous, preferences.following);
  savePreferences();
  renderFollowing();
  renderClubs();
  renderMatches();
  renderNews();
  toast((active ? "Unfollowed " : "Following ") + team.name);
}
function followButton(team) {
  const active = follows(team);
  const button = node(
    "button",
    active ? "✓ Following" : (team.national || nationalTeamIds.has(team.id)) ? "＋ Follow team" : "＋ Follow club",
    "follow-button",
  );
  button.type = "button";
  button.dataset.teamId = team.id;
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute(
    "aria-label",
    (active ? "Unfollow " : "Follow ") + team.name,
  );
  button.addEventListener("click", () => {
    toggleFollow(team);
    if ($("detail-dialog").open) openClub(team, false);
    else
      [...document.querySelectorAll("#club-grid .follow-button")]
        .find(button => button.dataset.teamId === team.id)
        ?.focus({ preventScroll: true });
  });
  return button;
}
function renderFollowing() {
  const selected = allTeams.filter(follows);
  $("sidebar-clubs").replaceChildren();
  $("following-cards").replaceChildren();
  if (!selected.length) {
    $("sidebar-clubs").append(
      node("p", "Your favourite badges belong here.", "sidebar-empty"),
    );
    $("following-cards").append(
      empty(
        "Make this your matchday",
        "Follow clubs to personalise your news and match filters.",
        "Discover clubs →",
        "#clubs",
      ),
    );
  }
  for (const team of selected.slice(0, 6)) {
    const button = node("button", undefined, "sidebar-club");
    button.type = "button";
    button.append(crest(team), node("span", team.shortName || team.name));
    button.addEventListener("click", () => openClub(team));
    $("sidebar-clubs").append(button);
  }
  for (const team of selected.slice(0, 4)) {
    const button = node("button", undefined, "following-card");
    button.type = "button";
    const label = node("span");
    label.append(
      node("strong", team.shortName || team.name),
      node("small", "Club profile & stories"),
    );
    button.append(crest(team), label);
    button.addEventListener("click", () => openClub(team));
    $("following-cards").append(button);
  }
  $("saved-count").textContent = preferences.saved.length;
}
function renderClubs() {
  const list = $("club-grid");
  list.replaceChildren();
  const onlyFollowed = $("followed-only").checked;
  const matching = query ? allTeams.filter(teamMatchesQuery)
    : onlyFollowed ? allTeams : league.teams;
  const teamsById = new Map(matching.map(team => [team.id, team]));
  if (query) for (const team of directoryClubs) {
    if (!teamsById.has(team.id)) teamsById.set(team.id, allTeams.find(known => known.id === team.id) || team);
  }
  const teams = [...teamsById.values()].filter(team => !onlyFollowed || follows(team))
    .sort(
      (a, b) =>
        Number(follows(b)) - Number(follows(a)) || a.name.localeCompare(b.name),
    );
  $("club-status").textContent =
    teams.length +
    (query || $("followed-only").checked || league.international ? " teams · " : " clubs · ") +
    (query || $("followed-only").checked
      ? "Across all competitions"
      : league.name) + (query && directoryState ? " · " + directoryState : "");
  for (const team of teams) {
    const card = node("article", undefined, "club-card");
    const profile = node("button", undefined, "club-profile-button");
    profile.type = "button";
    profile.setAttribute("aria-label", "Open " + team.name + " profile");
    profile.append(crest(team), node("strong", team.name));
    profile.addEventListener("click", () => openClub(team));
    card.append(
      profile,
      node("small", team.leagueName || league.name),
      followButton(team),
    );
    list.append(card);
  }
  if (!teams.length && directoryState !== "Searching wider directory…")
    list.append(empty("No teams found", onlyFollowed ? "Turn off Following only to see more clubs." : "Try the full club name or a common abbreviation."));
}
async function lookupFootball(term) {
  lookupController?.abort();
  directoryClubs = [];
  directoryState = "";
  $("player-search-grid").replaceChildren();
  $("player-search-status").textContent = "";
  if (term.length < 2) {
    if (term) $("player-search-status").textContent = "Enter at least two characters to find players.";
    if (league) renderClubs();
    return;
  }
  directoryState = "Searching wider directory…";
  $("player-search-status").textContent = "Searching for players…";
  if (league) renderClubs();
  const request = new AbortController();
  lookupController = request;
  try {
    const results = directoryResults(await searchFootball(term, request.signal), term);
    if (request.signal.aborted) return;
    directoryClubs = results.clubs;
    directoryState = "";
    $("player-search-status").textContent = results.players.length
      ? results.players.length + " player" + (results.players.length === 1 ? "" : "s") + " found"
      : "No players found. Try the player’s full name.";
    const index = results.players.length ? await portraitIndex() : null;
    if (request.signal.aborted) return;
    for (const [position, player] of results.players.entries()) {
      const card = playerCard({
        id: player.id,
        displayName: player.name,
        headshot: player.logo ? { href: player.logo } : undefined,
        prioritizePhoto: position < 4,
      }, index);
      card.querySelector("small").textContent = player.leagueName || "View player profile";
      $("player-search-grid").append(card);
    }
  } catch {
    if (request.signal.aborted) return;
    directoryState = "Wider directory unavailable";
    $("player-search-status").textContent = "Player search is temporarily unavailable. Submit your search to retry.";
  }
  if (league) renderClubs();
}

function teamMatchesQuery(team) {
  return aliases(team).some(name => contains(name, query));
}

function matchVisible(event) {
  const teams = opponents(event).map(asTeam);
  const status = competition(event)?.status || event.status;
  return (
    (!query || teams.some(teamMatchesQuery)) &&
    (filter !== "live" || status?.type?.state === "in") &&
    (filter !== "following" || teams.some(follows))
  );
}
function matchRow(event, competitionId = league.id) {
  const status = competition(event).status || event.status;
  const row = node(
    "button",
    undefined,
    "match-row" + (status?.type?.state === "in" ? " is-live" : ""),
  );
  row.type = "button";
  row.setAttribute("aria-label", "Match details for " + event.name);
  const state = status?.type?.state;
  const time = new Date(event.date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  row.append(
    node(
      "span",
      state === "pre" ? time : status?.type?.shortDetail || "Update pending",
      "match-state",
    ),
  );
  const teamList = node("span", undefined, "match-teams");
  for (const team of opponents(event)) {
    const label = node("span", undefined, "match-team");
    label.append(
      crest(asTeam(team)),
      node("span", team.team.shortDisplayName || team.team.displayName),
      node("strong", state === "pre" ? "–" : String(team.score ?? "–")),
    );
    teamList.append(label);
  }
  row.append(teamList, materialIcon("arrow_forward"));
  row.addEventListener("click", () => openMatch(event, event.league?.slug || competitionId));
  return row;
}
function renderMatches() {
  if (view === "search" && query) {
    const found = events.filter(event => opponents(event).map(asTeam).some(teamMatchesQuery)).slice(0, 8);
    $("search-matches").hidden = found.length === 0;
    $("search-match-items").replaceChildren(...found.map(event => matchRow(event)));
  }
  matchday.render();
  $("scores").replaceChildren();
  const visible = events.filter(matchVisible);
  $("live-count").textContent = events.filter(
    (event) =>
      (competition(event)?.status || event.status)?.type?.state === "in",
  ).length;
  const limited = view === "home" && !query ? visible.slice(0, 6) : visible;
  let lastDate;
  for (const event of limited) {
    const label = dateLabel(event.date);
    if (label !== lastDate) {
      const group = node("div", undefined, "match-group-heading");
      group.append(
        competitionMark(league),
        node("span", league.name + " · " + label),
      );
      $("scores").append(group);
      lastDate = label;
    }
    $("scores").append(matchRow(event));
  }
  if (!visible.length && !$("refresh").disabled) {
    const message = errors.scores
      ? errors.scores
      : filter === "live"
        ? "There are no live matches in this competition for the selected date."
        : filter === "following"
          ? "No matches from your followed clubs in this selection."
          : query
            ? "Try another club name or clear your search."
            : "Choose another date or Latest matchday.";
    $("scores").append(
      empty(
        errors.scores ? "Scores unavailable" : "No matches in this selection",
        message,
      ),
    );
  }
  $("all-matches-link").hidden = view !== "home" || Boolean(query);
}
function storyMatches(story) {
  return (
    !query ||
    contains(story.title, query) ||
    (story.teams || []).some((team) => contains(team.name, query)) ||
    allTeams.some(
      (team) =>
        aliases(team).some((name) => contains(name, query)) &&
        teamMatches(team, story.title),
    )
  );
}
function relevance(story) {
  const followed = allTeams
    .filter(follows)
    .filter(
      (team) =>
        (story.teams || []).some((item) => String(item.id) === team.id) ||
        teamMatches(team, story.title),
    ).length;
  return (
    followed * 12 + (followsInterest(story, preferences.alerts.interests) ? 8 : 0) +
    preferences.searches.reduce(
      (score, term, index) =>
        score + (contains(story.title, term) ? Math.max(1, 5 - index) : 0),
      0,
    )
  );
}
function toggleSaved(story) {
  const previous = preferences.saved;
  const active = previous.some((item) => item.id === story.id);
  preferences.saved = active
    ? preferences.saved.filter((item) => item.id !== story.id)
    : [story, ...preferences.saved].slice(0, 100);
  accountSync.record("saved", previous, preferences.saved);
  savePreferences();
  renderNews();
  renderSaved();
  renderFollowing();
  if (requestedStory) { renderArticle(); $("article").querySelector(".save-button")?.focus({ preventScroll: true }); }
  toast(
    active
      ? "Story removed from your reading list"
      : "Story saved to your reading list",
  );
  [...document.querySelectorAll(".save-button")]
    .find(
      (button) =>
        button.dataset.story === story.id && !button.closest("[hidden]"),
    )
    ?.focus({ preventScroll: true });
}

function storyLink(story, text, className) {
  const link = node("a", text, className);
  link.href = "#story=" + encodeURIComponent(story.id);
  link.addEventListener("click", () => {
    if ($("detail-dialog").open) $("detail-dialog").close();
  });
  return link;
}

function saveButton(story) {
  const active = preferences.saved.some((item) => item.id === story.id);
  const button = node("button", undefined, "save-button");
  button.append(materialIcon("bookmark"), node("span", active ? "Saved" : "Save"));
  button.type = "button";
  button.dataset.story = story.id;
  button.setAttribute("aria-pressed", String(active));
  button.setAttribute("aria-label", (active ? "Unsave " : "Save ") + story.title);
  button.addEventListener("click", () => toggleSaved(story));
  return button;
}

function storyImage(story) {
  const visual = node("div", undefined, "story-visual");
  const image = node("img", undefined, "story-image");
  image.src = "assets/stadium.jpg";
  image.alt = "";
  image.loading = "lazy";
  visual.append(image);
  if (story.teams?.length === 2) {
    const badges = node("div", undefined, "story-badges");
    badges.append(crest(story.teams[0]), node("span", story.score), crest(story.teams[1]));
    visual.append(badges);
  }
  return visual;
}

function storyMeta(story) {
  const meta = node("div", undefined, "story-meta");
  meta.append(node("span", story.category, "story-source"));
  if (story.published) meta.append(node("time", dateLabel(story.published)));
  return meta;
}

function storyCard(story, featured = false) {
  const card = node("article", undefined, featured ? "story news-lead" : "story");
  const media = storyLink(story);
  media.setAttribute("aria-label", "Read " + story.title);
  media.append(storyImage(story));
  const body = node("div", undefined, "story-body");
  const title = node("h3");
  title.append(storyLink(story, story.title));
  const actions = node("div", undefined, "story-actions");
  actions.append(storyLink(story, "Read article →"), saveButton(story));
  body.append(storyMeta(story), title, node("p", story.summary, "story-deck"), actions);
  card.append(media, body);
  return card;
}

function renderNews() {
  if (view === "search" && query) {
    const found = stories.filter(storyMatches).slice(0, 8);
    $("search-stories").hidden = found.length === 0;
    $("search-story-items").replaceChildren(...found.map(story => storyLink(story, story.title, "dialog-story")));
  }
  const visible = stories.filter(storyMatches).filter(storyInScope).sort((a, b) =>
    (sort === "personal" ? relevance(b) - relevance(a) : 0) ||
    (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
  const desk = $("stories");
  desk.replaceChildren();
  if (!visible.length) {
    desk.append(empty("No articles found", "Try another coverage filter or clear your search."));
  } else {
    const lead = storyCard(visible[0], true);
    const rail = node("aside", undefined, "news-latest");
    rail.append(node("h3", "Latest in football"));
    const latest = [...visible].sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0));
    for (const story of latest.filter(story => story.id !== visible[0].id).slice(0, 5)) {
      const item = node("div", undefined, "latest-item");
      item.append(storyMeta(story), storyLink(story, story.title));
      rail.append(item);
    }
    const more = node("div", undefined, "story-grid news-more");
    more.append(...visible.slice(1, newsLimit).map(story => storyCard(story)));
    desk.append(lead, rail, more);
  }
  $("news-status").textContent = sort === "personal"
    ? "Match reports and analysis, prioritised for your clubs and searches."
    : "Match reports and analysis, newest first.";
  $("more-news").hidden = visible.length <= newsLimit;
}

function renderArticle() {
  const article = $("article");
  article.replaceChildren();
  const story = [...stories, ...editorialStories, ...preferences.saved, ...preferences.alerts.inbox.map(item => item.story), archivedReport]
    .find(item => item?.id === requestedStory);
  const back = node("a", "← Back to newsroom", "article-back");
  back.href = "#news";
  article.append(back);
  if (!story) {
    article.append(empty("Article unavailable", "This match report may no longer be in the current feed.", "Browse the newsroom →", "#news"));
    return;
  }
  const heading = node("header", undefined, "article-heading");
  heading.append(storyMeta(story), node("h1", story.title), node("p", story.summary, "article-deck"));
  const byline = node("div", undefined, "article-byline");
  byline.append(node("span", story.score ? "Soccer Live Match Desk" : "Soccer Live Editorial"), saveButton(story));
  heading.append(byline);
  const body = node("div", undefined, "article-body");
  for (const paragraph of story.paragraphs) body.append(node("p", paragraph));
  if (story.score) body.append(node("p", "Match report generated from recorded scores and available match statistics.", "article-note"));
  if (story.credit) body.append(node("p", story.credit, "article-note"));
  if (story.matchday) {
    const link = node("a", "View scores and fixtures in Matchday →", "section-link");
    link.href = "#matchday";
    body.append(link);
  }
  article.append(heading, storyImage(story), body);
}
function renderSaved() {
  const saved = preferences.saved.filter(
    (story) => !query || contains(story.title, query),
  );
  $("saved-stories").replaceChildren(...saved.map(storyCard));
  if (!saved.length)
    $("saved-stories").append(
      empty(
        "Keep the stories that matter",
        "Use Save on a news card to add it to your reading list.",
        "Browse the newsroom →",
        "#news",
      ),
    );
}
function showDialog(content, focus = true) {
  if (!$("detail-dialog").open) dialogOpener = document.activeElement;
  $("detail-content").replaceChildren(content);
  if (!$("detail-dialog").open) $("detail-dialog").showModal();
  if (focus) $("close-dialog").focus();
}
function openMatch(event, competitionId = league.id) {
  const data = competition(event),
    status = data.status || event.status,
    teams = opponents(event);
  const content = node("div"),
    title = node("h2", catalog.find(item => item.id === competitionId)?.name || event.league?.name || league.name);
  title.id = "detail-title";
  content.append(
    title,
    node(
      "p",
      dateLabel(event.date) +
        " · " +
        new Date(event.date).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      "dialog-meta",
    ),
  );
  const scoreboard = node("div", undefined, "dialog-teams");
  teams.forEach((team, index) => {
    if (index === 1)
      scoreboard.append(
        node(
          "div",
          status?.type?.state === "pre"
            ? "VS"
            : teams.map((t) => t.score ?? "–").join(" : "),
          "dialog-score",
        ),
      );
    const side = node("div", undefined, "dialog-team");
    side.append(crest(asTeam(team)), node("strong", team.team.displayName));
    scoreboard.append(side);
  });
  content.append(
    scoreboard,
    node("p", status?.type?.description || "Status unavailable", "dialog-meta"),
  );
  if (data.venue?.fullName)
    content.append(node("p", data.venue.fullName, "dialog-meta"));
  const calendar = fixtureCalendar(event, competitionId);
  if (calendar) {
    const button = node("button", "Add kickoff to calendar", "load-more fixture-calendar");
    button.type = "button";
    button.addEventListener("click", () => {
      const link = node("a");
      link.href = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
      link.download = "soccer-live-" + event.id + ".ics";
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });
    content.append(button);
  }
  addLineupSection(content, event, competitionId);
  content.append(node("h3", "Match statistics", "dialog-subheading"));
  let hasStats = false;
  for (const [key, label] of [
    ["possessionPct", "Possession %"],
    ["totalShots", "Shots"],
    ["shotsOnTarget", "Shots on target"],
    ["wonCorners", "Corners"],
    ["foulsCommitted", "Fouls committed"],
  ]) {
    const values = teams.map(
      (team) =>
        team.statistics?.find((item) => item.name === key)?.displayValue,
    );
    if (values.every((value) => value === undefined)) continue;
    hasStats = true;
    const row = node("div", undefined, "dialog-stat");
    row.append(
      node("strong", values[0] ?? "–"),
      node("span", label),
      node("strong", values[1] ?? "–"),
    );
    content.append(row);
  }
  if (!hasStats)
    content.append(
      node("p", "Statistics are not available for this match yet.", "subtle"),
    );
  showDialog(content);
}
function openClub(team, focus = true) {
  const content = node("div"),
    heading = node("div", undefined, "club-dialog-heading"),
    label = node("div");
  const title = node("h2", team.name);
  title.id = "detail-title";
  label.append(title, node("p", team.leagueName || "Club profile", "subtle"));
  heading.append(crest(team), label);
  content.append(
    heading,
    followButton(team),
  );
  addClubSections(content, team);
  content.append(node("h3", "Related stories", "dialog-subheading"));
  const related = stories
    .filter(
      (story) =>
        (story.teams || []).some((item) => String(item.id) === team.id) ||
        teamMatches(team, story.title),
    )
    .slice(0, 4);
  related.forEach((story) =>
    content.append(storyLink(story, story.title, "dialog-story")),
  );
  if (!related.length)
    content.append(node("p", "No related stories in this feed yet.", "subtle"));
  showDialog(content, focus);
}
function setRoute() {
  const requested = location.hash.slice(1);
  const params = new URLSearchParams(requested);
  requestedStory = params.get("story") || "";
  const searching = !requestedStory && (requested === "search" || params.has("search"));
  view = searching ? "search" : requestedStory ? "article" : routes.includes(requested) ? requested : "home";
  const term = searching ? (params.get("search") || "").trim().slice(0, 80) : "";
  if (term !== query) {
    query = term;
    void lookupFootball(query);
  }
  $("search").value = query;
  $("clear-search").hidden = !query;
  $("search-status").hidden = !searching;
  $("search-status").textContent = query ? "Results for “" + query + "”" : "Enter a club, player, match, or story to search.";
  $("article").hidden = !requestedStory;
  $("player-results").hidden = !searching || !query;
  $("search-matches").hidden = true;
  $("search-stories").hidden = true;
  $("league-strip").hidden = searching || Boolean(requestedStory) || ["settings", "matchday"].includes(view);
  $("competition-picker").hidden = $("league-strip").hidden;
  if (requestedStory) renderArticle();
  document.body.dataset.view = view;
  $("page-title").textContent = titles[view] || "Soccer Live newsroom";
  $("welcome").hidden = view !== "home" || Boolean(query);
  if ($("welcome").hidden) $("messi-highlight").pause();
  $("right-rail").hidden = view !== "home" || Boolean(query);
  for (const section of routes.filter(route => route !== "home")) {
    $(section).hidden = searching ? section !== "clubs" || !query
      : view === "home" ? !["matches", "news"].includes(section) : section !== view;
  }
  document.querySelectorAll(".main-nav a,.mobile-nav a").forEach((link) => {
    const destination = view === "matchday" && link.closest(".mobile-nav") ? "matches" : view;
    if (link.hash === "#" + (requestedStory ? "news" : destination)) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (league) {
    renderClubs();
    matchday.setActive(view === "matchday");
    renderMatches();
    renderNews();
    renderSaved();
    renderAlerts();
    if (view === "standings" && groups.length) loadForms();
  }
}
async function loadData() {
  const token = ++generation;
  controller?.abort();
  controller = new AbortController();
  const request = controller;
  $("refresh").disabled = true;
  events = [];
  groups = [];
  selectedMatchReports = [];
  stories = combinedStories();
  errors = {};
  $("scores").replaceChildren();
  $("tables").replaceChildren();
  $("table-season").textContent = "";
  $("form-status").textContent = "";
  $("stories").replaceChildren();
  $("mini-table").replaceChildren(node("p", "Loading table…", "subtle"));
  $("score-status").textContent = "Loading " + league.name + " matches…";
  $("news-status").textContent = "Loading the latest stories…";
  $("table-status").textContent = "Loading standings…";
  const suffix = date ? "?dates=" + date.replaceAll("-", "") : "";
  const results = await Promise.allSettled([
    date === "upcoming" ? loadUpcoming(league.id, request.signal) : fetchJson(API + league.id + "/scoreboard" + suffix, request.signal),
    !hasStandings(league) ? Promise.resolve(null) : fetchJson(TABLE_API + league.id + "/standings", request.signal),
    date ? fetchJson(API + league.id + "/scoreboard", request.signal) : Promise.resolve(null),
  ]);
  if (token !== generation) return;
  if (results[0].status === "fulfilled")
    events = (results[0].value.events || [])
      .filter((event) => opponents(event).length === 2)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  else errors.scores = results[0].reason instanceof FeedFormatError
    ? results[0].reason.message : "Scores unavailable. Use Refresh to try again.";
  errors.partialFixtures = results[0].value?.partial;
  if (results[1].status === "fulfilled" && results[1].value) {
    groups = entriesOf(results[1].value);
    $("table-season").textContent = results[1].value.season?.displayName || "";
  } else if (hasStandings(league)) {
    errors.table = results[1].reason instanceof FeedFormatError
      ? results[1].reason.message : "Could not update the table. Use Refresh to retry.";
  }

  const latestEvents = results[2].status === "fulfilled" ? results[2].value?.events : [];
  if (latestEvents?.length || (!date && !errors.scores)) {
    mergeReports(league.id, buildReports(latestEvents || events, league));
  }
  selectedMatchReports = date ? buildReports(events, league) : [];
  stories = combinedStories();
  const articleId = requestedStory;
  if (articleId && !stories.some(story => story.id === articleId) && archivedReport?.id !== articleId) {
    const report = /^(.*)~(\d{8})~(\d+)$/.exec(articleId);
    const reportLeague = report && catalog.find(item => item.id === report[1]);
    if (reportLeague) {
      try {
        const archive = await fetchJson(API + reportLeague.id + "/scoreboard?dates=" + report[2], request.signal);
        if (token !== generation) return;
        if (requestedStory === articleId) {
          archivedReport = buildReports(archive.events || [], reportLeague).find(story => story.id === articleId);
        }
      } catch { /* The article view explains an unavailable match report. */ }
    }
  }
  if (token !== generation) return;
  if (requestedStory) renderArticle();
  $("refresh").disabled = false;
  $("score-status").textContent = date === "upcoming" && !errors.scores
    ? (errors.partialFixtures ? "Some fixture dates are unavailable · " : "") + "Scheduled kickoffs over the next 14 days · Local time"
    : errors.scores
    ? errors.scores
    : "ESPN · Checked " +
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }) +
      " · Match times are local";
  renderMatches();
  renderTables();
  renderNews();
}
async function refreshMatches() {
  if ($("refresh").disabled || !league || document.hidden || date === "upcoming") return;
  const token = generation;
  try {
    const suffix = date ? "?dates=" + date.replaceAll("-", "") : "";
    const data = await fetchJson(
      API + league.id + "/scoreboard" + suffix,
      controller.signal,
    );
    if (token !== generation) return;
    events = (data.events || [])
      .filter((event) => opponents(event).length === 2)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    errors.scores = false;
    $("score-status").textContent =
      "ESPN · Checked " +
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }) +
      " · Match times are local";
    renderMatches();
    if (!hasStandings(league) && view === "standings") renderTables();
    const reports = buildReports(events, league);
    if (date) selectedMatchReports = reports;
    else mergeReports(league.id, reports);
    updateNewsAlerts();
  } catch (error) {
    if (token === generation)
      $("score-status").textContent = error instanceof FeedFormatError
        ? error.message + " Showing the last received scores."
        : "Could not refresh. Showing the last received scores. Use Refresh to retry.";
  }
}
$("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const term = $("search").value.trim().slice(0, 80);
  if (!term) {
    if (view === "search") location.hash = "home";
    return;
  }
  preferences.searches = [
    term,
    ...preferences.searches.filter(value => normalize(value) !== normalize(term)),
  ].slice(0, 10);
  savePreferences();
  const destination = "#" + new URLSearchParams({ search: term });
  if (location.hash === destination) void lookupFootball(term);
  else location.hash = destination;
});
$("clear-search").addEventListener("click", () => {
  $("search").value = "";
  $("search-form").requestSubmit();
  $("search").focus();
});
$("search").addEventListener("search", () => {
  if (!$("search").value) $("search-form").requestSubmit();
});
document.querySelectorAll("[data-filter]").forEach((button) =>
  button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document
      .querySelectorAll("[data-filter]")
      .forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
    if (league) renderMatches();
  }),
);
document.querySelectorAll("[data-sort]").forEach((button) =>
  button.addEventListener("click", () => {
    sort = button.dataset.sort;
    document
      .querySelectorAll("[data-sort]")
      .forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
    renderNews();
  }),
);
document.querySelectorAll("[data-date]").forEach((button) =>
  button.addEventListener("click", () => {
    const selected = new Date();
    selected.setDate(selected.getDate() + Number(button.dataset.date || 0));
    date = button.dataset.date === "recent" ? "" : button.dataset.date === "upcoming" ? "upcoming" : localDate(selected);
    $("match-date").value = date === "upcoming" ? "" : date;
    if (date === "upcoming" && filter === "live") {
      filter = "all";
      document.querySelectorAll("[data-filter]").forEach(item =>
        item.setAttribute("aria-pressed", String(item.dataset.filter === filter)));
    }
    document
      .querySelectorAll("[data-date]")
      .forEach((item) =>
        item.setAttribute("aria-pressed", String(item === button)),
      );
    if (league) loadData();
  }),
);
$("match-date").addEventListener("change", () => {
  date = $("match-date").value;
  document
    .querySelectorAll("[data-date]")
    .forEach((item) =>
      item.setAttribute(
        "aria-pressed",
        String(!date && item.dataset.date === "recent"),
      ),
    );
  if (league) loadData();
});
$("refresh").addEventListener("click", () => {
  if (league) {
    loadData();
    checkNews();
  }
});
$("followed-only").addEventListener("change", () => {
  if (league) renderClubs();
});
$("more-news").addEventListener("click", () => {
  newsLimit += 8;
  renderNews();
});
$("close-dialog").addEventListener("click", () => $("detail-dialog").close());
$("detail-dialog").addEventListener("close", () => {
  dialogOpener?.focus({ preventScroll: true });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (league) checkNews();
  void matchday.refresh();
  void accountSync.refresh();
});
window.addEventListener("online", () => void accountSync.refresh());
window.addEventListener("hashchange", () => {
  setRoute();
  if (requestedStory && league && ![...stories, ...preferences.saved, ...editorialStories, archivedReport,
    ...preferences.alerts.inbox.map(item => item.story)].some(story => story?.id === requestedStory)) loadData();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (view === "search") $("page-title").focus({ preventScroll: true });
});
window.addEventListener("storage", (event) => {
  if (event.key !== preferenceKey) return;
  const guest = readPreferences();
  if (accountSync.isConnected()) {
    guest.following = preferences.following;
    guest.saved = preferences.saved;
  }
  Object.assign(preferences, guest);
  if (league) {
    renderFollowing();
    renderClubs();
    renderNews();
    renderSaved();
    renderMatches();
    renderInterests();
    renderAlerts();
  }
});

function storyFromFollowedClub(story) {
  return (story.teams || []).some(team => follows(team));
}

function storyInScope(story) {
  const scope = $("news-scope").value;
  if (scope === "competition") return story.leagueId === league?.id;
  if (scope === "international") return catalog.some(item => item.international && item.id === story.leagueId);
  if (scope === "ballon") return story.topic === "ballon-dor";
  if (scope === "following") return storyFromFollowedClub(story) || followsInterest(story, preferences.alerts.interests);
  return true;
}

function combinedStories() {
  const combined = [...reportFeeds.values()].flat().concat(editorialStories, selectedMatchReports);
  return [...new Map(combined.map(story => [story.id, story])).values()];
}

function updateNewsAlerts() {
  stories = combinedStories();
  const alertState = preferences.alerts;
  const wasInitialized = alertState.initialized;
  const previousSeen = alertState.seen;
  const added = collectAlerts(alertState, stories, storyFromFollowedClub);
  if (!wasInitialized || added || previousSeen.length !== alertState.seen.length || previousSeen.at(-1) !== alertState.seen.at(-1)) savePreferences();
  renderNews();
  renderAlerts();
  if (requestedStory && !$("article").querySelector(".article-heading")) renderArticle();
  if (added && wasInitialized) toast(added === 1 ? "You have a new football update" : added + " new football updates");
}

function mergeReports(id, reports) {
  const byId = new Map((reportFeeds.get(id) || []).map(story => [story.id, story]));
  for (const story of reports) byId.set(story.id, story);
  reportFeeds.set(id, [...byId.values()].sort((a, b) => Date.parse(b.published) - Date.parse(a.published)).slice(0, 60));
}

async function checkNews() {
  if (checkingNews || document.hidden) return;
  checkingNews = true;
  try {
    const signal = new AbortController().signal;
    const matchday = new Date();
    const today = localDate(matchday);
    const recentDays = [1, 2].map(offset => {
      const day = new Date(matchday);
      day.setDate(day.getDate() - offset);
      return localDate(day).replaceAll("-", "");
    });
    await Promise.allSettled(catalog.map(async item => {
      const scoreboard = API + item.id + "/scoreboard";
      const latest = fetchJson(scoreboard, signal);
      const previous = item.international && loadedNewsDates.get(item.id) !== today
        ? recentDays.map(day => fetchJson(scoreboard + "?dates=" + day, signal)) : [];
      const [current, ...earlier] = await Promise.allSettled([latest, ...previous]);
      for (const result of [...earlier, current]) {
        if (result.status === "fulfilled") mergeReports(item.id, buildReports(result.value.events || [], item));
      }
      if (earlier.length && earlier.every(result => result.status === "fulfilled")) {
        loadedNewsDates.set(item.id, today);
      }
    }));
    updateNewsAlerts();
  } finally {
    checkingNews = false;
  }
}

$("news-scope").addEventListener("change", () => { newsLimit = 8; renderNews(); });

const requests = new Map();
let portraits;

function cachedMatchData(path) {
  const saved = requests.get(path);
  if (saved && Date.now() - saved.at < 300000) return saved.promise;
  const promise = fetchJson(API + path, new AbortController().signal);
  const entry = { at: Date.now(), promise };
  requests.set(path, entry);
  promise.catch(() => { if (requests.get(path) === entry) requests.delete(path); });
  return promise;
}

async function loadUpcoming(competitionId, signal) {
  const fixtures = [];
  let failures = 0;
  let formatError;
  const days = Array.from({ length: 14 }, (_, offset) => {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    return localDate(day).replaceAll("-", "");
  });
  for (let offset = 0; offset < days.length; offset += 5) {
    if (signal.aborted) throw signal.reason;
    const batch = await Promise.allSettled(days.slice(offset, offset + 5).map(day =>
      fetchJson(API + competitionId + "/scoreboard?dates=" + day, signal)));
    for (const result of batch) {
      if (result.status === "fulfilled") fixtures.push(...(result.value.events || []));
      else {
        failures++;
        if (result.reason instanceof FeedFormatError) formatError = result.reason;
      }
    }
  }
  if (failures === days.length) throw formatError || new Error("Fixture feed unavailable");
  return { events: upcomingFixtures(fixtures), partial: failures > 0 };
}

function expandableData(title, load, render) {
  const section = node("details", undefined, "match-extra");
  const summary = node("summary", title);
  const content = node("div", undefined, "match-extra-content");
  section.append(summary, content);
  let state = "idle";
  section.addEventListener("toggle", async () => {
    if (!section.open || state !== "idle") return;
    state = "loading";
    content.replaceChildren(node("p", "Loading…", "subtle"));
    try {
      const data = await load();
      content.replaceChildren();
      render(content, data);
      state = "ready";
    } catch (error) {
      const message = error instanceof FeedFormatError ? error.message : "This feed could not be reached. Close and reopen this section to retry.";
      content.replaceChildren(node("p", message, "subtle"));
      state = "idle";
    }
  });
  return section;
}

async function readPortraits(path) {
  try {
    const response = await fetch(path);
    return response.ok ? await response.json() : {};
  } catch {
    return {};
  }
}

function portraitIndex() {
  portraits ??= Promise.all([
    readPortraits("player-portraits.json?v=3b9ff4909e27"),
    readPortraits("club-player-portraits.json?v=3b9ff4909e27"),
  ]).then(([league, clubs]) => ({ league, clubs }));
  return portraits;
}

const localPortraits = new Map([
  ["22774", "assets/players/22774.webp"],
  ["45843", "assets/players/45843.webp"],
]);

function playerPortrait(player, index, eager = false) {
  const name = player.displayName || player.fullName;
  const initials = name.split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join("");
  const portrait = node("span", undefined, "player-portrait");
  portrait.setAttribute("aria-hidden", "true");
  const fallback = node("span", initials, "portrait-initials");
  portrait.append(fallback);
  const names = [player.fullName, player.displayName, [player.firstName, player.lastName].filter(Boolean).join(" ")];
  const keys = names.filter(Boolean).map(value => normalize(value).replace(/[^a-z0-9]/g, ""));
  const clubPhoto = keys.map(key => index.clubs[key]).find(safeUrl);
  const code = keys.map(key => index.league[key]).find(value => /^\d+$/.test(value ?? ""));
  const candidates = [...new Set([
    localPortraits.get(String(player.id)),
    safeUrl(player.headshot?.href || player.headshot?.url),
    safeUrl(clubPhoto),
    /^\d{1,12}$/.test(player.id) ? "https://a.espncdn.com/i/headshots/soccer/players/full/" + player.id + ".png" : "",
    code ? "https://resources.premierleague.com/premierleague/photos/players/250x250/p" + code + ".png" : "",
  ].filter(Boolean))];
  const image = node("img");
  image.alt = "";
  image.loading = eager ? "eager" : "lazy";
  image.decoding = "async";
  let triedCatalogue = false;
  async function nextPhoto() {
    if (!candidates.length && !triedCatalogue) {
      triedCatalogue = true;
      candidates.push(...await cataloguePortraits(names));
    }
    const next = candidates.shift();
    if (next) image.src = next;
    else image.remove();
  }
  image.addEventListener("load", () => {
    image.classList.add("is-ready");
    fallback.hidden = true;
  });
  image.addEventListener("error", nextPhoto);
  portrait.append(image);
  void nextPhoto();
  return portrait;
}

function playerCard(player, index, shirt = player.jersey, position = player.position) {
  const name = player.displayName || player.fullName;
  const canOpen = /^\d{1,12}$/.test(player.id);
  const card = node(canOpen ? "button" : "div", undefined, "player-card");
  if (canOpen) {
    card.type = "button";
    card.addEventListener("click", () => void openPlayerProfile(player, index));
  }
  card.append(playerPortrait(player, index, player.prioritizePhoto));
  const label = node("span");
  label.append(node("strong", name), node("small", [shirt && "#" + shirt, position?.displayName || position?.name].filter(Boolean).join(" · ")));
  card.append(label);
  return card;
}

async function openPlayerProfile(player, index) {
  const content = node("div");
  const heading = node("div", undefined, "club-dialog-heading player-profile-heading");
  const title = node("h2", player.displayName || player.fullName);
  title.id = "detail-title";
  const playerPicture = playerPortrait(player, index, true);
  heading.append(playerPicture, title);
  const status = node("p", "Loading player profile…", "data-status");
  status.setAttribute("role", "status");
  content.append(heading, status);
  showDialog(content);
  try {
    const { athlete } = await getPlayerProfile(player.id);
    if (!content.isConnected || !$("detail-dialog").open) return;
    title.textContent = athlete.displayName;
    const profilePhoto = safeUrl(athlete.headshot?.href || athlete.headshot?.url);
    const previewPhoto = safeUrl(player.headshot?.href || player.headshot?.url);
    if (profilePhoto && profilePhoto !== previewPhoto || athlete.fullName && athlete.fullName !== player.fullName && !playerPicture.querySelector(".is-ready")) {
      heading.replaceChild(playerPortrait(athlete, index, true), playerPicture);
    }
    const facts = profileFacts(athlete);
    if (!facts.length) {
      status.textContent = "No biographical details are available for this player.";
      return;
    }
    const list = node("dl", undefined, "player-facts");
    for (const [label, value] of facts) {
      const row = node("div");
      row.append(node("dt", label), node("dd", String(value)));
      list.append(row);
    }
    status.textContent = "Player profile loaded";
    status.classList.add("sr-only");
    content.append(list);
  } catch {
    if (!content.isConnected || !$("detail-dialog").open) return;
    status.textContent = "This player profile is temporarily unavailable.";
    const retry = node("button", "Retry", "load-more");
    retry.type = "button";
    retry.addEventListener("click", () => void openPlayerProfile(player, index));
    content.append(retry);
  }
}

function playerGrid(players, createCard) {
  const grid = node("div", undefined, "player-grid");
  for (const player of players) grid.append(createCard(player));
  return grid;
}

function addLineupSection(content, event, competitionId) {
  content.append(expandableData("Match lineups", async () => {
    const [data, index] = await Promise.all([
      cachedMatchData(competitionId + "/summary?event=" + encodeURIComponent(event.id)), portraitIndex()
    ]);
    return { data, index };
  }, (panel, { data, index }) => {
    let hasLineup = false;
    for (const team of data.rosters || []) {
      const players = (team.roster || []).filter(item => item.athlete?.displayName || item.athlete?.fullName);
      const starters = players.filter(item => item.starter === true);
      if (!starters.length) continue;
      hasLineup = true;
      const name = team.team?.displayName || "Team";
      const formation = team.formation ? " · " + team.formation : "";
      const create = player => playerCard(player.athlete, index, player.jersey, player.position);
      panel.append(node("h4", name + formation), node("p", starters.length === 11 ? "Starting XI" : "Reported starters", "subtle"), playerGrid(starters, create));
      const bench = players.filter(item => item.starter === false);
      if (bench.length) {
        const substitutes = node("details", undefined, "bench-list");
        substitutes.append(node("summary", "Substitutes (" + bench.length + ")"), playerGrid(bench, create));
        panel.append(substitutes);
      }
    }
    if (!hasLineup) panel.append(node("p", "Confirmed starters have not been published in the match feed.", "subtle"));
  }));
}

function addClubSections(content, team) {
  const competitionId = team.competitionId || catalog.find(item => item.name === team.leagueName)?.id ||
    catalog.find(item => item.id === league.id && item.teams.some(club => club.id === team.id))?.id ||
    catalog.find(item => item.teams.some(club => club.id === team.id))?.id || league.id;
  const path = competitionId + "/teams/" + encodeURIComponent(team.id);
  content.append(expandableData("Club squad", async () => {
    const [data, index] = await Promise.all([cachedMatchData(path + "/roster"), portraitIndex()]);
    return { data, index };
  }, (panel, { data, index }) => {
    const players = (data.athletes || []).filter(player => player.displayName || player.fullName);
    if (!players.length) panel.append(node("p", "No squad list is available for this club.", "subtle"));
    else {
      panel.append(node("p", "Current squad · Match lineups are shown in individual matches.", "subtle"));
      panel.append(playerGrid(players, player => playerCard(player, index)));
    }
  }));
  content.append(expandableData("Upcoming club matches", () => cachedMatchData(path + "/schedule?fixture=true"), (panel, data) => {
    const fixtures = upcomingFixtures(data.events || []).filter(event => opponents(event).length === 2).slice(0, 8);
    if (!fixtures.length) panel.append(node("p", "No scheduled matches are currently listed.", "subtle"));
    for (const event of fixtures) {
      panel.append(node("p", dateLabel(event.date) + " · " + (event.league?.abbreviation || "Fixture"), "match-group-heading"));
      panel.append(matchRow(event, competitionId));
    }
  }));
}

const matchday = createMatchday({
  getCatalogue: () => catalog, matchRow, followsTeam: follows,
  matchesTeam: team => !query || aliases(team).some(name => contains(name, query)),
});
const { renderTables, loadForms } = createStandings({
  state: () => ({ league, events, groups, query, view, errors }), matchVisible, matchRow, openClub, cachedMatchData,
});
const { renderAlerts, renderInterests } = createAlerts({
  preferences, getStories: () => stories, getCatalogue: () => catalog, storyLink, savePreferences, renderNews,
});

function showAccountPreferences(next) {
  const unchanged = JSON.stringify([preferences.following, preferences.saved]) === JSON.stringify([next.following, next.saved]);
  if (unchanged) return;
  preferences.following = next.following;
  preferences.saved = next.saved;
  if (!league) return;
  renderFollowing();
  renderClubs();
  renderMatches();
  renderNews();
  renderSaved();
  if (requestedStory) renderArticle();
}
const accountSync = createPreferenceSync({
  storage: () => localStorage, apply: showAccountPreferences,
  status: message => { $("sync-status").textContent = message; },
});

const themeOptions = document.querySelectorAll('input[name="theme"]');
function syncThemeOptions() {
  for (const option of themeOptions) option.checked = option.value === getTheme();
  const { accent, sidebar } = getThemeColors();
  $("theme-accent").value = accent;
  $("theme-sidebar").value = sidebar;
  $("custom-theme-colors").hidden = getTheme() !== "custom";
}
for (const option of themeOptions) {
  option.addEventListener("change", () => {
    const saved = setTheme(option.value);
    syncThemeOptions();
    $("theme-status").textContent = saved ? "Appearance saved." : "Appearance applied for this visit.";
  });
}
function saveCustomColors(reset = false) {
  const saved = setThemeColors(reset ? undefined : {
    accent: $("theme-accent").value,
    sidebar: $("theme-sidebar").value,
  });
  syncThemeOptions();
  $("theme-status").textContent = saved ? "Theme colors saved." : "Theme colors applied for this visit.";
}
$("theme-accent").addEventListener("change", () => saveCustomColors());
$("theme-sidebar").addEventListener("change", () => saveCustomColors());
$("reset-theme-colors").addEventListener("click", () => saveCustomColors(true));
window.addEventListener("soccer-theme-change", syncThemeOptions);
syncThemeOptions();
setRoute();
try {
  const response = await fetch("football-catalog.json?v=3b9ff4909e27");
  if (!response.ok) throw new Error("Club catalogue unavailable");
  catalog = await response.json();
  const teams = new Map();
  for (const item of catalog) {
    item.teams = item.teams.map((team) => ({ ...team, leagueName: item.name }));
    for (const team of item.teams) {
      if (!teams.has(team.id)) teams.set(team.id, team);
      if (item.international) nationalTeamIds.add(team.id);
      const logo = crestSource(team.logo);
      if (logo && (!clubCrests.has(team.id) || logo.startsWith("assets/clubs/"))) {
        clubCrests.set(team.id, logo);
      }
    }
  }
  for (const team of preferences.discoveredClubs) {
    if (!teams.has(team.id)) teams.set(team.id, team);
    if (team.national) nationalTeamIds.add(team.id);
  }
  allTeams = [...teams.values()];
  const requestedCompetition = new URLSearchParams(location.search).get("competition");
  league = catalog.find(item => item.id === requestedCompetition)
    || catalog.find(item => item.id === preferences.league) || catalog[0];
  renderLeagues();
  renderFollowing();
  renderClubs();
  renderSaved();
  renderInterests();
  renderAlerts();
  matchday.setActive(view === "matchday");
  await loadData();
  checkNews();
  setInterval(() => {
    if (view === "matchday") void matchday.refresh();
    else void refreshMatches();
  }, 60000);
  setInterval(() => { if (!document.hidden) void accountSync.refresh(); }, 60000);
  setInterval(checkNews, 180000);
} catch {
  $("score-status").textContent =
    "Unable to load the app. Reload this page to try again.";
  $("news-status").textContent =
    "Club and competition data could not be loaded.";
  $("refresh").disabled = true;
  $("matchday-status").textContent = "The competition catalogue could not load. Reload to try again.";
}

function showAccountLink(signedIn) {
  const link = document.querySelector(".signin-button");
  link.replaceChildren(document.createTextNode(signedIn ? "My account " : "Sign in "), materialIcon(signedIn ? "person" : "login"));
  link.href = signedIn ? "protected.html" : "index.html?view=login";
}

async function startAccount() {
  try {
    const { createAuthClient } = await import("./auth-client.js?v=3b9ff4909e27");
    const client = await createAuthClient();
    let authRevision = 0;
    const verify = async () => {
      const revision = ++authRevision;
      try {
        const { data, error } = await client.auth.getUser();
        if (revision !== authRevision || error || !data.user) return;
        showAccountLink(true);
        accountSync.connect(client, data.user.id, readPreferences());
      } catch { /* Public browsing works offline. */ }
    };
    client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        authRevision++;
        accountSync.disconnect();
        showAccountLink(false);
        showAccountPreferences(readPreferences());
      } else if (event === "SIGNED_IN") {
        // Run outside the auth callback so it can release the SDK session lock.
        setTimeout(() => void verify(), 0);
      }
    });
    await verify();
  } catch { /* Public browsing does not require an account. */ }
}
void startAccount();

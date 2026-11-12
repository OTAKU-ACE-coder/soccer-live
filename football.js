import { buildReports, editorialStories } from "./newsroom.js?v=7";

import { collectAlerts, followsInterest, readAlertSettings } from "./news-alerts.js";

import { upcomingFixtures, recentResults } from "./match-data.js";

import { getTheme, setTheme } from "./theme.js";

const $ = (id) => document.getElementById(id);
const API = "https://site.api.espn.com/apis/site/v2/sports/soccer/";
const TABLE_API = "https://site.web.api.espn.com/apis/v2/sports/soccer/";
const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const contains = (text, term) => normalize(text).includes(normalize(term));
const names = {
  "Paris Saint-Germain": ["PSG"],
  "Atlético Madrid": ["Atletico Madrid"],
  "Tottenham Hotspur": ["Spurs", "Tottenham"],
  "Manchester United": ["Man Utd", "Man United"],
  "Manchester City": ["Man City"],
  Internazionale: ["Inter Milan"],
  "Bayern Munich": ["FC Bayern München", "Bayern München"],
};
const routes = ["home", "matches", "news", "standings", "clubs", "saved", "alerts", "settings"];
const titles = {
  home: "Your football, all in one place.",
  matches: "Every match. Every moment.",
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
const reportFeeds = new Map();
let checkingNews = false;

function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
function readPreferences() {
  try {
    const value = JSON.parse(
      localStorage.getItem("soccer-live-preferences") ||
        localStorage.getItem("touchline-preferences") ||
        "{}",
    );
    return {
      following: Array.isArray(value.following)
        ? value.following.filter((v) => typeof v === "string").slice(0, 150)
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
    return { following: [], searches: [], saved: [], league: "eng.1", alerts: readAlertSettings() };
  }
}
function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 3500);
}
function savePreferences() {
  try {
    localStorage.setItem(
      "soccer-live-preferences",
      JSON.stringify(preferences),
    );
  } catch {
    toast(
      "Your browser could not save this change. It will last for this visit.",
    );
  }
}
function aliases(team) {
  return [team.name, team.shortName, ...(names[team.name] || [])].filter(
    Boolean,
  );
}
function follows(team) {
  return preferences.following.some((name) =>
    aliases(team).some((alias) => normalize(alias) === normalize(name)),
  );
}
function teamMatches(team, text) {
  return aliases(team).some((name) => {
    const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(?:^|[^a-z0-9])" + escaped + "(?:$|[^a-z0-9])").test(
      normalize(text),
    );
  });
}
const clubCrests = new Map();

function crestSource(value) {
  return typeof value === "string" && /^assets\/clubs\/[a-z0-9.-]+$/i.test(value)
    ? value
    : safeUrl(value);
}

function crest(team) {
  const fallback = node(
    "span",
    (team.abbreviation || team.name || "?").slice(0, 3),
    "crest-fallback",
  );
  fallback.setAttribute("aria-hidden", "true");
  const candidates = [...new Set([
    clubCrests.get(String(team.id)),
    crestSource(team.logo),
  ].filter(Boolean))];
  if (!candidates.length) return fallback;
  const image = node("img");
  image.alt = "";
  image.loading = "lazy";
  image.addEventListener("error", () => {
    const next = candidates.shift();
    if (next) image.src = next;
    else image.replaceWith(fallback);
  });
  image.src = candidates.shift();
  return image;
}
function empty(title, description, linkText, href) {
  const box = node("div", undefined, "empty");
  box.append(node("strong", title), node("p", description));
  if (href) {
    const link = node("a", linkText);
    link.href = href;
    box.append(link);
  }
  return box;
}
function dateLabel(value) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf())
    ? parsed.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date unavailable";
}
function localDate(value) {
  return (
    value.getFullYear() +
    "-" +
    String(value.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(value.getDate()).padStart(2, "0")
  );
}
async function fetchJson(url, signal) {
  const response = await fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
  });
  if (!response.ok) throw new Error("Feed unavailable");
  return response.json();
}
function competition(event) {
  return event.competitions?.[0];
}
function opponents(event) {
  const competitors = competition(event)?.competitors || [];
  return ["home", "away"]
    .map((side) => competitors.find((team) => team.homeAway === side))
    .filter(Boolean);
}
function asTeam(competitor) {
  const team = competitor.team;
  return {
    id: String(team.id),
    name: team.displayName,
    shortName: team.shortDisplayName,
    abbreviation: team.abbreviation,
    logo: team.logo,
    url: team.links?.find((link) => link.rel?.includes("clubhouse"))?.href,
  };
}
function renderLeagues() {
  $("league-strip").replaceChildren();
  $("competition-select").replaceChildren();
  for (const item of catalog) {
    const button = node("button", undefined, "league-chip");
    button.type = "button";
    button.setAttribute("aria-pressed", String(item.id === league.id));
    button.append(
      crest({ name: item.name, logo: item.logo }),
      node("span", item.name),
    );
    button.addEventListener("click", () => selectCompetition(item.id));
    const option = node("option", item.name);
    option.value = item.id;
    option.selected = league.id === item.id;
    $("competition-select").append(option);
    $("league-strip").append(button);
  }
}
function selectCompetition(id) {
  const selected = catalog.find(item => item.id === id);
  if (!selected || league.id === id) return;
  league = selected;
  preferences.league = selected.id;
  savePreferences();
  renderLeagues();
  renderClubs();
  loadData();
}
$("competition-select").addEventListener("change", event => selectCompetition(event.target.value));

function toggleFollow(team) {
  const active = follows(team);
  preferences.following = preferences.following.filter(
    (name) =>
      !aliases(team).some((alias) => normalize(alias) === normalize(name)),
  );
  if (!active) preferences.following.push(team.name);
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
    active ? "✓ Following" : "＋ Follow club",
    "follow-button",
  );
  button.type = "button";
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
        .find(
          (b) =>
            b.getAttribute("aria-label") ===
            (!active ? "Unfollow " : "Follow ") + team.name,
        )
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
  const teams = (query || $("followed-only").checked ? allTeams : league.teams)
    .filter(
      (team) =>
        (!query || aliases(team).some((name) => contains(name, query))) &&
        (!$("followed-only").checked || follows(team)),
    )
    .sort(
      (a, b) =>
        Number(follows(b)) - Number(follows(a)) || a.name.localeCompare(b.name),
    );
  $("club-status").textContent =
    teams.length +
    " clubs · " +
    (query || $("followed-only").checked
      ? "Across all competitions"
      : league.name);
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
  if (!teams.length)
    list.append(
      empty("No clubs found", "Try another search or turn off Following only."),
    );
}
function matchVisible(event) {
  const teams = opponents(event).map(asTeam);
  const status = competition(event)?.status || event.status;
  return (
    (!query ||
      teams.some((team) =>
        aliases(team).some((name) => contains(name, query)),
      )) &&
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
        crest({ name: league.name, logo: league.logo }),
        node("span", league.name + " · " + label),
      );
      $("scores").append(group);
      lastDate = label;
    }
    $("scores").append(matchRow(event));
  }
  if (!visible.length && !$("refresh").disabled) {
    const message = errors.scores
      ? "The match feed could not be reached. Use Refresh to try again."
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
function entriesOf(data) {
  if (data.standings?.entries)
    return [{ name: data.name || "", entries: data.standings.entries }];
  return (data.children || []).flatMap(entriesOf);
}
function stat(entry, name) {
  return entry.stats?.find((item) => item.name === name)?.displayValue ?? "–";
}
function tableTeam(entry) {
  return {
    id: String(entry.team.id),
    name: entry.team.displayName,
    shortName: entry.team.shortDisplayName,
    logo: entry.team.logos?.[0]?.href,
    url: entry.team.links?.find((link) => link.rel?.includes("clubhouse"))
      ?.href,
  };
}
function renderTables() {
  $("tables").replaceChildren();
  $("mini-table").replaceChildren();
  $("table-title").textContent = league.knockout ? league.name + " fixtures and results" : "League standings";
  $("mini-title").textContent = league.knockout ? league.name : "Top of the table";
  $("mini-table-link").textContent = league.knockout ? "Match centre →" : "Full table ↗";
  $("mini-table-link").href = league.knockout ? "#matches" : "#standings";
  if (league.knockout) {
    $("form-status").textContent = "";
    $("table-season").textContent = "";
    $("table-status").textContent = "Knockout competition · Fixtures and results";
    $("mini-table").append(node("p", "Follow fixtures and results for each round in the Match Centre.", "subtle"));
    const cupMatches = events.filter(matchVisible);
    for (const match of cupMatches) {
      $("tables").append(node("p", dateLabel(match.date), "match-group-heading"), matchRow(match));
    }
    if (!cupMatches.length) {
      $("tables").append(empty("No cup matches in this selection", "Open the Match Centre to choose another date or browse upcoming fixtures.", "Open Match Centre →", "#matches"));
    }
    return;
  }
  for (const group of groups) {
    if (groups.length > 1)
      $("tables").append(node("h3", group.name, "group-title"));
    const wrapper = node("div", undefined, "table-scroll"),
      table = node("table");
    const caption = node(
      "caption",
      league.name + " standings " + group.name,
      "sr-only",
    );
    const header = node("tr");
    for (const title of [
      "#",
      "Club",
      "P",
      "W",
      "D",
      "L",
      "GF",
      "GA",
      "GD",
      "Pts",
      "Last 5",
    ]) {
      const cell = node("th", title);
      cell.scope = "col";
      header.append(cell);
    }
    const head = node("thead");
    head.append(header);
    const body = node("tbody");
    group.entries.forEach((entry, index) => {
      const team = tableTeam(entry);
      if (query && !aliases(team).some((name) => contains(name, query))) return;
      const row = node("tr");
      row.append(
        node(
          "td",
          stat(entry, "rank") === "–" ? String(index + 1) : stat(entry, "rank"),
        ),
      );
      const cell = node("td"),
        button = node("button", undefined, "table-club");
      button.type = "button";
      button.append(crest(team), node("span", team.name));
      button.addEventListener("click", () => openClub(team));
      cell.append(button);
      row.append(cell);
      for (const key of [
        "gamesPlayed",
        "wins",
        "ties",
        "losses",
        "pointsFor",
        "pointsAgainst",
        "pointDifferential",
        "points",
      ])
        row.append(node("td", stat(entry, key)));
      const form = node("td", undefined, "form-cell");
      form.dataset.formTeam = team.id;
      form.textContent = "–";
      row.append(form);
      body.append(row);
    });
    table.append(caption, head, body);
    wrapper.append(table);
    $("tables").append(wrapper);
  }
  const top = groups[0]?.entries?.slice(0, 5) || [];
  for (const [index, entry] of top.entries()) {
    const team = tableTeam(entry),
      row = node("div", undefined, "mini-row");
    row.append(
      node("span", String(index + 1)),
      crest(team),
      node("span", team.shortName || team.name),
      node("strong", stat(entry, "points")),
    );
    $("mini-table").append(row);
  }
  if (!groups.length) {
    $("tables").append(
      empty("Standings unavailable", "Try another competition or use Refresh."),
    );
    $("mini-table").append(
      node("p", "Table unavailable for this competition.", "subtle"),
    );
  }
  renderForms();
  if (view === "standings" && groups.length) loadForms();
  $("table-status").textContent = errors.table
    ? "Could not update the table. Use Refresh to retry."
    : league.name + " · Current season, as reported by ESPN";
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
  const active = preferences.saved.some((item) => item.id === story.id);
  preferences.saved = active
    ? preferences.saved.filter((item) => item.id !== story.id)
    : [story, ...preferences.saved].slice(0, 100);
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
  if (story.teams.length === 2) {
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
  const story = [...stories, ...editorialStories, ...preferences.saved, ...preferences.alerts.inbox.map(item => item.story)].find(item => item.id === requestedStory);
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
  byline.append(node("span", story.leagueId ? "Soccer Live Match Desk" : "Soccer Live Editorial"), saveButton(story));
  heading.append(byline);
  const body = node("div", undefined, "article-body");
  for (const paragraph of story.paragraphs) body.append(node("p", paragraph));
  if (story.leagueId) body.append(node("p", "Match report generated from recorded scores and available match statistics.", "article-note"));
  if (story.credit) body.append(node("p", story.credit, "article-note"));
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
  requestedStory = new URLSearchParams(requested).get("story") || "";
  view = requestedStory ? "article" : routes.includes(requested) ? requested : "home";
  $("article").hidden = !requestedStory;
  $("league-strip").hidden = Boolean(requestedStory) || view === "settings";
  $("competition-picker").hidden = $("league-strip").hidden;
  if (requestedStory) renderArticle();
  document.body.dataset.view = view;
  $("page-title").textContent = titles[view] || "Soccer Live newsroom";
  $("welcome").hidden = view !== "home" || Boolean(query);
  $("right-rail").hidden = view !== "home" || Boolean(query);
  for (const section of routes.filter(route => route !== "home")) {
    $(section).hidden = requestedStory ? true : query
      ? ["saved", "alerts", "settings"].includes(section) && view !== section
      : view === "home"
        ? !["matches", "news"].includes(section)
        : section !== view;
  }
  document.querySelectorAll(".main-nav a,.mobile-nav a").forEach((link) => {
    if (link.hash === "#" + (requestedStory ? "news" : view)) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  if (league) {
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
  stories = [];
  errors = {};
  $("scores").replaceChildren();
  $("tables").replaceChildren();
  $("stories").replaceChildren();
  $("mini-table").replaceChildren(node("p", "Loading table…", "subtle"));
  $("score-status").textContent = "Loading " + league.name + " matches…";
  $("news-status").textContent = "Loading the latest stories…";
  $("table-status").textContent = "Loading standings…";
  const suffix = date ? "?dates=" + date.replaceAll("-", "") : "";
  const results = await Promise.allSettled([
    date === "upcoming" ? loadUpcoming(league.id, request.signal) : fetchJson(API + league.id + "/scoreboard" + suffix, request.signal),
    league.knockout ? Promise.resolve(null) : fetchJson(TABLE_API + league.id + "/standings", request.signal),
    date ? fetchJson(API + league.id + "/scoreboard", request.signal) : Promise.resolve(null),
  ]);
  if (token !== generation) return;
  if (results[0].status === "fulfilled")
    events = (results[0].value.events || [])
      .filter((event) => opponents(event).length === 2)
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  else errors.scores = true;
  errors.partialFixtures = results[0].value?.partial;
  if (results[1].status === "fulfilled" && results[1].value) {
    groups = entriesOf(results[1].value);
    $("table-season").textContent = results[1].value.season?.displayName || "";
  } else errors.table = !league.knockout;

  const latestEvents = results[2].status === "fulfilled" ? results[2].value?.events : [];
  if (latestEvents?.length || (!date && !errors.scores)) {
    reportFeeds.set(league.id, buildReports(latestEvents || events, league));
  }
  const matchReports = buildReports(events, league);
  stories = combinedStories(matchReports);
  if (requestedStory && !stories.some(story => story.id === requestedStory)) {
    const report = /^(.*)~(\d{8})~(\d+)$/.exec(requestedStory);
    const reportLeague = report && catalog.find(item => item.id === report[1]);
    if (reportLeague) {
      try {
        const archive = await fetchJson(API + reportLeague.id + "/scoreboard?dates=" + report[2], request.signal);
        if (token !== generation) return;
        stories.push(...buildReports(archive.events || [], reportLeague).filter(story => story.id === requestedStory));
      } catch { /* The article view explains an unavailable match report. */ }
    }
  }
  if (token !== generation) return;
  if (requestedStory) renderArticle();
  $("refresh").disabled = false;
  $("score-status").textContent = date === "upcoming" && !errors.scores
    ? (errors.partialFixtures ? "Some fixture dates are unavailable · " : "") + "Scheduled kickoffs over the next 14 days · Local time"
    : errors.scores
    ? "Scores unavailable. Use Refresh to try again."
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
    if (league.knockout && view === "standings") renderTables();
    if (!date) {
      reportFeeds.set(league.id, buildReports(events, league));
      updateNewsAlerts();
    }
  } catch {
    if (token === generation)
      $("score-status").textContent =
        "Could not refresh. Showing the last received scores. Use Refresh to retry.";
  }
}
$("search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  query = $("search").value.trim();
  if (query) {
    preferences.searches = [
      query,
      ...preferences.searches.filter(
        (term) => normalize(term) !== normalize(query),
      ),
    ].slice(0, 10);
    savePreferences();
  }
  $("clear-search").hidden = !query;
  $("search-status").hidden = !query;
  $("search-status").textContent =
    "Results for “" + query + "” · Clubs, matches, and stories";
  setRoute();
  if (league) {
    renderClubs();
    renderTables();
  }
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
  if (league) loadData();
});
$("followed-only").addEventListener("change", () => {
  if (league) renderClubs();
});
$("more-news").addEventListener("click", () => {
  newsLimit += 8;
  renderNews();
});
$("close-dialog").addEventListener("click", () => $("detail-dialog").close());
$("detail-dialog").addEventListener("close", () =>
  dialogOpener?.focus({ preventScroll: true }),
);
document.addEventListener("visibilitychange", () => { if (league && !document.hidden) checkNews(); });
window.addEventListener("hashchange", () => {
  setRoute();
  if (requestedStory && league && ![...stories, ...preferences.saved, ...editorialStories].some(story => story.id === requestedStory)) loadData();
  window.scrollTo({ top: 0, behavior: "instant" });
});
window.addEventListener("storage", (event) => {
  if (event.key !== "soccer-live-preferences") return;
  Object.assign(preferences, readPreferences());
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

function materialIcon(name) {
  const icon = node("span", name, "material-symbols-outlined");
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function storyFromFollowedClub(story) {
  return allTeams.some(team => follows(team) && (story.teams || []).some(club => club.id === team.id));
}

function storyInScope(story) {
  const scope = $("news-scope").value;
  if (scope === "competition") return story.leagueId === league?.id;
  if (scope === "ballon") return story.topic === "ballon-dor";
  if (scope === "following") return storyFromFollowedClub(story) || followsInterest(story, preferences.alerts.interests);
  return true;
}

function combinedStories(extra = []) {
  const combined = [...reportFeeds.values()].flat().concat(editorialStories, extra);
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
  if (added && wasInitialized) toast(added === 1 ? "You have a new football update" : added + " new football updates");
}

async function checkNews() {
  if (checkingNews || document.hidden) return;
  checkingNews = true;
  try {
    const signal = new AbortController().signal;
    const results = await Promise.allSettled(catalog.map(item => fetchJson(API + item.id + "/scoreboard", signal)));
    results.forEach((result, index) => {
      if (result.status !== "fulfilled") return;
      const item = catalog[index];
      reportFeeds.set(item.id, buildReports(result.value.events || [], item));
    });
    updateNewsAlerts();
  } finally {
    checkingNews = false;
  }
}

function renderAlerts() {
  const state = preferences.alerts;
  const unread = state.inbox.filter(item => !item.read).length;
  for (const id of ["nav-unread", "header-unread"]) {
    $(id).textContent = unread;
    $(id).hidden = !unread;
  }
  $("read-alerts").disabled = !unread;
  $("alert-items").replaceChildren();
  if (!state.inbox.length) {
    $("alert-items").append(empty("You’re caught up", "New reports will appear here as they’re published."));
  }
  for (const item of state.inbox) {
    const link = storyLink(item.story, undefined, "alert-item");
    link.classList.toggle("is-unread", !item.read);
    if (!item.read) link.setAttribute("aria-label", "Unread: " + item.story.title);
    const label = node("span");
    label.append(node("strong", item.story.title), node("small", item.reason + " · " + dateLabel(item.story.published)));
    link.append(materialIcon("notifications"), label, materialIcon("arrow_forward"));
    link.addEventListener("click", () => {
      item.read = true;
      savePreferences();
      renderAlerts();
    });
    $("alert-items").append(link);
  }
  for (const input of document.querySelectorAll("[data-alert-setting]")) {
    input.checked = state.settings[input.dataset.alertSetting];
  }
}

function renderInterests() {
  const state = preferences.alerts;
  const topics = [...catalog.map(item => ({
    ...item, name: item.id === "uefa.champions" ? "UEFA Champions League" : item.name,
  })), { id: "ballon-dor", name: "Ballon d’Or" }];
  $("interest-list").replaceChildren();
  for (const topic of topics) {
    const label = node("label", undefined, "interest-option");
    const checkbox = node("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.interests.includes(topic.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.interests.push(topic.id);
        const latest = [...stories, ...editorialStories].filter(story => followsInterest(story, [topic.id]) && story.published)
          .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))[0];
        if (latest && state.settings.interests && !state.inbox.some(item => item.story.id === latest.id)) {
          state.inbox.unshift({ story: latest, reason: "Latest from your new follow", read: false });
          state.inbox = state.inbox.slice(0, 30);
          state.seen = [...new Set([...state.seen, latest.id])].slice(-500);
        }
      } else {
        state.interests = state.interests.filter(id => id !== topic.id);
      }
      savePreferences();
      renderAlerts();
      renderNews();
    });
    label.append(topic.logo ? crest(topic) : materialIcon("trophy"), node("span", topic.name), checkbox);
    $("interest-list").append(label);
  }
}

$("news-scope").addEventListener("change", () => { newsLimit = 8; renderNews(); });
$("read-alerts").addEventListener("click", () => {
  for (const item of preferences.alerts.inbox) item.read = true;
  savePreferences();
  renderAlerts();
});
for (const input of document.querySelectorAll("[data-alert-setting]")) {
  input.addEventListener("change", () => {
    preferences.alerts.settings[input.dataset.alertSetting] = input.checked;
    savePreferences();
  });
}


const formCache = new Map();
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
      else failures++;
    }
  }
  if (failures === days.length) throw new Error("Fixture feed unavailable");
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
    } catch {
      content.replaceChildren(node("p", "This feed could not be reached. Close and reopen this section to retry.", "subtle"));
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
    readPortraits("player-portraits.json"),
    readPortraits("club-player-portraits.json?v=2"),
  ]).then(([league, clubs]) => ({ league, clubs }));
  return portraits;
}

function playerCard(player, index, shirt = player.jersey, position = player.position) {
  const name = player.displayName || player.fullName;
  const card = node("div", undefined, "player-card");
  const initials = name.split(/\s+/).filter(Boolean).map(word => word[0]).slice(0, 2).join("");
  const portrait = node("span", undefined, "player-portrait");
  portrait.setAttribute("role", "img");
  portrait.setAttribute("aria-label", "Illustrated avatar for " + name + " · photo unavailable");
  portrait.append(materialIcon("person"), node("small", initials));
  const keys = [player.fullName, player.displayName, [player.firstName, player.lastName].filter(Boolean).join(" ")]
    .filter(Boolean).map(value => normalize(value).replace(/[^a-z0-9]/g, ""));
  const clubPhoto = keys.map(key => index.clubs[key]).find(safeUrl);
  const code = keys.map(key => index.league[key]).find(value => /^\d+$/.test(value ?? ""));
  const candidates = [...new Set([
    safeUrl(player.headshot?.href || player.headshot?.url),
    safeUrl(clubPhoto),
    code ? "https://resources.premierleague.com/premierleague/photos/players/250x250/p" + code + ".png" : "",
  ].filter(Boolean))];
  if (candidates.length) {
    const image = node("img");
    image.src = candidates.shift();
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      const next = candidates.shift();
      if (next) image.src = next;
      else image.replaceWith(portrait);
    });
    card.append(image);
  } else card.append(portrait);
  const label = node("span");
  label.append(node("strong", name), node("small", [shirt && "#" + shirt, position?.displayName || position?.name].filter(Boolean).join(" · ")));
  card.append(label);
  return card;
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
  const competitionId = catalog.find(item => item.name === team.leagueName)?.id ||
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

function renderForms() {
  const form = formCache.get(league.id);
  for (const cell of document.querySelectorAll("[data-form-team]")) {
    const outcomes = form?.results.get(cell.dataset.formTeam);
    if (!outcomes?.length) continue;
    const marks = node("span", undefined, "form-marks");
    for (const item of outcomes) {
      const mark = node("span", item.result === "Win" ? "✓" : item.result === "Loss" ? "×" : "–", "form-mark " + item.result.toLowerCase());
      mark.title = item.result + " " + item.score + " vs " + item.opponent + " · " + dateLabel(item.date);
      mark.setAttribute("aria-label", mark.title);
      mark.setAttribute("role", "img");
      marks.append(mark);
    }
    cell.replaceChildren(marks);
  }
  $("form-status").textContent = !groups.length ? "" : !form || form.loading ? "Loading recent results…" :
    "Last 5 completed matches in this competition · Oldest to newest · ✓ Win · – Draw · × Loss" +
    (form.failed ? " · Some results could not be loaded." : "");
}

async function loadForms() {
  const competitionId = league.id;
  const current = formCache.get(competitionId);
  if (current?.loading || (current && Date.now() - current.at < 300000)) return;
  const teams = [...new Set(groups.flatMap(group => group.entries.map(entry => String(entry.team.id))))];
  const form = { loading: true, results: new Map(), failed: false, at: Date.now() };
  formCache.set(competitionId, form);
  renderForms();
  for (let start = 0; start < teams.length; start += 5) {
    if (league.id !== competitionId) {
      formCache.delete(competitionId);
      return;
    }
    await Promise.all(teams.slice(start, start + 5).map(async id => {
      try {
        const data = await cachedMatchData(competitionId + "/teams/" + encodeURIComponent(id) + "/schedule");
        const events = (data.events || []).filter(event => !event.league?.slug || event.league.slug === competitionId);
        form.results.set(id, recentResults(events, id));
      } catch {
        form.failed = true;
      }
    }));
    if (league.id === competitionId) renderForms();
  }
  form.loading = false;
  if (league.id === competitionId) renderForms();
}

const themeOptions = document.querySelectorAll('input[name="theme"]');
function syncThemeOptions() {
  for (const option of themeOptions) option.checked = option.value === getTheme();
}
for (const option of themeOptions) {
  option.addEventListener("change", () => {
    $("theme-status").textContent = setTheme(option.value)
      ? "Appearance saved." : "Appearance applied for this visit.";
  });
}
window.addEventListener("soccer-theme-change", syncThemeOptions);
syncThemeOptions();
setRoute();
try {
  const response = await fetch("football-catalog.json?v=7");
  if (!response.ok) throw new Error("Club catalogue unavailable");
  catalog = await response.json();
  const teams = new Map();
  for (const item of catalog) {
    item.teams = item.teams.map((team) => ({ ...team, leagueName: item.name }));
    for (const team of item.teams) {
      if (!teams.has(team.id)) teams.set(team.id, team);
      const logo = crestSource(team.logo);
      if (logo && (!clubCrests.has(team.id) || logo.startsWith("assets/clubs/"))) {
        clubCrests.set(team.id, logo);
      }
    }
  }
  allTeams = [...teams.values()];
  league = catalog.find((item) => item.id === preferences.league) || catalog[0];
  renderLeagues();
  renderFollowing();
  renderClubs();
  renderSaved();
  renderInterests();
  renderAlerts();
  await loadData();
  checkNews();
  setInterval(refreshMatches, 60000);
  setInterval(checkNews, 180000);
} catch {
  $("score-status").textContent =
    "Unable to load the app. Reload this page to try again.";
  $("news-status").textContent =
    "Club and competition data could not be loaded.";
  $("refresh").disabled = true;
}

// Reflect the existing Supabase session without delaying public football content.
async function updateAccountLink() {
  try {
    const { createAuthClient } = await import("./auth-client.js");
    const client = await createAuthClient();
    const { data, error } = await client.auth.getUser();
    if (!error && data.user) {
      const link = document.querySelector(".signin-button");
      link.replaceChildren(document.createTextNode("My account "), materialIcon("person"));
      link.href = "protected.html";
    }
  } catch {
    // Public match and news browsing remains available if account services fail.
  }
}
updateAccountLink();

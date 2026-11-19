import { competitionMark } from "./competition-marks.js?v=d160db47e2f3";
import { aliases, contains, dateLabel } from "./football-format.js?v=d160db47e2f3";
import { crest, empty, node } from "./render.js?v=d160db47e2f3";
import { recentResults } from "./match-data.js?v=d160db47e2f3";
const $ = (id) => document.getElementById(id);

export function entriesOf(data) {
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
export function hasStandings(item) {
  return !item.knockout && !item.fixturesOnly;
}

export function createStandings({ state, matchVisible, matchRow, openClub, cachedMatchData }) {
  const formCache = new Map();
  function renderTables() {
    const { league, events, groups, query, view, errors } = state();
    $("tables").replaceChildren();
    $("mini-table").replaceChildren();
    const standings = hasStandings(league);
    $("table-title").replaceChildren(competitionMark(league), node("span", standings ? league.name + " standings" : league.name + " fixtures and results"));
    $("mini-title").replaceChildren(competitionMark(league), node("span", standings ? "Top of the table" : league.name));
    $("mini-table-link").textContent = !standings ? "Match centre →" : "Full table ↗";
    $("mini-table-link").href = !standings ? "#matches" : "#standings";
    if (!standings) {
      $("form-status").textContent = "";
      $("table-season").textContent = "";
      $("table-status").textContent = (league.knockout ? "Knockout competition" : "Friendlies") + " · Fixtures and results";
      $("mini-table").append(node("p", "See fixtures and results in the Match Centre.", "subtle"));
      const cupMatches = events.filter(matchVisible);
      for (const match of cupMatches) {
        $("tables").append(node("p", dateLabel(match.date), "match-group-heading"), matchRow(match));
      }
      if (!cupMatches.length) {
        $("tables").append(empty("No matches in this selection", "Open the Match Centre to choose another date or browse upcoming fixtures.", "Open Match Centre →", "#matches"));
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
      ? errors.table
      : league.name + " · Current season, as reported by ESPN";
  }

  function renderForms() {
    const { league, groups } = state();
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
    const { league, groups } = state();
    const competitionId = league.id;
    const current = formCache.get(competitionId);
    if (current?.loading || (current && Date.now() - current.at < 300000)) return;
    const teams = [...new Set(groups.flatMap(group => group.entries.map(entry => String(entry.team.id))))];
    const form = { loading: true, results: new Map(), failed: false, at: Date.now() };
    formCache.set(competitionId, form);
    renderForms();
    for (let start = 0; start < teams.length; start += 5) {
      if (state().league.id !== competitionId) {
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
      if (state().league.id === competitionId) renderForms();
    }
    form.loading = false;
    if (state().league.id === competitionId) renderForms();
  }

  return { renderTables, loadForms };
}

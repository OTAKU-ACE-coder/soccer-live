import { competitionMark } from "./competition-marks.js?v=47eca1e6e8c3";
import { API, fetchJson } from "./api.js?v=47eca1e6e8c3";
import { asTeam, dateLabel, localDate } from "./football-format.js?v=47eca1e6e8c3";
import { empty, node } from "./render.js?v=47eca1e6e8c3";
import { filterMatchday, fixtureState, matchesForLocalDay, providerMatchDates } from "./matchday-data.js?v=47eca1e6e8c3";

export function createMatchday({ getCatalogue, matchRow, matchesTeam, followsTeam }) {
  const picker = document.getElementById("matchday-date");
  const status = document.getElementById("matchday-status");
  const results = document.getElementById("matchday-results");
  const refreshButton = document.getElementById("matchday-refresh");
  const dateButtons = [...document.querySelectorAll("[data-matchday-offset]")];
  const filters = [...document.querySelectorAll("[data-matchday-filter]")];
  const feeds = new Map();
  let active = false, offset = 0, filter = "all", selected = "", request;

  function updateDate() {
    if (offset !== null) {
      const day = new Date();
      day.setDate(day.getDate() + offset);
      picker.value = localDate(day);
    }
    if (picker.value !== selected) {
      request?.abort();
      feeds.clear();
      selected = picker.value;
    }
    for (const button of dateButtons) button.setAttribute("aria-pressed", String(Number(button.dataset.matchdayOffset) === offset));
  }

  function providerDates() {
    const start = new Date(selected + "T00:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return providerMatchDates(start, end.getTime() - 1);
  }

  function fixturesFor(item, dates) {
    return matchesForLocalDay(dates.flatMap(day => feeds.get(item.id + "/" + day) || []), selected);
  }

  function render() {
    if (!active) return;
    const focused = document.activeElement?.dataset.fixture;
    results.replaceChildren();
    let visible = 0;
    const dates = selected ? providerDates() : [];
    for (const item of getCatalogue()) {
      const events = filterMatchday(fixturesFor(item, dates), filter,
        team => matchesTeam(asTeam(team)), team => followsTeam(asTeam(team)));
      if (!events.length) continue;
      visible += events.length;
      const heading = node("h3", undefined, "match-group-heading");
      heading.append(competitionMark(item), node("span", item.name));
      results.append(heading);
      for (const event of events) {
        const row = matchRow(event, item.id);
        row.dataset.fixture = item.id + ":" + event.id;
        results.append(row);
      }
    }
    if (!visible && !refreshButton.disabled) {
      results.append(empty(feeds.size ? "No matches in this view" : "Matchday feed unavailable",
        feeds.size ? "Try a different date or filter." : "Use Refresh to try again."));
    }
    if (focused) {
      [...results.querySelectorAll("[data-fixture]")].find(row => row.dataset.fixture === focused)?.focus({ preventScroll: true });
    }
  }

  async function refresh() {
    if (!active || document.hidden) return;
    updateDate();
    const catalogue = getCatalogue();
    if (!selected || !catalogue.length || (request && !request.signal.aborted)) return;
    const signal = (request = new AbortController()).signal;
    refreshButton.disabled = true;
    status.textContent = feeds.size ? "Refreshing matchday…" : "Loading fixtures across competitions…";
    render();
    let failed = 0;
    const dates = providerDates();
    const queries = catalogue.flatMap(item => dates.map(day => ({ id: item.id, day })));
    for (let index = 0; index < queries.length; index += 8) {
      const batch = queries.slice(index, index + 8);
      const responses = await Promise.allSettled(batch.map(item =>
        fetchJson(API + item.id + "/scoreboard?dates=" + item.day, signal)));
      if (signal.aborted) return;
      responses.forEach((response, index) => {
        if (response.status === "fulfilled") feeds.set(batch[index].id + "/" + batch[index].day, response.value.events);
        else failed++;
      });
    }
    request = undefined;
    refreshButton.disabled = false;
    const events = catalogue.flatMap(item => fixturesFor(item, dates));
    const live = events.filter(event => fixtureState(event) === "live").length;
    status.textContent = !feeds.size ? "Could not load matchday scores. Use Refresh to retry."
      : dateLabel(selected + "T12:00:00") + " · " + events.length + (events.length === 1 ? " match" : " matches") +
        " · " + live + " live · Kickoffs in your local time" + (failed ? " · Some feeds could not refresh." : "");
    render();
  }

  function selectDate(nextOffset) {
    offset = nextOffset;
    updateDate();
    void refresh();
  }
  for (const button of dateButtons) {
    button.addEventListener("click", () => selectDate(Number(button.dataset.matchdayOffset)));
  }
  picker.addEventListener("change", () => selectDate(picker.value ? null : 0));
  for (const button of filters) {
    button.addEventListener("click", () => {
      filter = button.dataset.matchdayFilter;
      for (const choice of filters) choice.setAttribute("aria-pressed", String(choice === button));
      render();
    });
  }
  refreshButton.addEventListener("click", refresh);
  return {
    render, refresh,
    setActive(next) {
      if (active === next) { if (active) render(); return; }
      active = next;
      if (active) void refresh();
      else { request?.abort(); request = undefined; }
    },
  };
}

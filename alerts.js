import { competitionMark } from "./competition-marks.js?v=d160db47e2f3";
import { followsInterest } from "./news-alerts.js?v=d160db47e2f3";
import { dateLabel } from "./football-format.js?v=d160db47e2f3";
import { empty, materialIcon, node } from "./render.js?v=d160db47e2f3";
const $ = (id) => document.getElementById(id);

export function createAlerts({ preferences, getStories, getCatalogue, storyLink, savePreferences, renderNews }) {
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
    const topics = [...getCatalogue().map(item => ({
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
          const latest = getStories().filter(story => followsInterest(story, [topic.id]) && story.published)
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
      label.append(competitionMark(topic), node("span", topic.name), checkbox);
      $("interest-list").append(label);
    }
  }

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
  return { renderAlerts, renderInterests };
}

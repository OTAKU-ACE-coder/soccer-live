export function readAlertSettings(value = {}) {
  return {
    interests: Array.isArray(value.interests) ? value.interests.filter(id => typeof id === "string") : [],
    settings: { clubs: true, interests: true, general: true, ...value.settings },
    seen: Array.isArray(value.seen) ? value.seen.slice(0, 500) : [],
    inbox: Array.isArray(value.inbox)
      ? value.inbox.filter(item => item?.story?.id && Array.isArray(item.story.paragraphs)).slice(0, 30)
      : [],
    initialized: Boolean(value.initialized),
  };
}

export function followsInterest(story, ids) {
  return ids.includes(story.leagueId) || ids.includes(story.topic);
}

export function collectAlerts(state, stories, followedClub, now = Date.now()) {
  const recent = stories.filter(story => {
    const age = now - Date.parse(story.published);
    return age >= 0 && age <= 7 * 24 * 60 * 60 * 1000;
  }).sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
  const seen = new Set(state.seen);
  const incoming = [];
  for (const story of recent) {
    if (seen.has(story.id)) continue;
    seen.add(story.id);
    const reason = state.settings.clubs && followedClub(story) ? "Followed club"
      : state.settings.interests && followsInterest(story, state.interests) ? "Followed competition or topic"
      : state.settings.general ? "Football news" : "";
    if (reason) incoming.push({ story, reason, read: false });
  }
  const added = state.initialized ? incoming : incoming.slice(0, 5);
  state.inbox = [...added, ...state.inbox].slice(0, 30);
  state.seen = [...seen].slice(-500);
  state.initialized = true;
  return added.length;
}

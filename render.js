import { additionalClubBadges } from "./football-media.js?v=f32d6faa25e2";

export function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

export const clubCrests = new Map();

export function crestSource(value) {
  return typeof value === "string" && /^assets\/clubs\/[a-z0-9.-]+$/i.test(value)
    ? value
    : safeUrl(value);
}

export function crestCandidates(team) {
  const id = String(team.id ?? "");
  return [...new Set([
    crestSource(clubCrests.get(id)),
    crestSource(team.logo),
    ...(team.logos || []).map(logo => crestSource(logo?.href)),
    /^\d{1,12}$/.test(id) ? "https://a.espncdn.com/i/teamlogos/soccer/500/" + id + ".png" : "",
    /^\d{1,12}$/.test(id) ? "https://a.espncdn.com/i/teamlogos/soccer/150/" + id + ".png" : "",
  ].filter(Boolean))];
}

export function crest(team) {
  const fallback = node(
    "span",
    (team.abbreviation || team.name || "?").slice(0, 3),
    "crest-fallback",
  );
  fallback.setAttribute("aria-hidden", "true");
  const candidates = crestCandidates(team);
  if (!candidates.length) {
    void additionalClubBadges(team).then(sources => {
      if (sources.length && fallback.isConnected) {
        const badge = crest({ ...team, logo: sources[0] });
        fallback.replaceWith(badge);
      }
    });
    return fallback;
  }
  const image = node("img");
  image.alt = "";
  image.loading = "lazy";
  let triedAdditional = false;
  image.addEventListener("error", async () => {
    if (!candidates.length && !triedAdditional) {
      triedAdditional = true;
      candidates.push(...await additionalClubBadges(team));
    }
    const next = candidates.shift();
    if (next) image.src = next;
    else image.replaceWith(fallback);
  });
  image.src = candidates.shift();
  return image;
}
export function empty(title, description, linkText, href) {
  const box = node("div", undefined, "empty");
  box.append(node("strong", title), node("p", description));
  if (href) {
    const link = node("a", linkText);
    link.href = href;
    box.append(link);
  }
  return box;
}

export function materialIcon(name) {
  const icon = node("span", name, "material-symbols-outlined");
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

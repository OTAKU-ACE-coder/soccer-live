const THEME_KEY = "soccer-live-theme";
const COLORS_KEY = "soccer-live-theme-colors";
const defaultColors = { accent: "#8b5cf6", sidebar: "#102b2d" };
const modes = ["light", "dark", "custom", "system"];
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
let preference = "light";
let colors = { ...defaultColors };
try {
  const saved = localStorage.getItem(THEME_KEY);
  if (modes.includes(saved)) preference = saved;
  colors = readColors(localStorage.getItem(COLORS_KEY));
} catch { /* The default works when browser storage is unavailable. */ }

function validColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function readColors(value) {
  try {
    const saved = JSON.parse(value);
    return {
      accent: validColor(saved?.accent) ? saved.accent : defaultColors.accent,
      sidebar: validColor(saved?.sidebar) ? saved.sidebar : defaultColors.sidebar,
    };
  } catch {
    return { ...defaultColors };
  }
}

export function getThemeColors() {
  return { ...colors };
}

export function setThemeColors(next = defaultColors) {
  colors = {
    accent: validColor(next.accent) ? next.accent : defaultColors.accent,
    sidebar: validColor(next.sidebar) ? next.sidebar : defaultColors.sidebar,
  };
  applyTheme();
  try {
    localStorage.setItem(COLORS_KEY, JSON.stringify(colors));
    return true;
  } catch {
    return false;
  }
}

export function getTheme() {
  return preference;
}

function applyTheme() {
  document.documentElement.dataset.theme =
    preference === "system" ? (systemTheme.matches ? "dark" : "light") : preference === "custom" ? "dark" : preference;
  document.documentElement.dataset.appearance = preference;
  const root = document.documentElement;
  for (const key of Object.keys(defaultColors)) {
    if (preference !== "custom") root.style.removeProperty("--custom-" + key);
    else root.style.setProperty("--custom-" + key, colors[key]);
  }
}

export function setTheme(mode) {
  if (!modes.includes(mode)) return false;
  preference = mode;
  applyTheme();
  try {
    localStorage.setItem(THEME_KEY, mode);
    return true;
  } catch { return false; }
}

systemTheme.addEventListener("change", applyTheme);
window.addEventListener("storage", event => {
  if (event.key === THEME_KEY) preference = modes.includes(event.newValue) ? event.newValue : "light";
  else if (event.key === COLORS_KEY) colors = readColors(event.newValue);
  else return;
  applyTheme();
  window.dispatchEvent(new Event("soccer-theme-change"));
});
applyTheme();

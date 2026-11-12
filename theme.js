const THEME_KEY = "soccer-live-theme";
const modes = ["light", "dark", "system"];
const systemTheme = matchMedia("(prefers-color-scheme: dark)");
let preference = "light";
try {
  const saved = localStorage.getItem(THEME_KEY);
  if (modes.includes(saved)) preference = saved;
} catch { /* The default works when browser storage is unavailable. */ }

export function getTheme() {
  return preference;
}

function applyTheme() {
  document.documentElement.dataset.theme =
    preference === "system" ? (systemTheme.matches ? "dark" : "light") : preference;
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
  if (event.key !== THEME_KEY) return;
  preference = modes.includes(event.newValue) ? event.newValue : "light";
  applyTheme();
  window.dispatchEvent(new Event("soccer-theme-change"));
});
applyTheme();

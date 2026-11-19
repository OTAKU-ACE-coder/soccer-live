import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const clubs = JSON.parse(await readFile(new URL("club-player-portraits.json", root), "utf8"));
const league = JSON.parse(await readFile(new URL("player-portraits.json", root), "utf8"));
clubs.lionelmessi = "https://images.mlssoccer.com/image/private/t_thumb_squared/f_png/mls-mia/g9tieb27bu41atzhhskt.png";
clubs.ronaldovasquez = "https://sfc.az/disk/footballers/Ronaldo%20Jr.png";
let previous = {};
try { previous = JSON.parse(await readFile(new URL("current-player-portraits.json", root), "utf8")); } catch {}
const identities = Object.entries(previous).filter(([id]) => /^\d+$/.test(id)).map(([id, file]) =>
  [id, Object.keys(previous).find(name => /[^0-9]/.test(name) && previous[name] === file)]);
const names = [...new Set([...Object.keys(clubs), ...Object.keys(league)])];
await mkdir(new URL("assets/players/current/", root), { recursive: true });
const manifest = {};
const sources = {};
const downloads = new Map();
let cursor = 0, checked = 0;
async function download(url) {
  if (!downloads.has(url)) downloads.set(url, (async () => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(6500) });
      const type = response.headers.get("content-type")?.split(";")[0];
      if (!response.ok || !["image/png", "image/jpeg", "image/webp"].includes(type)) return "";
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length < 1000 || data.length > 3000000) return "";
      const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const hash = createHash("sha256").update(data).digest("hex").slice(0,24);
      const file = "assets/players/current/" + hash + "." + extension;
      await writeFile(new URL(file, root), data);
      sources[file] = { url, checked: new Date().toISOString().slice(0,10), publisher: new URL(url).hostname };
      return file;
    } catch { return ""; }
  })());
  return downloads.get(url);
}
async function run() {
  while (cursor < names.length) {
    const name = names[cursor++];
    const urls = [clubs[name], /^\d+$/.test(league[name] || "") ? "https://resources.premierleague.com/premierleague/photos/players/250x250/p" + league[name] + ".png" : ""].filter(Boolean);
    for (const url of urls) {
      const file = await download(url);
      if (file) { manifest[name] = file; break; }
    }
    if (++checked % 100 === 0) console.log("Checked official portrait aliases:", checked, "/", names.length);
  }
}
await Promise.all(Array.from({ length: 8 }, run));
for (const [id, name] of [...identities, ["45843", "lionelmessi"], ["272248", "ronaldovasquez"]]) {
  if (manifest[name]) manifest[id] = manifest[name];
}
await writeFile(new URL("current-player-portraits.json", root), JSON.stringify(manifest, null, 2) + "\n");
await writeFile(new URL("assets/players/current/sources.json", root), JSON.stringify(sources, null, 2) + "\n");
console.log(JSON.stringify({ aliasesChecked: names.length, availableAliases: Object.keys(manifest).length, uniquePortraits: Object.keys(sources).length }));

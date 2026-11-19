import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const catalog = JSON.parse(await readFile(new URL("football-catalog.json", root), "utf8"));
const teams = [...new Map([...catalog.flatMap(league => league.teams), { id: "2674", name: "Santos" }].map(team => [String(team.id), team])).values()];
await mkdir(new URL("assets/clubs/", root), { recursive: true });
let previous = {};
try { previous = JSON.parse(await readFile(new URL("club-badges.json", root), "utf8")); } catch {}
const manifest = { ...previous };
const missing = [];
let index = 0;
async function download() {
  while (index < teams.length) {
    const team = teams[index++];
    if (!/^\d{1,12}$/.test(team.id)) continue;
    if (previous[team.id]?.startsWith("assets/clubs/")) {
      try { await stat(new URL(previous[team.id], root)); manifest[team.id] = previous[team.id]; continue; } catch {}
    }
    if (team.logo?.startsWith("assets/clubs/")) {
      try { await stat(new URL(team.logo, root)); manifest[team.id] = team.logo; continue; } catch {}
    }
    const file = "assets/clubs/" + team.id + ".png";
    try { if ((await stat(new URL(file, root))).size > 100) {manifest[team.id] = file; continue;} } catch {}
    const urls = ["https://a.espncdn.com/i/teamlogos/soccer/150/" + team.id + ".png", "https://a.espncdn.com/i/teamlogos/soccer/500/" + team.id + ".png", team.logo];
    for (const url of [...new Set(urls.filter(value => value?.startsWith("https://")))]) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png")) continue;
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 100 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") continue;
        await writeFile(new URL(file, root), buffer);
        manifest[team.id] = file;
        break;
      } catch {}
    }
    if (!manifest[team.id]) missing.push({ id: team.id, name: team.name });
  }
}
await Promise.all(Array.from({ length: 8 }, download));
await writeFile(new URL("club-badges.json", root), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ available: Object.keys(manifest).length, total: teams.length, missing }));

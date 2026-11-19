import { readFile, writeFile, mkdir } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const names = ["neymar", "neymarjr", "kylianmbappe", "erlinghaaland", "viniciusjr", "viniciusjunior", "lamineyamal", "bukayosaka", "mohamedsalah", "judebellingham", "colepalmer", "pedri", "gavi", "raphinha", "robertlewandowski", "harrykane", "kevindebruyne", "sonheungmin", "lukamodric", "tonikroos", "andresiniesta", "zlatanibrahimovic", "ronaldinho", "sergioramos", "alphonsodavies", "ousmanedembele", "brunofernandes", "bernardosilva", "rodri", "declanrice", "virgilvandijk", "alisson", "thibautcourtois", "achrafhakimi", "victorosimhen", "victorgyokeres", "luisdiaz", "alexanderisak", "florianwirtz"];
await mkdir(new URL("assets/players/", root), { recursive: true });
const manifest = {};
const files = new Map();
const missing = [];
let index = 0;
async function download() {
  while (index < names.length) {
    const name = names[index++];
    try {
      const bucket = JSON.parse(await readFile(new URL("assets/portrait-index/" + name[0] + ".json", root), "utf8"));
      const hash = bucket[name];
      if (!/^[a-f0-9]{64}$/.test(hash || "")) throw Error("No unambiguous portrait");
      if (files.has(hash)) { manifest[name] = files.get(hash); continue; }
      const response = await fetch("https://assets.footylogos.com/player-pngs/previews/v1/" + hash + ".webp", { signal: AbortSignal.timeout(10000) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/webp")) throw Error("Image unavailable");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") throw Error("Invalid image");
      const file = "assets/players/" + name + ".webp";
      await writeFile(new URL(file, root), buffer);
      manifest[name] = file;
      files.set(hash, file);
    } catch { missing.push(name); }
  }
}
await Promise.all(Array.from({ length: 5 }, download));
await writeFile(new URL("player-local-portraits.json", root), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ portraits: Object.keys(manifest).length, missing }));

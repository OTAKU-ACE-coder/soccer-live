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

const queries = {
 neymar:"Neymar", neymarjr:"Neymar", kylianmbappe:"Kylian Mbappe", erlinghaaland:"Erling Haaland",
 viniciusjr:"Vinicius Junior",viniciusjunior:"Vinicius Junior",lamineyamal:"Lamine Yamal",bukayosaka:"Bukayo Saka",
 mohamedsalah:"Mohamed Salah",judebellingham:"Jude Bellingham",colepalmer:"Cole Palmer",pedri:"Pedri",
 raphinha:"Raphinha",robertlewandowski:"Robert Lewandowski",harrykane:"Harry Kane",kevindebruyne:"Kevin De Bruyne",
 sonheungmin:"Son Heung-Min",lukamodric:"Luka Modric",alphonsodavies:"Alphonso Davies",ousmanedembele:"Ousmane Dembele",
 brunofernandes:"Bruno Fernandes",bernardosilva:"Bernardo Silva",declanrice:"Declan Rice",virgilvandijk:"Virgil van Dijk",
 thibautcourtois:"Thibaut Courtois",achrafhakimi:"Achraf Hakimi",victorosimhen:"Victor Osimhen",luisdiaz:"Luis Diaz",
 alexanderisak:"Alexander Isak",florianwirtz:"Florian Wirtz"
};
const key = name => name.normalize("NFKD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9]/g,"");
let byID = {};
try { byID = JSON.parse(await readFile(new URL("player-local-portraits.json",root),"utf8")); } catch {}
for (let offset=0;offset<Object.keys(manifest).length;offset+=5) {
 await Promise.all(Object.entries(manifest).slice(offset,offset+5).map(async ([name,file]) => {
  if (!queries[name]) return;
  try {
   const url = "https://site.web.api.espn.com/apis/search/v2?" + new URLSearchParams({query:queries[name],type:"player",limit:"100"});
   const data = await (await fetch(url,{signal:AbortSignal.timeout(10000)})).json();
   const matches = data.results?.flatMap(group=>group.contents || []).filter(player=>player.sport==="soccer" && key(player.displayName)===key(queries[name]));
   // A short name can belong to different people. Only an exact, unique ID is safe.
   const id = name.startsWith("neymar") ? "132948" : matches?.length===1 ? /~a:(\d+)$/.exec(matches[0].uid)?.[1] : "";
   if (id) byID[id] ??= file;
  } catch {}
 }));
}
await writeFile(new URL("player-local-portraits.json",root),JSON.stringify(byID,null,2)+"\n");
console.log("ID-verified local portraits:",Object.keys(byID).length);

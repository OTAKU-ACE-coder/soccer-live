import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const isBrowserText = (name) => /\.(html|css|js)$/.test(name) && !name.endsWith(".test.js");
const names = (await readdir(root, { withFileTypes: true }))
  .filter(entry => entry.isFile() && (isBrowserText(entry.name) || entry.name.endsWith(".json") && !entry.name.startsWith("package")))
  .map(entry => entry.name).concat("vendor/supabase.js").sort();
const files = new Map(await Promise.all(names.map(async file =>
  [file, (await readFile(resolve(root, file), "utf8")).replace(/\r\n/g, "\n")])));
const references = /(["'])(\.\/)?([a-zA-Z0-9_/-]+\.(?:js|css|json))(?:\?v=[a-zA-Z0-9]+)?\1/g;
function versioned(contents, revision) {
  return contents.replace(references, (match, quote, dot, file) => files.has(file)
    ? quote + (dot || "") + file + (revision ? "?v=" + revision : "") + quote : match);
}

const hash = createHash("sha256");
for (const [file, contents] of files) {
  const source = isBrowserText(file) && !file.startsWith("vendor/") ? versioned(contents, "") : contents;
  hash.update(JSON.stringify([file, source]));
}
const revision = hash.digest("hex").slice(0, 12);
const changed = [];
for (const [file, contents] of files) {
  if (!isBrowserText(file) || file.startsWith("vendor/")) continue;
  const generated = versioned(contents, revision);
  if (generated === contents) continue;
  changed.push(file);
  if (!process.argv.includes("--check")) await writeFile(resolve(root, file), generated);
}
if (process.argv.includes("--check") && changed.length) {
  console.error("Stale browser assets. Run npm run release. Files: " + changed.join(", "));
  process.exitCode = 1;
} else console.log("Browser asset revision " + revision);

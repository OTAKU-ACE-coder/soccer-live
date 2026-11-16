import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const path = (name) => new URL(name, root);
const lock = JSON.parse(await readFile(path("package-lock.json"), "utf8"));
const sdk = "node_modules/@supabase/supabase-js";
const code = await readFile(path(sdk + "/dist/umd/supabase.js"), "utf8");
await mkdir(path("vendor"), { recursive: true });
await writeFile(path("vendor/supabase.js"),
  "// @supabase/supabase-js " + lock.packages[sdk].version + " (npm browser bundle). See LICENSES.txt.\n" +
  code.trimEnd() + "\nexport const { createClient } = supabase;\n");
const licenses = [];
for (const [folder, entry] of Object.entries(lock.packages)) {
  if (!folder || entry.dev) continue;
  const names = ["LICENSE", "LICENSE.txt", "LICENSE.md", "CopyrightNotice.txt"];
  const texts = await Promise.all(names.map(name => readFile(path(folder + "/" + name), "utf8").catch(() => "")));
  if (!texts.some(Boolean)) throw new Error("License not found for " + folder);
  licenses.push(folder.replace("node_modules/", "") + " " + entry.version + "\n\n" +
    texts.filter(Boolean).map(text => text.replace(/\r\n/g, "\n").trimEnd()).join("\n\n"));
}
await writeFile(path("vendor/LICENSES.txt"), licenses.join("\n\n" + "-".repeat(72) + "\n\n") + "\n");

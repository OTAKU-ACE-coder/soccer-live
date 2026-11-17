const indexFiles = new Map();
const revision = new URL(import.meta.url).search;
const previewBase = "https://assets.footylogos.com/player-pngs/previews/v1/";

function portraitIndexFile(bucket) {
  if (!indexFiles.has(bucket)) {
    const request = fetch("assets/portrait-index/" + bucket + ".json" + revision, { signal: AbortSignal.timeout(7500) })
      .then(response => {
        if (!response.ok) throw new Error("Portrait index unavailable");
        return response.json();
      })
      .catch(() => {
        indexFiles.delete(bucket);
        return {};
      });
    indexFiles.set(bucket, request);
  }
  return indexFiles.get(bucket);
}

export async function cataloguePortraits(names) {
  const keys = [...new Set(names.filter(Boolean).map(name => name.normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{Letter}\p{Number}]/gu, "")))];
  const sources = await Promise.all(keys.filter(key => key.length >= 5).map(async key => {
    const index = await portraitIndexFile(/^[a-z]/.test(key) ? key[0] : "other");
    const hash = index[key];
    return typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash) ? previewBase + hash + ".webp" : "";
  }));
  return [...new Set(sources.filter(Boolean))];
}

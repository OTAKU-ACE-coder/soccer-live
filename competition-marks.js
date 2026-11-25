import { node } from "./render.js?v=8d1f1bfe1aa0";

const sharedEmblems = {
  "caf.nations_qual": "caf.nations",
  "fifa.friendly.w": "fifa.friendly",
};

export function competitionMark(competition) {
  const id = sharedEmblems[competition.id] || competition.id;
  const image = node("img", undefined, "competition-mark");
  image.alt = "";
  image.width = 36;
  image.height = 36;
  image.decoding = "async";
  image.addEventListener("error", () => {
    image.hidden = true;
  }, { once: true });
  image.src = "assets/competitions/" + id + (id === "fra.1" ? ".webp" : ".png");
  return image;
}

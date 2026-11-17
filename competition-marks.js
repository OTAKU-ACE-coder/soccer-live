import { node } from "./render.js?v=3b5152491c6b";

const marks = {
  "eng.1": ["PL", "plum", "shield"],
  "esp.1": ["LL", "scarlet", "pitch"],
  "ger.1": ["BL", "scarlet", "pitch"],
  "ita.1": ["SA", "cobalt", "shield"],
  "fra.1": ["L1", "ink", "pitch"],
  "uefa.champions": ["UCL", "ink", "globe"],
  "eng.fa": ["FA", "scarlet", "cup"],
  "eng.league_cup": ["EFL", "forest", "cup"],
  "uefa.nations": ["UNL", "cobalt", "shield"],
  "caf.nations_qual": ["AFQ", "forest", "shield"],
  "concacaf.nations.league": ["CNL", "cobalt", "globe"],
  "fifa.friendly": ["INT", "ink", "globe"],
  "fifa.friendly.w": ["WIF", "plum", "globe"],
  "fifa.world": ["WC", "bronze", "cup"],
  "fifa.wwc": ["WWC", "plum", "cup"],
  "caf.nations": ["AFN", "forest", "cup"],
  "ballon-dor": ["BD", "bronze", "globe"],
};

export function competitionMark(competition) {
  const [initials, tone, shape] = marks[competition.id]
    || [competition.name.slice(0, 3).toUpperCase(), "forest", "shield"];
  const badge = node("span", undefined, "competition-mark");
  badge.dataset.tone = tone;
  badge.dataset.shape = shape;
  badge.setAttribute("aria-hidden", "true");
  badge.append(node("span", undefined, "competition-mark-symbol"), node("b", initials));
  return badge;
}

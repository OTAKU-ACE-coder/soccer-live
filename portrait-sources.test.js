import test from "node:test";
import assert from "node:assert/strict";
import { portraitCandidates, portraitSource } from "./portrait-sources.js";

test("current official headshots take priority over legacy cached pictures", () => {
  const candidates = portraitCandidates({id:"22774",displayName:"Cristiano Ronaldo"},{
    current:{"22774":"assets/players/current/official.webp",cristianoronaldo:"assets/players/current/official.webp"},
    clubs:{cristianoronaldo:"https://league.example/current.png"},
    local:{"22774":"assets/players/22774-portrait.png"}
  });
  assert.equal(candidates[0],"assets/players/current/official.webp");
  assert.equal(new Set(candidates).size,candidates.length);
  assert.ok(candidates.indexOf("assets/players/22774-portrait.png") > candidates.indexOf("https://league.example/current.png"));
});
test("short-name matches require a verified player ID instead of borrowing another person's photo", () => {
  const index={current:{pedri:"assets/players/current/pedri.webp","250465":"assets/players/current/pedri.webp"}};
  assert.equal(portraitCandidates({id:"250465",displayName:"Pedri"},index)[0],"assets/players/current/pedri.webp");
  assert.ok(!portraitCandidates({id:"999",displayName:"Pedri"},index).includes("assets/players/current/pedri.webp"));
});
test("portrait sources accept only safe local image paths and HTTPS URLs", () => {
  assert.equal(portraitSource("assets/players/current/photo.webp"),"assets/players/current/photo.webp");
  assert.equal(portraitSource("assets/players/../../config.js"),"");
  assert.equal(portraitSource("javascript:alert(1)"),"");
  assert.equal(portraitSource("http://images.example/player.png"),"");
});

test("accented squad names resolve to the stored portrait", () => {
  const photo = "assets/players/current/head.jpg";
  assert.equal(portraitCandidates({displayName:"Joakim Mæhle"}, {current:{joakimmaehle:photo}})[0], photo);
});

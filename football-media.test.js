import test from "node:test";
import assert from "node:assert/strict";
import { birthday, matchedPortraits, matchedBadges } from "./football-media.js";
import { directoryResults } from "./football-directory.js";
const player = { displayName: "Ronaldo Vieira", displayDOB: "19/7/1998", team: { displayName: "San Jose Earthquakes" } };
const picture = { strPlayer: "Ronaldo Vieira", strSport: "Soccer", dateBorn: "1998-07-19", strTeam: "San Jose Earthquakes", strCutout: "https://images.example/vieira.png", strThumb: "https://images.example/vieira.jpg" };
test("portrait matching uses day/month birth dates and rejects namesakes", () => {
  assert.equal(birthday("19/7/1998"), "1998-07-19");
  assert.deepEqual(matchedPortraits(player, [picture]), [picture.strCutout, picture.strThumb]);
  assert.deepEqual(matchedPortraits(player, [{ ...picture, dateBorn: "1990-07-19" }]), []);
  assert.deepEqual(matchedPortraits(player, [{ ...picture, strSport: "Basketball" }]), []);
  assert.deepEqual(matchedPortraits(player, [picture, picture]), []);
  assert.deepEqual(matchedPortraits({ displayName: "Ronaldo Vieira" }, [picture]), []);
});
test("club badge matching requires a unique football club and handles club prefixes", () => {
  const badge = { strTeam: "Lunda Sul", strSport: "Soccer", strBadge: "https://images.example/lunda.png" };
  assert.deepEqual(matchedBadges({ name: "C.D. Lunda Sul" }, [badge]), [badge.strBadge]);
  assert.deepEqual(matchedBadges({ name: "Santos" }, [badge]), []);
  assert.deepEqual(matchedBadges({ name: "Lunda Sul" }, [badge, badge]), []);
});
test("short searches retain provider relevance instead of promoting unknown namesakes", () => {
  const data={results:[{type:"player",contents:[{uid:"s:600~a:22774",displayName:"Cristiano Ronaldo",sport:"soccer"},{uid:"s:600~a:999",displayName:"Ronaldo",sport:"soccer"}]}]};
  assert.equal(directoryResults(data,"Ronaldo").players[0].id,"22774");
});
test("Wikipedia portrait recovery requires the player's name, football biography and exact birthday", async () => {
  const { matchedWikiPortrait } = await import("./football-media.js");
  const retired = { displayName: "Toni Kroos", displayDOB: "4/1/1990" };
  const page = { title: "Toni Kroos", extract: "Toni Kroos (born 4 January 1990) is a German former professional footballer.", thumbnail: { source: "https://upload.wikimedia.org/kroos.jpg" } };
  assert.equal(matchedWikiPortrait(retired, [page]), page.thumbnail.source);
  assert.equal(matchedWikiPortrait(retired, [{ ...page, extract: "Toni Kroos (born 4 January 1980) is a footballer." }]), "");
  assert.equal(matchedWikiPortrait(retired, [{ ...page, title: "Another Player" }]), "");
  assert.equal(matchedWikiPortrait(retired, [page, page]), "");
});

test("a failed Wikipedia image can continue to an independent portrait source", async t => {
  const { additionalPortraits } = await import("./football-media.js");
  const original = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = original; });
  const player = { displayName: "Regression Example", displayDOB: "1/6/1990" };
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).includes("wikipedia.org")) return Response.json({query:{pages:{1:{
      title:"Regression Example",
      extract:"Regression Example (born 1 June 1990) is a footballer.",
      thumbnail:{source:"https://images.example/broken-wiki.jpg"}
    }}}});
    return Response.json({player:[{
      strPlayer:"Regression Example",strSport:"Soccer",dateBorn:"1990-06-01",
      strCutout:"https://images.example/working-portrait.png"
    }]});
  };
  assert.deepEqual(await additionalPortraits(player), ["https://images.example/broken-wiki.jpg"]);
  assert.deepEqual(await additionalPortraits(player, true), ["https://images.example/working-portrait.png"]);
  assert.equal(calls.length, 2);
});

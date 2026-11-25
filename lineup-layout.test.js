import test from "node:test";
import assert from "node:assert/strict";
import { lineupRows } from "./lineup-layout.js";

test("formation rows preserve every confirmed starter without duplicating bench players", () => {
  const roster = Array.from({ length: 12 }, (_, i) => ({
    starter: i < 11,
    athlete: { id: String(i) },
    formationPlace: i + 1,
    position: {
      displayName:
        i === 0
          ? "Goalkeeper"
          : i < 5
          ? "Defender"
          : i < 10
          ? "Midfielder"
          : "Forward",
    },
  }));

  const rows = lineupRows(roster, "4-2-3-1");

  assert.deepEqual(
    rows.map((r) => r.length),
    [1, 4, 2, 3, 1]
  );
  assert.equal(new Set(rows.flat().map((p) => p.athlete.id)).size, 11);
  assert.equal(lineupRows(roster, "unknown").length, 1);
});

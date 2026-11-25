function depth(player) {
  const role = player.position?.displayName || "";
  if (/goalkeeper/i.test(role)) return 0;
  if (/defender|back/i.test(role)) return 1;
  if (/defensive midfielder/i.test(role)) return 2;
  if (/attacking midfielder/i.test(role)) return 4;
  if (/forward|striker/i.test(role)) return 5;
  return 3;
}

function width(player) {
  const role = player.position?.displayName || "";
  const magnitude = /cent(?:er|re)/i.test(role) ? 1 : 2;
  if (/left/i.test(role)) return -magnitude;
  if (/right/i.test(role)) return magnitude;
  return 0;
}

export function lineupRows(roster, formation) {
  const starters = roster.filter(player => player.starter === true);
  const counts = String(formation || "").split("-").map(Number);
  if (starters.length !== 11 || counts.some(n => !Number.isInteger(n) || n < 1 || n > 5) ||
      counts.reduce((a, b) => a + b, 0) !== 10) return [starters];

  const ordered = [...starters].sort((a, b) => depth(a) - depth(b) ||
    Number(a.formationPlace || 0) - Number(b.formationPlace || 0));
  let cursor = 1;
  const rows = [ordered.slice(0, cursor)];
  for (const count of counts) {
    rows.push(ordered.slice(cursor, cursor + count).sort((a, b) => width(a) - width(b)));
    cursor += count;
  }
  return rows;
}

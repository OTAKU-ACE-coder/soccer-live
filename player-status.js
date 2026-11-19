const retirements = {
  "103173": { name: "Toni Kroos", year: 2024, source: "Real Madrid", url: "https://www.realmadrid.com/en-US/news/club/announcements/comunicado-oficial-toni-kroos-21-05-2024" },
  "11001": { name: "Zlatan Ibrahimovic", year: 2023, source: "Premier League", url: "https://www.premierleague.com/en/news/3529753" },
  "17566": { name: "Andrés Iniesta", year: 2024, source: "FC Barcelona", url: "https://www.fcbarcelona.com/en/football/first-team/news/4145426/andres-iniesta-announces-retirement" },
  "121893": { name: "Sergio Busquets", year: 2025, source: "FC Barcelona", url: "https://www.fcbarcelona.com/en/news/4415821/dream-ending-for-jordi-alba-and-sergio-busquets/amp" },
  "121021": { name: "Jordi Alba", year: 2025, source: "FC Barcelona", url: "https://www.fcbarcelona.com/en/news/4415821/dream-ending-for-jordi-alba-and-sergio-busquets/amp" },
  "45931": { name: "Gerard Piqué", year: 2022, source: "FIFA", url: "https://www.fifa.com/en/articles/gerard-pique-retirement-spain-barcelona-world-cup-2010-trophies" },
  "52767": { name: "Pepe", year: 2024, source: "Real Madrid", url: "https://www.realmadrid.com/en-US/news/club/announcements/co-08-08-2024" },
  "101390": { name: "Eden Hazard", year: 2023, source: "Real Madrid", url: "https://www.realmadrid.com/en-US/news/club/announcements/official-announcement-eden-hazard-10-10-2023" },
  "20128": { name: "Ronaldinho", year: 2018, source: "FIFA", url: "https://inside.fifa.com/en/news/ronaldinho-calls-time-on-mesmerising-career-2926508" },
  "44927": { name: "Sergio Agüero", year: 2021, source: "FC Barcelona", url: "https://www.fcbarcelona.com/en/news/2416373" },
  "77653": { name: "Gareth Bale", year: 2023, source: "Real Madrid", url: "https://www.realmadrid.com/en-US/news/club/announcements/official-announcement-gareth-bale-farewell" },
  "84775": { name: "Mesut Özil", year: 2023, source: "Premier League", url: "https://www.premierleague.com/en/news/3118777" },
  "11811": { name: "Iker Casillas", year: 2020, source: "FIFA", url: "https://inside.fifa.com/news/casillas-hangs-up-his-gloves" },
  "19295": { name: "Iker Casillas", year: 2020, source: "FIFA", url: "https://inside.fifa.com/news/casillas-hangs-up-his-gloves" },
};

// Dated club reports supplement missing provider fields. An older report remains
// visible as history while its current availability label becomes unconfirmed.
const injuryReports = {
  "236721": {
    injury: "Muscle fibre tear in the left hamstring",
    availability: "Sidelined; return date not announced",
    reported: "2026-11-16",
    reviewed: "2026-11-19",
    source: "FC Bayern München",
    url: "https://fcbayern.com/de/news/2026/11/alphonso-davies-faellt-vorerst-aus",
  },
};

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function playerStatus(player, now = Date.now()) {
  const retirement = retirements[String(player.id)];
  const state = [player.status?.name, player.status?.type, player.status?.abbreviation].map(text).join(" ").toLowerCase();
  if (retirement || player.retired === true || /\bretired\b/.test(state)) {
    return { kind: "retired", label: "Retired", ...retirement };
  }

  const injuries = Array.isArray(player.injuries) ? player.injuries : [];
  const injury = injuries.find(item => {
    const status = text(item.status?.name || item.status).toLowerCase();
    const date = Date.parse(item.date || item.updated || "");
    return !/resolved|recovered|cleared/.test(status) && (!Number.isFinite(date) || now - date < 30 * 86400000);
  });
  if (injury || player.injured === true || /\binjured\b/.test(state)) {
    return {
      kind: "injured",
      label: "Injured",
      injury: text(injury?.details?.type) || text(injury?.type) || text(injury?.description) || text(injury?.details?.detail) || "Injury details unavailable",
      availability: text(injury?.status?.description) || text(injury?.status?.name) || text(injury?.status) || "Return date not announced",
      reported: text(injury?.date || injury?.updated).slice(0, 10),
    };
  }

  const report = injuryReports[String(player.id)];
  if (report) {
    const fresh = now >= Date.parse(report.reported) && now - Date.parse(report.reviewed) < 14 * 86400000;
    return { ...report, kind: fresh ? "injured" : "unconfirmed", label: fresh ? "Injured" : "Injury update needed", historical: !fresh };
  }
  if (player.active === true || /\bactive\b/.test(state) && !/\binactive\b/.test(state)) {
    return { kind: "playing", label: "Playing" };
  }
  if (player.active === false || /\binactive\b/.test(state)) {
    return { kind: "unconfirmed", label: "Career status unconfirmed" };
  }
  return { kind: "unconfirmed", label: "Status unavailable" };
}

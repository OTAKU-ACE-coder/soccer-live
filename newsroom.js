const guides = [
  {
    id: "guide-reading-a-league-table",
    title: "Beyond the points column: how to read a league table",
    category: "Explainer",
    summary: "Games in hand, goal difference and uneven schedules can change the picture.",
    teams: [],
    paragraphs: [
      "Start with matches played. Two clubs separated by three points may be closer than they look if one has played a game fewer. A game in hand is an opportunity to earn points, but the opponent and venue matter.",
      "Next, look at goal difference. It measures goals scored minus goals conceded across the season. A positive number can help explain a club’s position, though a single large win can distort it early in the campaign.",
      "Check the competition’s rules before drawing conclusions from a tie on points. Some competitions use goal difference, others prioritise head-to-head results, and knockout qualification can introduce additional criteria.",
      "Use the league tables in Soccer Live alongside the match centre. The table shows where a club stands now. The fixtures tell you which opportunities remain."
    ]
  },
  {
    id: "guide-possession-and-shots",
    title: "Why having the ball doesn’t always mean controlling the game",
    category: "Tactical guide",
    summary: "Read possession, shots and shots on target together for a clearer picture.",
    teams: [],
    paragraphs: [
      "Possession measures how much of the ball a side had. It cannot tell you where that possession took place. A team may complete long spells of passing far from goal, while its opponent creates danger with a handful of quick attacks.",
      "Shot totals add context. Shots on target help distinguish attempts that forced a save or scored from attempts that went wide or were blocked. Even then, an effort from distance and a one-on-one chance both count as one attempt.",
      "The score can change a match’s rhythm. A leading side may defend deeper and invite pressure, while a trailing team takes more risks. Treat the numbers as clues to the match rather than a verdict on performance."
    ]
  },
  {
    id: "guide-matchday-view",
    title: "From kickoff to full time: what a match feed can tell you",
    category: "Matchday guide",
    summary: "A practical guide to match status, local kickoff times and delayed updates.",
    teams: [],
    paragraphs: [
      "A scheduled match shows its kickoff time in your local timezone. Once play begins, the score feed can report goals and match status. Updates depend on when the provider records them, so the app can briefly trail the action.",
      "A final score records the result. The match details can add context such as the venue, possession and attempts, where those figures are available.",
      "Use the competition selector and match date to revisit a result. Follow clubs to narrow the match list and prioritise their reports in your newsroom."
    ]
  }
];

const awards = {
  id: "ballon-dor-2026-kane-putellas",
  title: "Harry Kane and Alexia Putellas win the 2026 Ballon d’Or",
  category: "Ballon d’Or",
  topic: "ballon-dor",
  published: "2026-10-26T22:00:00Z",
  summary: "The 70th edition crowned the England forward and the Spain midfielder at the London Palladium.",
  teams: [],
  paragraphs: [
    "Harry Kane took the men’s award and Alexia Putellas took the women’s award at the London ceremony on 26 October.",
    "Kane also collected the Gerd Müller Trophy for men’s Striker of the Year. Putellas won the domestic quadruple and the UEFA Women’s Champions League with Barcelona in 2025–26 before moving to London City Lionesses in July.",
    "It was the first Ballon d’Or ceremony in London. The location marked 70 years since England’s Stanley Matthews won the inaugural award in 1956."
  ],
  credit: "Results and ceremony details confirmed by Ballon d’Or and UEFA."
};

const novemberMatchday = [
  {
    id: "nations-league-final-matchday-2026-11-17",
    title: "The Nations League group phase reaches its final night",
    category: "UEFA Nations League · Preview",
    leagueId: "uefa.nations",
    published: "2026-11-17T00:00:00Z",
    summary: "Denmark face Norway and Wales meet Portugal as the final League A fixtures set up Friday’s draw.",
    teams: [], matchday: true,
    paragraphs: [
      "The last night of the 2026/27 UEFA Nations League group phase is on Tuesday, 17 November. Denmark host Norway and Wales host Portugal in Group A4. League B also concludes with fixtures including Poland against Sweden and the Republic of Ireland against Kosovo.",
      "Those results will settle the final group positions. Follow the score changes in Matchday and switch to the group tables to see where each team finishes.",
      "The knockout stage and play-off draw is scheduled for Friday, 20 November, at noon Central European Time."
    ],
    credit: "Schedule and draw timing confirmed by UEFA."
  },
  {
    id: "afcon-qualifying-november-2026",
    title: "What November’s AFCON qualifiers mean for the 2027 race",
    category: "AFCON Qualifying · Qualification guide",
    leagueId: "caf.nations_qual",
    published: "2026-11-17T00:00:00Z",
    summary: "The November matches take the qualifying groups past halfway ahead of the final rounds in March.",
    teams: [], matchday: true,
    paragraphs: [
      "The November international window covers rounds three and four of qualification for the 2027 Africa Cup of Nations. The final two rounds are scheduled for March 2027.",
      "Co-hosts Kenya, Tanzania and Uganda have automatic places at the finals. In each group containing a host, the best-placed remaining team also qualifies. In the other groups, the top two qualify.",
      "The tournament is scheduled to run from 19 June to 17 July 2027. Check the AFCON Qualifying tables for the latest group positions."
    ],
    credit: "Qualification format and dates confirmed by CAF."
  },
  {
    id: "concacaf-quarterfinals-november-2026",
    title: "Concacaf quarter-finals close with two Gold Cup places in play",
    category: "Concacaf Nations League · Preview",
    leagueId: "concacaf.nations.league",
    published: "2026-11-17T00:00:00Z",
    summary: "The United States host Haiti and Mexico host Jamaica on the final day of November’s League A quarter-finals.",
    teams: [], matchday: true,
    paragraphs: [
      "The remaining two quarter-final second legs are scheduled for Tuesday, 17 November in the host time zones. The United States play Haiti in Cincinnati, and Mexico face Jamaica in Monterrey.",
      "The aggregate winners advance to the Nations League Finals in March 2027 and qualify for the 2027 Gold Cup. The losing sides move into Gold Cup preliminary qualifying.",
      "Matchday shows kickoff times in your local time zone. The later fixtures can appear on Wednesday for viewers outside North America."
    ],
    credit: "Fixtures and qualification rules confirmed by Concacaf."
  }
];

export const editorialStories = [...novemberMatchday, awards, ...guides];

export function buildReports(events, league) {
  const reports = new Map();
  for (const event of events) {
    const match = event.competitions?.[0];
    const status = match?.status?.type || event.status?.type;
    if (!match || !status?.completed || status.state !== "post" || !/^\d+$/.test(event.id) ||
        !Number.isFinite(Date.parse(event.date))) continue;
    const home = match.competitors?.find(team => team.homeAway === "home");
    const away = match.competitors?.find(team => team.homeAway === "away");
    if (!home?.team?.displayName || !away?.team?.displayName ||
        !/^\d+$/.test(home.score ?? "") || !/^\d+$/.test(away.score ?? "")) continue;
    const homeName = home.team.displayName;
    const awayName = away.team.displayName;
    const score = home.score + "–" + away.score;
    const homeGoals = Number(home.score);
    const awayGoals = Number(away.score);
    const venue = match.venue?.fullName;
    const reportDate = new Date(event.date).toISOString().slice(0, 10).replaceAll("-", "");
    const id = league.id + "~" + reportDate + "~" + event.id;
    const result = homeGoals === awayGoals
      ? homeName + " and " + awayName + " finished level in " + league.name + "."
      : (homeGoals > awayGoals ? homeName : awayName) + " won the " + league.name + " meeting" + (venue ? " at " + venue : "") + ".";
    const details = (team, stat) => team.statistics?.find(item => item.name === stat)?.displayValue;
    const stats = [
      ["totalShots", "total shots"],
      ["shotsOnTarget", "shots on target"],
      ["wonCorners", "corners"]
    ].filter(([key]) => details(home, key) !== undefined && details(away, key) !== undefined);
    const paragraphs = [
      "The final score was " + homeName + " " + home.score + ", " + awayName + " " + away.score + "." +
      (venue ? " The fixture took place at " + venue + "." : "")
    ];
    const possessionHome = details(home, "possessionPct");
    const possessionAway = details(away, "possessionPct");
    if (possessionHome !== undefined && possessionAway !== undefined) {
      paragraphs.push(homeName + " recorded " + possessionHome + "% possession, with " + possessionAway + "% for " + awayName + ".");
    }
    if (stats.length) {
      paragraphs.push(stats.map(([key, label]) => homeName + " had " + details(home, key) + " " + label + " to " + awayName + "’s " + details(away, key) + ".").join(" "));
    }
    if (Number.isInteger(match.attendance) && match.attendance > 0) {
      paragraphs.push("The recorded attendance was " + match.attendance.toLocaleString() + ".");
    }
    const team = competitor => ({ id: String(competitor.team.id), name: competitor.team.displayName, shortName: competitor.team.shortDisplayName, logo: competitor.team.logo, abbreviation: competitor.team.abbreviation });
    reports.set(id, {
      id, leagueId: league.id, title: homeName + " " + score + " " + awayName, category: league.name + " · Match report",
      published: event.date, score, summary: result, paragraphs, teams: [team(home), team(away)]
    });
  }
  return [...reports.values()];
}

export function recentResults(events, clubId) {
  return events.filter(event => event.competitions?.[0]?.status?.type?.completed)
    .sort((a,b) => Date.parse(b.date) - Date.parse(a.date))
    .flatMap(event => {
      const competitors = event.competitions[0].competitors || [];
      const club = competitors.find(item => String(item.team.id) === clubId);
      const opponent = competitors.find(item => String(item.team.id) !== clubId);
      const scored = club?.score?.value ?? club?.score;
      const conceded = opponent?.score?.value ?? opponent?.score;
      if (scored == null || conceded == null || !/^\d+$/.test(scored) || !/^\d+$/.test(conceded)) return [];
      const result = Number(scored) > Number(conceded) ? "Win" : Number(scored) < Number(conceded) ? "Loss" : "Draw";
      return [{ result, score: scored + "–" + conceded, opponent: opponent.team.displayName, date: event.date }];
    }).slice(0,5).reverse();
}

export function upcomingFixtures(events, now = Date.now()) {
  return [...new Map(events.filter(event =>
    Date.parse(event.date) >= now && (event.competitions?.[0]?.status || event.status)?.type?.name === "STATUS_SCHEDULED"
  ).map(event => [event.id,event])).values()].sort((a,b) => Date.parse(a.date) - Date.parse(b.date));
}

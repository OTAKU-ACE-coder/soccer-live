const byId = id => document.getElementById(id);
const collator = new Intl.Collator();
const kickoffFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const clubs = new Map(Object.entries({
    'Arsenal': [], 'Chelsea': [], 'Liverpool': [], 'Manchester City': ['Man City'],
    'Manchester United': ['Man Utd', 'Man United'], 'Tottenham Hotspur': ['Spurs', 'Tottenham'],
    'Newcastle United': ['Newcastle'], 'Barcelona': ['Barça', 'Barca'],
    'Real Madrid': [], 'Paris Saint-Germain': ['PSG'], 'Juventus': [],
    'Inter Milan': ['Inter'], 'AC Milan': [], 'Atlético Madrid': ['Atletico Madrid']
}).map(([name, aliases]) => [name, { name, aliases }]));

function readPreferences() {
    try {
        const value = JSON.parse(localStorage.getItem('touchline-preferences'));
        return { following: value?.following ?? [], searches: value?.searches ?? [] };
    } catch {
        return { following: [], searches: [] };
    }
}

const preferences = readPreferences();
const normalize = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const includes = (value, query) => normalize(value).includes(normalize(query));
let search = '';
let sort = 'personal';
let matches = [];
let news = [];
let scoreRequest;
let updated;

function savePreferences() {
    try {
        localStorage.setItem('touchline-preferences', JSON.stringify(preferences));
    } catch {
        // Browsing still works when storage is disabled.
    }
}

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function clubMatches(club, text) {
    return [club.name, ...club.aliases].some(name => {
        const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('(?:^|[^a-z0-9])' + escaped + '(?:$|[^a-z0-9])').test(normalize(text));
    });
}

function renderClubs(focusName) {
    const list = byId('club-list');
    const following = preferences.following;
    byId('follow-count').textContent = following.length + ' followed';
    const visible = [...clubs.values()]
        .filter(club => !search || [club.name, ...club.aliases].some(name => includes(name, search)))
        .sort((a,b) => Number(following.includes(b.name)) - Number(following.includes(a.name)) || collator.compare(a.name,b.name));
    list.replaceChildren();
    for (const club of visible) {
        const row = element('div', undefined, 'club');
        const initials = club.name.split(/\s+/).filter(word => /^[A-Za-z]/.test(word)).slice(0, 2).map(word => word[0]).join('');
        const crest = element('span', initials, 'crest');
        crest.setAttribute('aria-hidden', 'true');
        const followed = following.includes(club.name);
        const button = element('button', followed ? 'Following' : 'Follow');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(followed));
        button.setAttribute('aria-label', (followed ? 'Following ' : 'Follow ') + club.name);
        button.addEventListener('click', () => {
            preferences.following = followed ? following.filter(name => name !== club.name) : [...following, club.name];
            savePreferences();
            renderClubs(club.name);
            renderScores();
            renderNews();
        });
        row.append(crest, element('span', club.name), button);
        list.append(row);
        if (focusName === club.name) button.focus({ preventScroll: true });
    }
    if (!visible.length) list.append(element('p', 'No clubs match this search.', 'muted'));
}

function relevance(story) {
    const text = story.title;
    const follows = preferences.following.filter(name => clubMatches(clubs.get(name) ?? {name, aliases:[]}, text)).length;
    const history = preferences.searches.reduce((score, term, index) => score + (includes(text, term) ? Math.max(1, 5 - index) : 0), 0);
    return follows * 12 + history;
}

function renderNews() {
    const list = byId('stories');
    const visible = news.filter(story => !search || includes(story.title, search) ||
        [...clubs.values()].some(club => [club.name, ...club.aliases].some(name => includes(name, search)) && clubMatches(club, story.title)));
    visible.sort((a, b) => (sort === 'personal' ? relevance(b) - relevance(a) : 0) || Date.parse(b.published) - Date.parse(a.published));
    list.replaceChildren();
    for (const story of visible.slice(0, 18)) {
        const link = element('a', undefined, 'story');
        link.href = story.url;
        const published = new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric' }).format(new Date(story.published));
        link.append(element('span', 'BBC Sport · ' + published, 'muted'), element('strong', story.title));
        list.append(link);
    }
    byId('news-status').textContent = !news.length ? 'Headlines are unavailable. Open BBC Sport for the latest news.' :
        !visible.length ? 'No headlines match this search.' :
        sort === 'personal' ? 'Ranked using the clubs you follow and your recent searches.' : 'Newest headlines first.';
}

function renderScores() {
    const list = byId('scores');
    const now = Date.now();
    const current = match => !match.matchIsFinished && now >= Date.parse(match.matchDateTimeUTC) && now - Date.parse(match.matchDateTimeUTC) < 2.5 * 3600000;
    const today = match => new Date(match.matchDateTimeUTC).toDateString() === new Date().toDateString();
    const teams = match => [match.team1.teamName, match.team2.teamName];
    const filter = byId('period').value;
    const filters = {
        matchday: () => true,
        today,
        progress: current,
        following: match => teams(match).some(name => preferences.following.includes(name))
    };
    const visible = matches.filter(match => filters[filter](match) && (!search || teams(match).some(name => includes(name,search))));
    list.replaceChildren();
    for (const match of visible) {
        const result = match.matchResults.find(result => result.resultTypeID === 2);
        const latestGoal = match.goals.reduce((latest, goal) =>
            !latest || goal.scoreTeam1 + goal.scoreTeam2 > latest.scoreTeam1 + latest.scoreTeam2 ? goal : latest, null);
        const score = result ? [result.pointsTeam1, result.pointsTeam2] :
            latestGoal ? [latestGoal.scoreTeam1, latestGoal.scoreTeam2] : null;
        const status = match.matchIsFinished ? 'Full time' :
            current(match) ? (score ? 'Kickoff passed · latest reported score' : 'Kickoff passed · result pending') :
            kickoffFormat.format(new Date(match.matchDateTimeUTC));
        const row = element('div', undefined, 'match');
        row.append(element('span', match.team1.teamName),
            element('strong', score ? score.join(' – ') : '–', 'score'),
            element('span', match.team2.teamName), element('span', status, 'match-time'));
        list.append(row);
    }
    if (updated && !visible.length) list.append(element('p', 'No matches for this selection.', 'muted'));
}

async function refreshScores() {
    scoreRequest?.abort();
    const request = new AbortController();
    scoreRequest = request;
    const status = byId('score-status');
    byId('refresh').disabled = true;
    status.textContent = 'Checking scores…';
    try {
        const response = await fetch('https://api.openligadb.de/getmatchdata/' + byId('league').value, {
            cache: 'no-store', signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)])
        });
        if (!response.ok) throw new Error('Score feed unavailable');
        const data = await response.json();
        if (request.signal.aborted) return;
        matches = data;
        updated = new Date();
        for (const match of matches) {
            for (const team of [match.team1, match.team2]) {
                if (!clubs.has(team.teamName)) clubs.set(team.teamName, {name:team.teamName, aliases:[team.shortName].filter(Boolean)});
            }
        }
        status.textContent = 'Checked at ' + updated.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) + ' · Refreshes every minute';
        renderScores();
        renderClubs();
    } catch {
        if (!request.signal.aborted) status.textContent = 'Could not update scores. Try Refresh.';
    } finally {
        if (scoreRequest === request) byId('refresh').disabled = false;
    }
}

byId('search-form').addEventListener('submit', event => {
    event.preventDefault();
    search = byId('search').value.trim();
    if (search) {
        preferences.searches = [search, ...preferences.searches.filter(term => normalize(term) !== normalize(search))].slice(0, 10);
        sort = 'personal';
        savePreferences();
    }
    byId('search-status').textContent = search ? 'Showing matches, clubs, and headlines for “' + search + '”. Clear the search to see your full feed.' : '';
    renderClubs();
    renderScores();
    renderNewsSort();
});

function renderNewsSort() {
    document.querySelectorAll('[data-sort]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sort === sort)));
    renderNews();
}

document.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', () => {
    sort = button.dataset.sort;
    renderNewsSort();
}));
byId('period').addEventListener('change', renderScores);
byId('league').addEventListener('change', () => {
    updated = undefined;
    matches = [];
    renderScores();
    refreshScores();
});
byId('refresh').addEventListener('click', refreshScores);

async function loadNews() {
    try {
        const response = await fetch('football-news.json');
        if (!response.ok) throw new Error('Headline snapshot unavailable');
        const stories = await response.json();
        news = [...new Map(stories.map(story => [story.url, story])).values()];
    } catch {
        news = [];
    }
    renderNews();
}

renderClubs();
loadNews();
refreshScores();
setInterval(() => { if (!document.hidden && !byId('refresh').disabled) refreshScores(); }, 60000);

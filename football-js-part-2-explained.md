# `football.js`, Part 2: lines 128 to 315

A plain-language, line-by-line explanation of the follow button, the following list, the clubs grid, and the match list.

## The general idea

This part has five functions that **draw things on screen**:

| Function | Lines | What it draws |
|---|---|---|
| `followButton(team)` | 128-151 | The "+ Follow club" / "✓ Following" button |
| `renderFollowing()` | 152-189 | Your followed clubs in the sidebar and home page |
| `renderClubs()` | 190-227 | The grid of club cards (with search and filter) |
| `matchVisible(event)` | 228-239 | A yes/no check: should this match be shown? |
| `matchRow(event)` | 240-274 | One clickable match line (time, teams, score) |
| `renderMatches()` | 275-315 | The whole match list, grouped by date |

The pattern is always the same: **clear the area, loop through the data, build small page pieces, add them to the page.** Functions that start with `render` redraw a section from scratch.

---

## Lines 128 to 151: `followButton(team)`

Builds one Follow button for one team.

```js
const active = follows(team);
```
**129**: are you already following this team? (`true` or `false`)

```js
const button = node("button",
  active ? "✓ Following" : nationalTeamIds.has(team.id) ? "＋ Follow team" : "＋ Follow club",
  "follow-button");
```
**130 to 134**: create the button. The text depends on the situation:
- already following: `✓ Following`
- not following a national team: `＋ Follow team`
- not following a club: `＋ Follow club`

The `? :` pattern is a short "if / else" (`condition ? ifTrue : ifFalse`). Here two are chained.

- **135**: `button.type = "button"` stops it from acting like a form-submit button.
- **136**: store the team's ID on the button (`data-team-id`), so the code can find this exact button later.
- **137**: `aria-pressed` tells screen readers whether the button is "on."
- **138 to 141**: give screen readers a full label, like "Follow Arsenal" or "Unfollow Arsenal." The button text alone doesn't say which team.

```js
button.addEventListener("click", () => {
  toggleFollow(team);
  if ($("detail-dialog").open) openClub(team, false);
  else [...document.querySelectorAll("#club-grid .follow-button")]
    .find(button => button.dataset.teamId === team.id)
    ?.focus({ preventScroll: true });
});
```
**142 to 149**: what happens on click:
1. **143**: follow or unfollow (this updates data and redraws things).
2. **144**: if the club's pop-up (a `<dialog>`) is open, redraw it so the button inside shows the new state. The `false` means "don't move keyboard focus."
3. **145 to 148**: otherwise, the club grid was redrawn, which destroyed the old button. So the code finds the new button for the same team and puts keyboard focus back on it. Without this, keyboard users would lose their place. `?.` means "only do this if the button was found," and `preventScroll` stops the page from jumping.

**150**: hand the finished button back (`return`).

---

## Lines 152 to 189: `renderFollowing()`

Draws your followed teams in two places: the **sidebar badges** and the **following cards** on the home page.

- **153**: `allTeams.filter(follows)` keeps only teams you follow.
- **154 to 155**: clear both areas.
- **156 to 168**: if you follow nobody, show friendly empty messages:
  - sidebar: "Your favourite badges belong here."
  - home: "Make this your matchday" with a link "Discover clubs →" pointing to `#clubs`.
- **169 to 175**: for the first 6 followed teams (`.slice(0, 6)`), build a sidebar button with the club badge and short name. Clicking it opens the club profile.
- **176 to 187**: for the first 4, build a larger card with the club name in bold and the small text "Club profile & stories."
- **188**: update the saved-stories counter in the navigation.

---

## Lines 190 to 227: `renderClubs()`

Draws the grid of club cards on the **Discover clubs** screen.

**191 to 192**: find the grid and empty it.

**193 to 202**: decide **which teams to show**:

```js
const teams = (query || $("followed-only").checked ? allTeams : league.teams)
```
- If you typed a search or ticked "Following only," search across **all** teams.
- Otherwise show only the current league's teams.

Then `.filter(...)` keeps a team only if **both** are true:
- no search text, or one of the team's names contains the search text (so "spurs" finds Tottenham)
- "Following only" is off, or you follow the team

Then `.sort(...)`:
```js
Number(follows(b)) - Number(follows(a)) || a.name.localeCompare(b.name)
```
- `Number(true)` is 1 and `Number(false)` is 0, so followed teams sort first.
- If both are equal (`0`), the `||` falls through to alphabetical order by name.

**203 to 208**: write the status line, such as `20 clubs · Premier League` or `5 teams · Across all competitions`. It says "teams" for searches and international competitions, and "clubs" otherwise.

**209 to 222**: for each team build one card:
- an `<article>` with class `club-card`
- a profile button with the badge and name (opens the club profile)
- a small line with the league name
- the follow button from `followButton(team)`

**223 to 226**: if nothing matched, show "No teams found. Try another search or turn off Following only."

---

## Lines 228 to 239: `matchVisible(event)`

A **yes/no filter** used by the match list. It returns `true` only if all three conditions pass:

- **229**: get both teams from the match.
- **230**: get the match status (scheduled, live, finished).
- **232 to 235**: if you searched, one of the teams must match the text.
- **236**: if the "Live" filter is on, the match state must be `"in"` (in progress).
- **237**: if the "Following" filter is on, at least one team must be one you follow.

`&&` means "and," `||` means "or," and `!query` means "no search text."

---

## Lines 240 to 274: `matchRow(event)`

Builds **one clickable match line**.

- **241**: get the status.
- **242 to 246**: create a button with class `match-row`, plus `is-live` added if the match is in progress (so CSS can highlight it).
- **248**: screen-reader label, like "Match details for Arsenal at Chelsea."
- **249 to 253**: work out the kickoff time in the viewer's local timezone (`toLocaleTimeString`), for example `15:00`.
- **254 to 260**: add the left label:
  - not started (`"pre"`): show the kickoff time
  - otherwise: show the status text (like `FT` or `67'`), or `Update pending` if missing
- **261 to 270**: for each of the two teams, build a line with the badge, the short name, and the score. If the match hasn't started the score shows `–`.
- **271**: add the team list and an arrow icon.
- **272**: clicking opens the match details pop-up. `event.league?.slug || competitionId` picks the right competition, even when a list mixes competitions.

---

## Lines 275 to 315: `renderMatches()`

Draws the **whole match list**.

- **276**: clear the list.
- **277**: `visible` is the matches that pass `matchVisible`.
- **278 to 281**: count the live matches and show the number in the "Live" badge.
- **282**: on the home page without a search, show only the first 6 matches. Everywhere else show all.
- **283 to 296**: loop through the matches, and whenever the date changes, first insert a **date heading** (like "Sat 15 Nov 2026") with the league badge. `lastDate` remembers the previous date so the heading appears only once per day. Then add the match row.
- **297 to 313**: if there's nothing to show (and a refresh isn't still running), pick a helpful message:
  - a loading error: show the error
  - the Live filter: "There are no live matches in this competition for the selected date."
  - the Following filter: "No matches from your followed clubs in this selection."
  - a search: "Try another club name or clear your search."
  - otherwise: "Choose another date or Latest matchday."
- **314**: show the "All matches" link only on the home page without a search.

---

## Quick recap of Part 2

These functions turn data into page elements: a follow button that keeps keyboard focus in the right place, a sidebar of your clubs, a searchable grid of club cards, and a match list grouped by date. Filtering lives in one small yes/no function (`matchVisible`), so search, "Live" and "Following" all work the same way everywhere.

**Next:** Part 3 covers lines 316 to 500 (news ranking, saving stories, story cards, the news page and article view).

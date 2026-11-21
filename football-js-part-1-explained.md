# `football.js`, Part 1: lines 1 to 127

A plain-language, line-by-line explanation of the setup section of `football.js`: the imports, the app's memory, and the first small functions.

## The general idea

The top of the file does three things:

1. **Imports** the helper files, like a chef gathering tools before cooking.
2. **Declares variables** that act as the app's memory (current league, current matches, current page, and so on).
3. **Defines the first functions:** a pop-up message, saving preferences, the competition buttons, and following a club.

---

## Lines 1 to 12: imports

An `import` says "bring in these tools from that file." The `?v=6feaefbe941b` on each one is the fingerprint added by `npm run release`, which forces browsers to fetch fresh copies when a file changes.

| Line | Brings in | From | In plain words |
|---|---|---|---|
| 1 | `buildReports`, `editorialStories` | newsroom.js | Makes match reports and gets the explainer articles |
| 2 | `collectAlerts`, `followsInterest` | news-alerts.js | Decides which stories deserve a notification |
| 3 | `upcomingFixtures` | match-data.js | Finds future matches |
| 4 | `getTheme`, `setTheme` | theme.js | Reads and changes light/dark mode |
| 5 | `API`, `TABLE_API`, `fetchJson` | api.js | Web addresses and the function that fetches data |
| 6 | `FeedFormatError` | feed-format.js | The special error for "ESPN changed its format" |
| 7 | `aliases`, `asTeam`, `competition`, `contains`, `dateLabel`, `localDate`, `normalize`, `opponents`, `teamMatches` | football-format.js | Name matching and date/team helpers |
| 8 | `clubCrests`, `crest`, `crestSource`, `empty`, `materialIcon`, `node`, `safeUrl` | render.js | Safe DOM-building helpers |
| 9 | `matchesFollow`, `preferenceKey`, `readPreferences`, `savePreferences as storePreferences`, `updateFollowing` | follows.js | Saving and reading what you follow |
| 10 | `createStandings`, `entriesOf`, `hasStandings` | standings.js | League table drawing |
| 11 | `createAlerts` | alerts.js | The notification inbox |
| 12 | `createPreferenceSync` | preference-sync.js | The cross-device syncing |

Line 9 has `savePreferences as storePreferences`. The file defines its own function called `savePreferences` (line 60), so the imported one is renamed to avoid a clash.

---

## Lines 14 to 26: constants

```js
const $ = (id) => document.getElementById(id);
```

**Line 14** makes a shortcut. Instead of writing `document.getElementById("scores")` everywhere, the app writes `$("scores")`. Every `$(...)` in the file means "find the page element with this id."

**Line 15** `routes` is the list of all screens (home, matches, news, standings, clubs, saved, alerts, settings). The URL hash (`#news`) is checked against this list.

**Line 16** `searchSections` is the screens that can show search results (matches, news, standings, clubs).

**Lines 17 to 26** `titles` maps each screen to its big heading, such as `matches: "Every match. Every moment."`.

---

## Lines 27 to 48: the app's memory

**Line 27** `const preferences = readPreferences();` loads your saved follows, saved stories, alert settings and chosen league from your browser. `const` means this variable can't be reassigned, though its contents can change.

**Lines 28 to 32** declare lists with `let` (which can change later):

- `catalog`: all competitions (Premier League, La Liga, and so on)
- `allTeams`: every team known across competitions
- `events`: the matches currently shown
- `stories`: the news stories currently shown
- `groups`: the table groups (a league has one; a World Cup has several)

**Line 33** declares four variables with no value yet:

- `league`: the competition you're looking at
- `controller`: an `AbortController`, used to cancel requests that are no longer needed
- `dialogOpener`: remembers which button opened a pop-up, so focus can return there
- `toastTimer`: the timer for the small message pop-up

**Lines 34 to 38**:

- `view`: current screen, starts at `"home"`
- `query`: search text
- `filter`: which matches to show, starts at `"all"`
- `sort`: `"personal"` ranks news by your interests
- `date`: empty means the latest matchday

**Lines 39 to 40**: `generation` is the counter that stops old responses from overwriting new ones. `newsLimit = 8` means show 8 stories at first.

**Lines 41 to 44**:

- `errors`: per-section error messages
- `requestedStory`: the story ID from the URL, if any
- `selectedMatchReports`: match reports for a chosen date
- `archivedReport`: an old report opened directly

**Lines 45 to 48**: three `Map`/`Set` objects and a flag.

- `reportFeeds`: reports collected per competition
- `nationalTeamIds`: a set of team IDs that are national teams (they're followed differently from clubs)
- `loadedNewsDates`: remembers which dates' news were already loaded
- `checkingNews`: a flag so two news checks don't run at once

---

## Lines 50 to 59: `toast()`, the pop-up message

```js
function toast(message) {
  clearTimeout(toastTimer);
  $("announcement").textContent = message;
  $("toast").textContent = message;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
    $("announcement").textContent = "";
  }, 3500);
}
```

- **51**: cancel any previous timer, so a new message gets its full time.
- **52**: put the message in a hidden area for screen readers, so blind users hear it.
- **53**: put the message in the visible pop-up.
- **54**: unhide the pop-up.
- **55 to 58**: after 3,500 ms (3.5 seconds), hide it and clear the screen-reader text.

---

## Lines 60 to 63: `savePreferences()`

```js
function savePreferences() {
  const { following, saved } = accountSync.isConnected() ? readPreferences() : preferences;
  storePreferences({ ...preferences, following, saved }, toast);
}
```

- **61**: if you're signed in and syncing, take `following` and `saved` from what's stored; otherwise from the in-memory `preferences`. (`accountSync` is defined further down the file.)
- **62**: save everything to the browser. `{ ...preferences, following, saved }` means "copy all of `preferences`, but use these two lists." If saving fails, `toast` shows the error message.

---

## Lines 65 to 67: `follows(team)`

Returns `true` if you follow this team. It checks whether any saved preference matches the team, treating national teams differently from clubs.

---

## Lines 69 to 95: `renderLeagues()`, the competition buttons

It draws the competition buttons and a dropdown version (used on small screens).

- **70 to 71**: clear both containers.
- **72**: loop twice, once for "Club competitions" and once for "International."
- **73 to 78**: create a heading, a button group (with accessibility labels `role="group"`), and an `<optgroup>` for the dropdown.
- **79**: for each competition in this group, do the following:
  - **80 to 81**: create a button.
  - **82**: store the competition's ID on the button as `data-competition`.
  - **83**: `aria-pressed` tells screen readers which button is active.
  - **84**: put the competition's logo and name inside the button.
  - **85**: clicking runs `selectCompetition`.
  - **86 to 89**: create the matching dropdown option and mark the selected one.
  - **90**: add the button to the group.
- **92 to 93**: add the finished groups to the page.

---

## Lines 96 to 113: `selectCompetition(id)`

What happens when you pick a different league:

- **97**: find the competition in the catalog.
- **98**: if it doesn't exist or is already selected, stop (`return`).
- **99 to 101**: switch `league`, remember the choice in preferences, and save.
- **102 to 105**: update which button looks pressed and set the dropdown to match.
- **106 to 110**: if the URL has `?competition=...`, update it with `history.replaceState`, without reloading the page or adding a back-button entry.
- **111 to 112**: redraw the clubs list and load the new league's data.

**Line 114** wires up the dropdown: when it changes, call `selectCompetition` with the chosen value.

---

## Lines 116 to 127: `toggleFollow(team)`

What happens when you tap Follow or Unfollow:

- **117**: are you already following?
- **118**: keep a copy of the old list (`previous`).
- **119**: compute the new list (add if not following, remove if following).
- **120**: tell the sync system about the change, so it can send it to Supabase.
- **121**: save to the browser.
- **122 to 125**: redraw the following list, clubs, matches and news, because everything is ranked by what you follow.
- **126**: show "Following Arsenal" or "Unfollowed Arsenal".

---

## Quick recap of Part 1

The file starts by importing its tools, then sets up variables that track what you're looking at. It defines a pop-up message, how preferences are saved, how competition buttons are drawn, and what happens when you switch leagues or follow a team. Nearly every function ends by calling `render...()` functions, which is the pattern for the whole app: change the data, then redraw.

**Next:** Part 2 covers lines 128 to 315 (the follow button, following list, clubs list, and match rows).

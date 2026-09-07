# Auction Draft Tracker

A live tracker for the league's $200 auction draft - the spreadsheet, but it
does the arithmetic for you while the room is shouting.

Built from eight seasons of results (2018-2025) pulled out of the league's
Google Sheet, so every player you nominate arrives with what this league has
actually paid for them before.

---

## Run it

It is plain HTML, CSS and JavaScript. No build step, no server, no account, no
network connection required once the page is open.

**Easiest:** open `dist/draft-tracker.html` - one self-contained file. Double-click
it, or email/AirDrop it to your phone and open it there.

**From the source files:** open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8000    # then visit http://localhost:8000
```

To rebuild the single-file version after editing anything:

```bash
node build.mjs
```

---

## Using it during the draft

The **Draft** tab is the only one you need while picks are flying.

1. Start typing a player's name. The dropdown shows their position and what
   they have gone for in this league before (`avg $32 · hi $50`).
2. Press **Enter** to take the highlighted name - the cursor jumps to the price.
3. Type the winning bid, click the buyer's chip (or use the dropdown), hit
   **Enter**.

The cursor returns to the name box, so you can sit with your hands on the
keyboard and never touch the mouse.

If you type a name straight through without picking from the dropdown, the
position is still filled in for you from the player pool. Setting the position
by hand always wins.

### What it works out for you

| | |
|---|---|
| **Max bid** | The most a team can still bid and fill every remaining spot at $1. Shown on every team card and every chip. |
| **Roster slots** | Each pick drops into the first legal slot - starters first, then FLEX, then bench. Anything past 17 is flagged `OVER`. |
| **Needs** | Red badges on each team card for starting slots they have not filled. |
| **Scarcity** | "Starters still needed: RB ×14, TE ×8" - how many teams are still shopping at each position. |
| **Market heat** | Whether money is leaving the room faster than roster spots. Above the line means the players still on the board will go cheap. Stays quiet until enough picks have happened to mean anything. |
| **Price history** | Every player's past prices in this league, matched through nicknames and typos. |

### Guardrails

- Bidding more than a team can afford asks you to confirm first.
- Drafting someone already taken asks you to confirm first.
- A full roster refuses more picks.
- Everything is undoable - `Ctrl+Z` / `Cmd+Z`, or the ✕ on any pick.

### Keyboard

| Key | Does |
|---|---|
| `Enter` | Take the highlighted suggestion, then submit the pick |
| `↑` `↓` | Move through suggestions |
| `/` | Jump to the player box from anywhere |
| `Ctrl/Cmd+Z` | Undo · add `Shift` to redo |
| `Esc` | Close the dropdown or a dialog |

---

## Not losing the draft

Every change is written to this browser's local storage immediately. Closing
the tab, refreshing, or a dead battery all leave the draft intact - reopen the
page and it is exactly where you left it. Open a second tab and the two stay in
step.

That said, before the draft starts:

- **Setup → Download backup** gives you a `.json` you can restore from anywhere.
- Do it again at the end, and **Export CSV** gives you a board laid out like the
  league spreadsheet, ready to paste into a new tab of the Sheet.

If the browser is blocking local storage (private windows sometimes do), a
banner says so at the top and the tab warns you before it closes.

---

## Setup tab

Change any of it before or during the draft; everything recalculates.

- **Budget** and **season**
- **Roster slots** - QB / RB / WR / TE / FLEX / DST / K / bench counts
- **Teams** - rename, reorder (this is the nomination order), add, remove
- **My team** - highlights your card and puts your max bid in the top bar
- **Bid clock** - optional countdown with a beep, 0 turns it off

### Importing a player list

The bundled autocomplete pool is the league's own eight years of names plus a
list of currently relevant players. It is a convenience, not a rulebook - you
can always type a name that is in neither.

If your host site exports a player list or ADP sheet, **Setup → Import player
list** takes a CSV with `name,pos` columns (plus optional `team` and `value`).
A header row is detected automatically, and the import takes precedence over
the bundled list.

---

## League defaults

Read off the 2025 sheet:

- **8 teams** - Mitchell, Randy, Rob, Jay, Andy, Cody, Tyler, Ryan
- **$200** per team
- **17 roster spots** - QB, RB, RB, WR, WR, TE, FLEX, DST, K, and 8 bench

---

## Layout

```
index.html          markup and the shell
styles.css          all styling, light and dark
app.js              everything else, one IIFE, no dependencies
data/history.js     2018-2025 results, one line per team-season
data/players.js     bundled autocomplete pool
build.mjs           inlines the above into dist/draft-tracker.html
test.mjs            browser tests (Playwright)
```

`data/history.js` is transcribed verbatim from the spreadsheet, typos and all
("Zeke", "McCaffery", "Nakua"). `app.js` normalizes names - punctuation,
suffixes, nicknames, and a small edit distance - so a correctly spelled name
today still finds its own history.

## Tests

```bash
npm install
node test.mjs
```

Drives a real browser through boot, autocomplete, recording picks, budget math,
duplicate detection, persistence across reload, undo/redo, every tab, and the
phone layout.

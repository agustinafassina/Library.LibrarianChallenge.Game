# Librarian's Challenge

A small 2D browser game built with **Phaser 3** (no build system). You play a
librarian who must restore order to a messy library by sorting books on a shelf,
level by level. Each level introduces a new sorting rule (title, author, genre,
year, and a combined rule).

## Tech stack

- **HTML5** — single `index.html` entry point.
- **CSS3** — page background, layout and a responsive, centered canvas.
- **JavaScript (ES Modules)** — vanilla JS, no framework or transpiler; scenes
  and utilities are split into native `import`/`export` modules.
- **Phaser 3** (v3.80.1, via CDN) — 2D game framework, rendered on a **WebGL**
  canvas (`Phaser.AUTO` falls back to Canvas2D) with `Scale.FIT` for
  responsiveness and built-in mouse + touch drag input.
- **Web Storage API (`localStorage`)** — saves progress (unlocked levels, best
  scores) and the selected language.
- **Fetch API** — loads levels from local JSON and real books from
  `Library.LibrarianChallenge.Game.Api` when available.
- **No build system** — runs from any static file server. Books fall back to
  local mocked JSON when the API is unavailable. Art (librarian, particles) is
  generated procedurally at runtime via Phaser `Graphics` textures.

Tooling used during development: any static server (e.g. Python's
`http.server` or `npx serve`) and a modern WebGL-capable browser.

## Run it

The game loads JSON from `data/` with `fetch()`, so it must be served over HTTP
(opening `index.html` directly via `file://` will be blocked by the browser).
Use any static server from the project root:

```bash
# Python 3
python -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>.

### Run with real books from the API

Start the API from `../Library.LibrarianChallenge.Game.Api`:

```bash
dotnet run --project Library.LibrarianChallenge.Api
```

By default the game reads book endpoints from `http://localhost:5142`:

```js
window.LIBRARIAN_CHALLENGE_CONFIG = {
  apiBaseUrl: "http://localhost:5142",
  useApiBooks: true,
  maxResultsPerTag: 20,
  autoTag: true,
  bookTags: [
    "Lgbtiq",
    "Queer",
    "Lesbian",
    "Gay",
    "Bisexual",
    "Trans",
    "NonBinary",
    "Intersex",
    "Feminism",
    "Activism",
  ],
};
```

If the API is down, CORS blocks the request, or there are no books yet, the game
falls back to `data/books.json` so levels remain playable.

## Controls

- **Drag & drop** a book to move it into a slot; the row reshuffles to make room.
- **Check Order** button verifies the current arrangement (it also auto-checks
  after every move).
- **R** or the **Reset** button restarts the current level.
- On big levels the shelves span several **pages**: use the right-edge arrow or
  the `‹ Page X / Y ›` pager next to the buttons. While dragging a book, push it
  against the left/right edge to carry it to the previous/next page.
- Works with mouse and touch.

## Levels

50 levels with a steadily increasing book count (4 → 67), spread across shelves
and up to three pages. See the full breakdown (books, shelves and pages per
level) in **[LEVELS.md](LEVELS.md)**.

## Automated test (run every level)

An end-to-end smoke test opens a real browser tab, plays through **every level**
automatically, verifies each one is solvable and that progress is saved, then
closes the tab. It uses [Playwright](https://playwright.dev/) and a tiny built-in
static server (no manual server needed).

```bash
npm install                 # once: installs Playwright
npx playwright install chromium   # once: downloads the browser
npm test                    # runs tests/runAllLevels.mjs
```

How it works: the page is opened with `?test=1`, which exposes the Phaser game on
`window.__GAME__`. The test starts each level and calls a test-only
`GameScene.autosolve()` helper (it arranges the books into the rule's expected
order and triggers the win check), then waits for the Level Complete screen.
This exercises real level loading, rule evaluation, win detection and progress
saving. The `autosolve` hook and `window.__GAME__` are only active with `?test=1`.

## Language (English / Spanish)

Open **Settings** from the main menu to switch the interface language. The choice
is saved to `localStorage` and applied across all menus and the in-game HUD.
Translations live in `js/utils/i18n.js`; add a new language by adding an entry to
`STRINGS` and to `I18n.available`. Per-level text (title, description, hint) is
translated via `_<lang>` fields in `data/levels.json` (e.g. `description_es`),
resolved by `I18n.pick()` with the base field as fallback. Book data (titles,
authors, genres) stays as-is since it's catalogue content.

## How it works

```
index.html            page shell, loads Phaser (CDN) + js/main.js (ES module)
css/styles.css        page background + canvas centering / responsiveness
js/
  main.js             Phaser config + scene registration
  scenes/
    BootScene.js          generates placeholder art (librarian, spark) at runtime
    MenuScene.js          Start / Continue / Level Select
    LevelSelectScene.js   grid of unlocked levels + best scores
    GameScene.js          core gameplay (multi-shelf layout, drag & drop, win check)
    LevelCompleteScene.js results screen (time / moves / score)
  utils/
    dataLoader.js     SINGLE place data is loaded (local levels + API books)
    apiBooks.js       API client + mapper from API DTOs to game book shape
    rules.js          defines + checks each sorting rule
    storage.js        localStorage progress (max level, best scores)
    i18n.js           UI translations (English / Spanish), language persisted
    ui.js             shared buttons / colors / helpers
data/
  books.json          the book catalogue (70 books across 6 genres)
  levels.json         level definitions (each references book ids)
assets/               drop real images/audio here to replace placeholders
```

### Where books / levels are loaded

All data access goes through `js/utils/dataLoader.js`:

- `loadBooks()` reads `data/books.json` as the local base/fallback, then tries
  `GET /api/v1/Book/google/by-tag/{tag}?maxResults=20&autoTag=true` for LGTBIQ+,
  queer, lesbian, trans, feminist and activism tags.
- `loadLevels()` reads `data/levels.json`.
- `getLevelWithBooks(level)` resolves a level's book ids into full book objects.
- API books are mapped in `js/utils/apiBooks.js` to the shape required by the
  game: `title`, `author`, `genre`, `year`, `size`, `color`, `pages`.
- The merge keeps existing local IDs so current levels still resolve. Real API
  books replace the first local catalog entries; remaining local entries stay as
  fallback content.

### How rules are checked

`js/utils/rules.js` maps each level's `rule` string (e.g. `title_az`,
`author_az`, `genre_az`, `year_asc`, `genre_then_title`) to an ordered list of
sort keys. `getExpectedOrder()` produces the correct order and `evaluateOrder()`
compares the player's left-to-right arrangement against it, returning a
per-slot correctness array plus a `solved` flag.

### Adding a new rule

1. Add an entry to `RULES` in `rules.js` with a `label` and ordered `keys`.
2. (Only if it uses a new book field) add a `KEY_EXTRACTORS` entry.
3. Reference the new rule name from a level in `data/levels.json`.

### API endpoints used

The game currently consumes:

```text
GET /api/v1/Book/google/by-tag/Lgbtiq?maxResults=20&autoTag=true
GET /api/v1/Book/google/by-tag/Queer?maxResults=20&autoTag=true
GET /api/v1/Book/google/by-tag/Lesbian?maxResults=20&autoTag=true
GET /api/v1/Book/google/by-tag/Gay?maxResults=20&autoTag=true
GET /api/v1/Book/google/by-tag/Bisexual?maxResults=20&autoTag=true
GET /api/v1/Book/google/by-tag/Trans?maxResults=20&autoTag=true
GET /api/v1/Book/google/by-tag/NonBinary?maxResults=20&autoTag=true
GET /api/v1/Book/google/by-tag/Intersex?maxResults=20&autoTag=true
GET /api/v1/Book/google/by-tag/Feminism?maxResults=20&autoTag=true
GET /api/v1/Book/google/by-tag/Activism?maxResults=20&autoTag=true
```

`/api/v1/book/by-tag/{tag}` reads the in-memory catalog and can return an empty
array until books are ingested. The game uses the Google live-search endpoint so
it can display real books without requiring a previous ingest.

Change tags or API URL in `index.html` via
`window.LIBRARIAN_CHALLENGE_CONFIG`.

## Progress / saving

`js/utils/storage.js` persists to `localStorage`:

- `maxLevelUnlocked` — highest unlocked level (drives **Continue** + locks).
- `bestScores` — best `{ score, timeMs, moves }` per level (shown in Level
  Select and the results screen).

## Replacing placeholder art

The librarian and particle are drawn at runtime in `BootScene.js`. To use real
art, add PNGs under `assets/images/`, load them in `BootScene.preload()`, and
remove the matching generated texture.

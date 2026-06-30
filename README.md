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
- **Fetch API** — loads game data from local JSON files (`data/`), designed to
  be swappable for a remote REST API later.
- **No build system / no backend** — runs from any static file server; data is
  mocked JSON. Art (librarian, particles) is generated procedurally at runtime
  via Phaser `Graphics` textures.

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

## Controls
- **Drag & drop** a book to move it into a slot; the row reshuffles to make room.
- **Check Order** button verifies the current arrangement (it also auto-checks
  after every move).
- **R** or the **Reset** button restarts the current level.
- Works with mouse and touch.

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
    dataLoader.js     SINGLE place data is loaded (see "Future API" below)
    rules.js          defines + checks each sorting rule
    storage.js        localStorage progress (max level, best scores)
    i18n.js           UI translations (English / Spanish), language persisted
    ui.js             shared buttons / colors / helpers
data/
  books.json          the book catalogue (40 books across 5 genres)
  levels.json         level definitions (each references book ids)
assets/               drop real images/audio here to replace placeholders
```

### Where books / levels are loaded
All data access goes through `js/utils/dataLoader.js`:

- `loadBooks()` / `loadLevels()` read `data/books.json` and `data/levels.json`.
- `getLevelWithBooks(level)` resolves a level's book ids into full book objects.

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

### Swapping local JSON for a future API
`dataLoader.js` is the single abstraction layer. To read from a REST API,
point `DATA_SOURCE` at your endpoints (or edit `fetchBooks` / `fetchLevels`)
and, if the remote shape differs, map it to the expected book / level shapes
inside those two functions. No scene code needs to change. Example:

```js
const DATA_SOURCE = {
  booksUrl:  "https://your-free-books-api.example.com/books",
  levelsUrl: "https://your-free-books-api.example.com/levels",
};
```

## Progress / saving
`js/utils/storage.js` persists to `localStorage`:

- `maxLevelUnlocked` — highest unlocked level (drives **Continue** + locks).
- `bestScores` — best `{ score, timeMs, moves }` per level (shown in Level
  Select and the results screen).

## Replacing placeholder art
The librarian and particle are drawn at runtime in `BootScene.js`. To use real
art, add PNGs under `assets/images/`, load them in `BootScene.preload()`, and
remove the matching generated texture.

# Librarian's Challenge 👾

[![CI](https://github.com/agustinafassina/Library.LibrarianChallenge.Game/actions/workflows/ci.yml/badge.svg)](https://github.com/agustinafassina/Library.LibrarianChallenge.Game/actions/workflows/ci.yml)

A small 2D browser game built with **Phaser 3** (no build system). You play a
librarian who must restore order to a messy library by sorting books on a shelf,
level by level. Each level introduces a new sorting rule (title, author, genre,
year, and a combined rule).

## Tech stack
- **HTML5** — single `index.html` entry point.
- **CSS3** — page background and a full-viewport game canvas.
- **JavaScript (ES Modules)** — vanilla JS, no framework or transpiler; scenes
  and utilities are split into native `import`/`export` modules.
- **Phaser 3** (v3.80.1, vendored in `vendor/phaser.min.js`) — 2D game
  framework, rendered on a **WebGL** canvas (`Phaser.AUTO` falls back to
  Canvas2D) with `Scale.RESIZE` so the game matches the viewport (1 CSS pixel,
  plus `devicePixelRatio` on Retina) and built-in mouse + touch drag input.
  Layout is **portrait-first** on phones and landscape on desktop.
- **Web Storage API (`localStorage`)** — saves progress (unlocked levels, best
  scores) and the selected language.
- **Web Audio API** — short UI / drop / win cues (`assets/audio/`), muted from
  Settings. The first tap unlocks playback (browser autoplay rules).
- **PWA** — `manifest.json`, service worker (`sw.js`) and icons so phones can
  **Add to Home Screen**.
- **Fetch API** — loads levels from local JSON, optionally real books from
  `Library.LibrarianChallenge.Game.Api`, and submits player feedback to
  [Formspree](https://formspree.io/) (reCAPTCHA v3 recommended for production).
- **No build system** — runs from any static file server. Production defaults to
  the local catalogue in `data/books.json` (`useApiBooks: false`). Illustrated
  librarian sprites and a spark particle live in `assets/images/`.

Tooling used during development: any static server (e.g. Python's
`http.server` or `npx serve`) and a modern WebGL-capable browser.

## Requirements
- **Playing:** any modern WebGL-capable browser and a static file server.
- **Developing** (build, lint, tests, tools): **Node.js 22+** (the version CI
  uses) and npm. Run `npm install` once in the project root.

## Run it 🚀
The game loads JSON from `data/` with `fetch()`, so it must be served over HTTP
(opening `index.html` directly via `file://` will be blocked by the browser).
Use any static server from the project root:

```bash
# Python 3
python -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>. On a phone (HTTPS or localhost), the
browser can **Add to Home Screen** / **Install app** (Chrome may show an
Install button; Safari uses the share sheet). The Feedback form uses
reCAPTCHA v3 when `recaptchaSiteKey` is set in `js/runtime-config.js`.

### Docker
```bash
docker build -t librarians-challenge .
docker run --rm -p 8080:80 librarians-challenge
```

Then open <http://localhost:8080>. For production on the VPS, the image is
built and reverse-proxied from **Hetzner.Server.Infrastructure** (Caddy + Compose),
not from this repo.

### Production config
`npm run build` / the Docker image build read **environment
variables** and write `js/runtime-config.js` (the browser cannot read
`process.env` directly).

On the VPS these come from the infra repo / GitHub Actions secrets. See
`Hetzner.Server.Infrastructure`. For local builds:

```bash
# copy .env.example → .env, edit values, then:
export LC_API_BASE_URL=https://api.example.com
export LC_API_KEY=your-key
export LC_USE_API_BOOKS=true
npm run build
```

```powershell
# PowerShell
$env:LC_API_BASE_URL="https://api.example.com"
$env:LC_API_KEY="your-key"
$env:LC_USE_API_BOOKS="true"
npm run build
```

Or edit `js/runtime-config.js` by hand for quick local testing without a build.

### Run with real books from the API
By default production/static config uses only `data/books.json`
(`useApiBooks: false` in `js/runtime-config.js`) — no API key is shipped.

For local development against the API, start it from
`../Library.LibrarianChallenge.Game.Api`:

```bash
dotnet run --project Library.LibrarianChallenge.Api
```

Then edit `js/runtime-config.js`:

```js
window.LIBRARIAN_CHALLENGE_CONFIG = {
  apiBaseUrl: "http://localhost:5142", // or your HTTPS API in production
  apiKey: "dev-librarian-game-key", // client-visible; rate-limit + CORS on the API
  formspreeUrl: "https://formspree.io/f/xbdvbarg",
  recaptchaSiteKey: "YOUR_RECAPTCHA_V3_SITE_KEY",
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

If the API is down, CORS blocks the request, or `useApiBooks` is false, the game
uses `data/books.json` so levels remain playable.

The API key is sent as `X-API-Key` on every request. It is **not a secret** once
shipped in the browser — protect the API with rate limits and a CORS allowlist
for your game origin. For local development, the key must match
`GameApi:ApiKey` in the API's `appsettings.Development.json`.

### Production checklist (security)
Before public deploy:

1. Keep `useApiBooks: false` unless you have an HTTPS API with rate limits + CORS.
2. Set `recaptchaSiteKey` to your Google reCAPTCHA v3 **site** key and enable
   captcha (secret key) in the Formspree form settings — otherwise bots can spam
   the public Formspree endpoint.
3. Serve the game only behind HTTPS; nginx in Docker listens on :80 by design
   (TLS belongs on the reverse proxy / CDN in front — do not expose :80 raw to
   the public internet).
4. Phaser is vendored under `vendor/phaser.min.js` (no third-party CDN at
   runtime). `nginx.conf` sends CSP and other security headers. The CSP allows
   `'unsafe-eval'` (needed by Phaser) plus Google reCAPTCHA and Formspree for
   the feedback form.

Progress and scores live only in `localStorage` and can be edited in DevTools —
expected for a client-only demo, not anti-cheat.

## Controls

- **Drag & drop** a book to move it into a slot; the row reshuffles to make room.
- **Check Order** (✓) verifies the current arrangement (it also auto-checks
  after every move). On a phone, tap an icon to see its label.
- **Hold** a book (without dragging) to read the full title and metadata.
- **R** or **Reset** restarts the current level.
- On big levels the shelves span several **pages**. In landscape, use the
  side arrows. In portrait, use the small ‹ › under the shelf, or drag a book
  against the left/right edge to carry it to the previous/next page.
- Some levels add an optional **challenge** (move and/or time limit). Exceeding
  either limit shows a fail modal; you can retry or continue without the bonus.
- Works with mouse and touch. Phones use a stacked HUD and a bottom action bar.

## Levels
100 levels with a steadily increasing difficulty curve and book count (4 → 67),
spread across shelves and up to three pages. See the full breakdown (books, shelves and pages per
level) in **[LEVELS.md](LEVELS.md)**.

## Tests and code quality

### Unit tests
Fast [Vitest](https://vitest.dev/) tests cover the sorting rules, the API book
mapper and the translations (`tests/rules.test.js`, `tests/apiBooks.test.js`,
`tests/translate.test.js`):

```bash
npm run test:unit         # run once
npm run test:unit:watch   # re-run on file changes
```

### Lint and formatting
The project uses [ESLint](https://eslint.org/) (`eslint.config.js`) and
[Prettier](https://prettier.io/) (`.prettierrc.json`):

```bash
npm run lint           # report problems
npm run lint:fix       # fix what can be fixed automatically
npm run format         # format every file
npm run format:check   # check formatting without changing files
```

### End-to-end test (run every level)
An end-to-end smoke test opens a real browser tab, plays through **every level**
automatically, verifies each one is solvable and that progress is saved, then
closes the tab. It uses [Playwright](https://playwright.dev/) and a tiny built-in
static server (no manual server needed).

```bash
npm install                 # once: installs Playwright
npx playwright install chromium   # once: downloads the browser
npm test                    # all levels (1280×800) + portrait smoke (390×844)
npm run test:e2e            # every level, desktop viewport only
npm run test:portrait       # Menu + two levels + Books catalogue at 390×844
```

How it works: the page is opened with `?test=1`, which exposes the Phaser game on
`window.__GAME__`. The test starts each level and calls a test-only
`GameScene.autosolve()` helper (it arranges the books into the rule's expected
order and triggers the win check), then waits for the Level Complete screen.
This exercises real level loading, rule evaluation, win detection and progress
saving. The `autosolve` hook and `window.__GAME__` are only active with `?test=1`.

`tests/responsiveShot.mjs` takes screenshots at several phone, tablet and
laptop sizes into `test-results/responsive/` for a quick visual check
(`node tests/responsiveShot.mjs`).

### Continuous integration
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and
pull request to `main`: install, lint, unit tests, build (with empty API
settings and `LC_USE_API_BOOKS=false`) and the end-to-end tests.

## Tools
**Level designer** — previews a new level before you add it to
`data/levels.json`. It prints the expected order for the chosen rule and books,
and can write the level JSON to a draft file:

```bash
npm run level:preview -- --level 63 --title "My Level" --title_es "Mi nivel" --rule title_az --books 4,1,3,2
npm run level:preview -- --level 64 --title "Custom" --title_es "Custom" --keys genre,year:desc,title --books 3,18,4,6,1,7
```

Optional flags: `--hint`, `--hint_es`, `--challengeMoves`,
`--challengeTimeSec` and `--out data/level-draft.json`.

**Book importer** — converts a JSON file of books returned by the API into the
game's book shape and adds them to `data/books.json`:

```bash
node tools/import-real-books.mjs <api-books.json> [--start-id=1]
```

## Language (English / Spanish)
Open **Settings** from the main menu to switch the interface language. The choice
is saved to `localStorage` and applied across all menus and the in-game HUD.
Translations live in `js/utils/i18n.js`; add a new language by adding an entry to
`STRINGS` and to `I18n.available`. Per-level text (title, description, hint) is
translated via `_<lang>` fields in `data/levels.json` (e.g. `description_es`),
resolved by `I18n.pick()` with the base field as fallback. Book data (titles,
authors, genres) stays as-is since it's catalogue content.

## Feedback (Formspree)
The main menu **Feedback** button opens a DOM modal (`js/utils/feedbackForm.js`)
that posts to Formspree via `fetch`. Fields: type, message (required), email
(required), plus a short privacy note and hidden metadata (`guestId`, language,
progress stats, etc.). Email is used only to reply to the feedback.

**Spam protection (required for public deploy):**

1. Create a reCAPTCHA v3 key at the [Google reCAPTCHA admin](https://www.google.com/recaptcha/admin).
2. Paste the **secret** key into Formspree form settings and enable captcha.
3. Paste the **site** key into `recaptchaSiteKey` in `js/runtime-config.js`.

The game loads Google's script on demand and sends the token as
`g-recaptcha-response`. Leaving the site key empty skips captcha (local testing
only) and logs a console warning.

## Books library
**Books** on the main menu opens `BooksScene`: a browsable catalogue filtered by
tag (from `bookTags` in config), with search and pagination. It uses the same
book data as gameplay (`loadBooks()`), including API results when available.

## How it works
```
index.html            page shell, loads Phaser (vendored) + runtime config + js/main.js
book-detail.html      standalone book details page (js/book-detail.js)
update.html           clears the service worker + caches, then returns to the game (sw-reset.js)
css/styles.css        page background + full-viewport canvas
vendor/
  phaser.min.js       Phaser 3.80.1 (self-hosted; no CDN)
js/
  runtime-config.js   window.LIBRARIAN_CHALLENGE_CONFIG (prod-safe defaults)
  main.js             Phaser Scale.RESIZE + scene registration
  config/
    layout.js         getUiLayout() — portrait/landscape metrics
  game/
    BoardController.js  shelf paging + slot logic used by GameScene
  scenes/
    BootScene.js          loads librarian / spark art (procedural fallback)
    MenuScene.js          Start / Continue / Level Select + Tutorial / Books / Settings / Feedback
    LevelSelectScene.js   grid of unlocked levels + best scores
    BooksScene.js         tag-filtered book catalogue (search + pagination)
    GameScene.js          core gameplay (multi-shelf layout, drag & drop, win check)
    LevelCompleteScene.js results screen (time / moves / score)
    ErrorScene.js         fatal load/runtime error screen
  utils/
    dataLoader.js     SINGLE place data is loaded (local levels + API books)
    apiBooks.js       API client + mapper from API DTOs to game book shape
    feedbackForm.js   DOM feedback modal + Formspree POST (optional reCAPTCHA v3)
    rules.js          defines + checks each sorting rule
    storage.js        localStorage progress (max level, best scores, guest stats)
    i18n.js           UI translations (English / Spanish), language persisted
    sfx.js            Web Audio cues (ui / drop / win) + mute preference
    libraryArt.js     book spines + wood room / shelf drawing
    pwa.js            Add to Home Screen / install prompt
    ui.js             shared buttons / colors / helpers
data/
  books.json          offline book catalogue (70 real titles + metadata)
  levels.json         level definitions (each references book ids)
assets/
  images/             librarian sprites + spark particle
  audio/              ui.wav, drop.wav, win.wav
  icons/              PWA / Apple touch icons
scripts/
  generate-runtime-config.mjs  npm run build: writes runtime-config.js + sw-version.js
  generate-sfx.mjs             regenerates the WAV cues
tools/
  level-designer.mjs  npm run level:preview
  import-real-books.mjs  API books → data/books.json
tests/                unit tests (Vitest) + Playwright e2e / portrait / screenshot scripts
manifest.json         web app manifest (Add to Home Screen)
sw.js                 service worker (same-origin cache)
sw-version.js         cache version for sw.js (generated by npm run build)
sw-reset.js           unregisters the service worker and clears caches
Dockerfile            nginx image that serves the game
nginx.conf            nginx config with CSP + security headers
.github/workflows/    CI pipeline
```

### Where books / levels are loaded
All data access goes through `js/utils/dataLoader.js`:

- `loadBooks()` reads `data/books.json` as the local base/fallback, then tries
  `GET /api/v1/Book/google/by-tag/{tag}?maxResults=20&autoTag=true` for LGBTIQ+,
  queer, lesbian, trans, feminist and activism tags.
- API requests include the configured `X-API-Key` header.
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

Change tags or API URL in `js/runtime-config.js` via
`window.LIBRARIAN_CHALLENGE_CONFIG`.

## Progress / saving
`js/utils/storage.js` persists to `localStorage`:

- `maxLevelUnlocked` — highest unlocked level (drives **Continue** + locks).
- `bestScores` — best `{ score, timeMs, moves }` per level (shown in Level
  Select and the results screen).
- `guestProfile` — anonymous local demo profile (`id`, `createdAt`,
  `lastSeenAt`, `mode`).
- `globalStats` — aggregate local stats such as completed levels, total
  completions, moves and play time.

## Art, audio, and PWA
Librarian frames (`idle`, `happy`, `thinking`) are PNGs in `assets/images/`,
packed into a sprite sheet in `BootScene`. The win spark is
`assets/images/spark.svg`. If a file fails to load, BootScene still draws the
old procedural textures so the game can start.

Book spines and the library room (wood planks, distant shelves, shelf lips) are
drawn in `js/utils/libraryArt.js` — cloth/leather grain, gold foil marks by
genre, and a unique texture per book. Colour stays the spine fill so the colour
rule still works.

Cues live in `assets/audio/` (`ui.wav`, `drop.wav`, `win.wav`, plus a quiet
looping `ambience.wav`). Mute them from **Settings**. Regenerating the WAVs:
`node scripts/generate-sfx.mjs`.

`manifest.json` + `sw.js` + `assets/icons/` (192 / 512 / Apple touch) make the
game installable. The service worker is not registered during e2e (`?test`).
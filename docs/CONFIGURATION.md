# Configuration and deployment

- [Runtime config](#runtime-config)
- [Environment variables](#environment-variables)
- [Real books from the API](#real-books-from-the-api)
- [Feedback form and reCAPTCHA](#feedback-form-and-recaptcha)
- [Versioning and the service worker](#versioning-and-the-service-worker)
- [Docker](#docker)
- [Production checklist](#production-checklist)

## Runtime config

The browser can't read `process.env`, so the game reads its settings from
`window.LIBRARIAN_CHALLENGE_CONFIG`, defined in `js/runtime-config.js`.

`npm run build` (and the Docker image build) generates that file from
environment variables, plus `.env` if it exists. It also writes
`sw-version.js`.

> [!IMPORTANT]
> The committed `js/runtime-config.js` must keep the safe defaults: no API
> key, no API URL, `useApiBooks: false`. If you ran `npm run build` with a
> local `.env`, restore it before committing:
>
> ```bash
> git restore js/runtime-config.js
> ```
>
> `npm run check:config` (also run in CI) fails if the file holds real values.

For quick local testing you can also edit `js/runtime-config.js` by hand.
Don't commit those changes.

## Environment variables

Copy `.env.example` to `.env`, edit the values, then run `npm run build`.

| Variable                 | Default                           | Description                                                |
| ------------------------ | --------------------------------- | ---------------------------------------------------------- |
| `LC_API_BASE_URL`        | _(empty)_                         | Base URL of `Library.LibrarianChallenge.Game.Api`.         |
| `LC_API_KEY`             | _(empty)_                         | Sent as `X-API-Key`. Visible in the browser, not a secret. |
| `LC_USE_API_BOOKS`       | `false`                           | Load real books from the API instead of `data/books.json`. |
| `LC_FORMSPREE_URL`       | `https://formspree.io/f/xbdvbarg` | Formspree endpoint for the feedback form.                  |
| `LC_RECAPTCHA_SITE_KEY`  | _(empty)_                         | reCAPTCHA v3 **site** key. Empty skips captcha.            |
| `LC_MAX_RESULTS_PER_TAG` | `20`                              | `maxResults` sent per tag request.                         |
| `LC_AUTO_TAG`            | `true`                            | `autoTag` sent per tag request.                            |

Without a `.env` file you can set the variables in the shell:

```bash
LC_API_BASE_URL=https://api.example.com LC_API_KEY=your-key LC_USE_API_BOOKS=true npm run build
```

```powershell
$env:LC_API_BASE_URL="https://api.example.com"
$env:LC_API_KEY="your-key"
$env:LC_USE_API_BOOKS="true"
npm run build
```

On the VPS these values come from the GitHub Actions secrets of
**Hetzner.Server.Infrastructure**.

## Real books from the API

By default the game only uses the local catalogue in `data/books.json`.

To develop against the API, start it from
`../Library.LibrarianChallenge.Game.Api`:

```bash
dotnet run --project Library.LibrarianChallenge.Api
```

Then set `LC_API_BASE_URL=http://localhost:5142`, `LC_USE_API_BOOKS=true` and
an `LC_API_KEY` that matches `GameApi:ApiKey` in the API's
`appsettings.Development.json`, and run `npm run build`.

The game calls one endpoint per tag:

```text
GET /api/v1/Book/google/by-tag/{tag}?maxResults=20&autoTag=true
```

The tags are `Lgbtiq`, `Queer`, `Lesbian`, `Gay`, `Bisexual`, `Trans`,
`NonBinary`, `Intersex`, `Feminism` and `Activism` (`bookTags` in the config).

It uses the Google live-search endpoint rather than `/api/v1/book/by-tag/{tag}`.
That one reads the in-memory catalogue and returns nothing until books are
ingested.

If the API is down, CORS blocks the request, or `useApiBooks` is false, the game
falls back to `data/books.json`, so every level stays playable.

The API key is **not a secret** once it ships to the browser. Protect the API
with rate limits and a CORS allowlist for the game's origin.

## Feedback form and reCAPTCHA

**Feedback** on the main menu opens a modal (`js/utils/feedbackForm.js`) that
posts to Formspree. Fields: type, message and email (both required), plus
hidden metadata (`guestId`, language, progress stats). The email is only used
to reply.

To protect the public endpoint from spam:

1. Create a reCAPTCHA v3 key in the
   [Google reCAPTCHA admin](https://www.google.com/recaptcha/admin).
2. Paste the **secret** key into the Formspree form settings and enable captcha.
3. Set the **site** key as `LC_RECAPTCHA_SITE_KEY`.

The game loads Google's script and sends the token as `g-recaptcha-response`.
With an empty site key, captcha is skipped (only for local testing) and a
console warning is logged.

## Versioning and the service worker

The version comes from `package.json`. `npm run build` copies it into the
runtime config (shown in the menu) and into `sw-version.js` as the service
worker cache name (`lc-shell-<version>`).

To ship an update that installed players pick up:

1. Bump `version` in `package.json`.
2. Run `npm run build` (or rebuild the Docker image).

The new cache name makes the service worker drop the old cached files. If a
browser gets stuck on an old version, opening `/update.html` unregisters the
service worker, clears the caches and reloads the game.

## Docker

```bash
docker build -t librarians-challenge .
docker run --rm -p 8080:80 librarians-challenge
```

Then open <http://localhost:8080>. The image generates the runtime config from
the `LC_*` build args (same names and defaults as the table above, e.g.
`--build-arg LC_RECAPTCHA_SITE_KEY=...`) and serves the game with nginx
(`nginx.conf`).

In production the image is built and put behind a reverse proxy (Caddy +
Compose) from **Hetzner.Server.Infrastructure**, not from this repo.

## Production checklist

1. Keep `useApiBooks: false` unless the API is served over HTTPS with rate
   limits and CORS.
2. Set up reCAPTCHA as described in
   [Feedback form and reCAPTCHA](#feedback-form-and-recaptcha).
3. Serve the game only over HTTPS. nginx in the container listens on :80 on
   purpose: TLS belongs on the reverse proxy or CDN in front of it. Don't
   expose :80 directly to the internet.
4. Phaser is vendored in `vendor/phaser.min.js` (no CDN at runtime).
   `nginx.conf` sends a CSP and other security headers. The CSP allows
   `'unsafe-eval'` (Phaser needs it), Google reCAPTCHA and Formspree.

Progress and scores live only in `localStorage` and can be edited in DevTools.
That's expected for a client-only game. There is no anti-cheat.

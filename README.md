# AI News.tech

A text-first AI news publication: a front page of short briefs, a model
comparison desk, a radar of dated upcoming events, and one static page per
brief. The deployed site is plain HTML/CSS/JS with no runtime framework, no
trackers and no third-party requests. Every brief links its sources; figures
carry an asterisk when they come from launch coverage rather than an official
page.

The site can be maintained by hand, but it also ships with a **zero-dependency
daily generator** that reads AI news RSS feeds, asks an LLM to write briefs in
the house voice, validates and escapes everything, then rewrites the static
pages. Generation happens *before* deploy (in CI or locally) — the served files
stay static and keep the strict CSP intact.

## Files

```
ai-news-tech/
  index.html            Front page (data-story cards + Wire are generated regions)
  models.html           The Model Desk: sortable, filterable, comparable table
  radar.html            Dated events ahead (with live day countdowns)
  about.html            Sourcing, desk methodology, corrections, colophon
  404.html              Styled not-found page
  article/<slug>.html   One static page per brief (generated)
  assets/               styles.css, app.js, fonts.css, fonts/, favicon.svg
  netlify.toml          Security headers + caching for Netlify
  _headers              Security headers for Cloudflare Pages / Netlify
  vercel.json           Security headers + caching for Vercel
  robots.txt  sitemap.xml  .well-known/security.txt
  security-check.mjs     Automated security checks (node security-check.mjs)
  SECURITY.md           Full security posture
  package.json          Scripts only; still zero dependencies

  content/              Source of truth for the desk (JSON)
    stories.json          every brief: slug, category, title, dek, body, sources
    wire.json             The Wire one-liners
    state.json            dedupe memory (URLs/titles already seen)
  tools/                The generator (plain Node, no dependencies)
    generate.mjs          daily pipeline: fetch → LLM → validate → render
    render.mjs            renders index regions, articles, sitemap from content/
    seed.mjs              one-time import of the hand-written site into content/
    config.mjs            feeds, categories, bylines, limits, LLM env
    prompt.mjs            the editorial brief given to the model
    templates.mjs         HTML templates (match the hand-written markup)
    lib/                  feeds, llm, html helpers
  .github/workflows/daily.yml   scheduled daily run
```

## Run it

Open `index.html` in a browser, or serve the folder:

```
python -m http.server 8000
# then visit http://localhost:8000
```

## Deploy it

The folder is plain static hosting with headers already configured. Because the
generator lives in the same folder, either publish the root as-is (fine) or
point the host at the root and it will serve the source files too (crawling of
`tools/`, `content/` and `.github/` is disallowed in `robots.txt`). Pick a host:

- **Netlify** — connect the repo (or drag the folder). `netlify.toml` applies the
  security headers automatically.
- **Cloudflare Pages** — create a project, connect the repo. `_headers` is picked
  up automatically.
- **Vercel** — `vercel deploy` (framework preset: Other). `vercel.json` applies
  the headers.
- **GitHub Pages** — works, but GitHub does not allow custom response headers, so
  the CSP/HSTS set will not apply. Prefer the three above.

**Domain:** canonical URLs, `sitemap.xml`, `robots.txt`, `security.txt` and
`tools/config.mjs` (`SITE.domain`) assume `https://ai-news.tech`. If yours
differs, replace it in those places.

## Automate the daily news

The generator reads `tools/config.mjs` for its feeds, categories, bylines and
limits, and the environment for the LLM. It needs **no npm install**.

Local run:

```
AI_PROVIDER=openai AI_MODEL=gpt-4o-mini AI_API_KEY=sk-... node tools/generate.mjs
node tools/generate.mjs --dry        # fetch + draft, print JSON, write nothing
node tools/generate.mjs --limit 2    # override how many briefs to write
```

What a run does:

1. Fetches every feed in `FEEDS`, parses RSS/Atom with no dependencies.
2. Drops anything already published (URL + title dedupe) or older than
   `GENERATION.maxAgeDays`.
3. Sends the survivors to the model with the house-style brief in `prompt.mjs`.
4. Validates mercilessly: category must be known, every brief needs ≥1 http(s)
   source, slugs are de-duplicated, dates/prices are checked, all text is
   escaped and non-http(s) URLs are dropped. Briefs without sources are thrown
   away.
5. Merges into `content/*.json`, then re-renders `index.html` regions, every
   `article/*.html`, and `sitemap.xml` (and upserts model rows when a sourced
   model shipped). Re-rendering is idempotent.

### GitHub Actions

`.github/workflows/daily.yml` runs the generator on a cron (13:10 UTC daily),
runs `security-check.mjs` as a gate, and commits the result — which triggers a
redeploy on any of the hosts above.

Set up, once:

1. Push this folder to a GitHub repo.
2. Add the key as a secret: **Settings → Secrets and variables → Actions →
   Secrets → `AI_API_KEY`**.
3. Optionally add repository **variables** `AI_PROVIDER`, `AI_MODEL`,
   `AI_BASE_URL` (Settings → ... → Variables).
4. Run it immediately from **Actions → Daily AI news → Run workflow**.

Environment variables the generator understands:

| Variable | Values | Notes |
|---|---|---|
| `AI_PROVIDER` | `openai` (default), `anthropic`, `google`, `openai-compatible` | selects the API shape |
| `AI_MODEL` | e.g. `gpt-4o-mini`, `claude-3-5-haiku-latest`, `gemini-3.8-flash` | defaults per provider |
| `AI_API_KEY` | secret | required (except `openai-compatible` with no auth) |
| `AI_BASE_URL` | URL | override endpoint / self-hosted / gateway |

### Publish a brief by hand

Edit `content/stories.json` (copy an existing object) or `content/wire.json`,
then run:

```
node tools/render.mjs
```

New cards and rows are picked up automatically: the Saved filter, the compare
tray, dark mode, countdowns and the clock need no upkeep. House rules worth
keeping: no inline styles or inline scripts (they would break the CSP — the
security check enforces this), external links keep `rel="noopener"`, and numbers
are either sourced or marked `n/a`.

## Security

See `SECURITY.md` for the full posture. Short version: strict deny-by-default
CSP, HSTS, frame/MIME/referrer/permissions headers via the host configs,
self-hosted fonts (zero third-party requests while reading), no inline code, no
trackers, no cookies. The generator runs offline and escapes all model and feed
text before it reaches a template, so generated pages keep the same posture.
Verify any change with:

```
node security-check.mjs
```

## Keyboard

`/` opens (or jumps to) the desk search, `T` toggles the theme, `Esc` closes
the model drawer and comparison sheet.

## Stack notes

- Semantic HTML + CSS custom properties (light/dark via `data-theme`,
  `prefers-color-scheme` respected), ~16 KB vanilla JS, zero runtime
  dependencies.
- Fonts self-hosted: Newsreader (display/reading serif), Archivo (UI),
  IBM Plex Mono (data). Latin subsets, `font-display: swap`.
- Accessibility: landmarks, skip link, focus-visible rings, `aria-sort` on the
  desk, native `<dialog>` for the drawer and comparison, reduced-motion support.

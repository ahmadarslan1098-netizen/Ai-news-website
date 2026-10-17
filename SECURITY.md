# Security posture — AI News.tech

This is a static, backend-free publication: no server code, no database, no
accounts, no forms, no cookies, no trackers. That removes whole classes of
attacks (injection, auth bypass, session theft), and the remaining surface is
handled below. Re-run the checks any time you touch the site:

```
node security-check.mjs        # 22 checks; exit code 1 on any failure
```

Last run: **22 passed, 0 failed** (October 16, 2026).

## What is in place

**Strict Content Security Policy** (identical in `netlify.toml`, `_headers`
and `vercel.json`):

```
default-src 'none'; style-src 'self'; script-src 'self'; font-src 'self';
img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none';
frame-ancestors 'none'
```

Everything is denied by default. The site loads no third-party code, so the
policy needs no `unsafe-inline`, no CDN allow-lists and no hashes. An injected
script tag on any page would simply not execute.

**HTTP response headers** (applied by the host configs above):
- `Strict-Transport-Security`: 2 years, all subdomains, preload-ready.
- `X-Frame-Options: DENY` + `frame-ancestors 'none'`: clickjacking protection.
- `X-Content-Type-Options: nosniff`: no MIME confusion.
- `Referrer-Policy: strict-origin-when-cross-origin`: readers' paths stay private.
- `Permissions-Policy`: camera, microphone, geolocation and FLoC all disabled.
- `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy`: same-origin isolation.

**Zero third-party requests.** Fonts are self-hosted (`assets/fonts/`,
latin subsets, downloaded from Google Fonts once, documented in
`assets/fonts.css`). The browser makes no request to any other origin while
reading the site: nothing phones home, no CDN can serve you altered code.

**No inline code.** Pages contain zero inline event handlers and zero inline
style attributes (utilities live in `styles.css`), which is what makes the
strict CSP possible.

**Link hygiene.** All 33 external links open with `rel="noopener"`, every
outbound URL is https, and outbound navigation is the only cross-origin
activity the site ever performs.

**Client storage, scoped and honest.** localStorage holds three keys only:
`ain-theme`, `ain-saved`, `ain-fs` (theme, your saved briefs, reading size).
No identifiers, no sync, cleared when you clear site data.

**Code hygiene.** No `eval`, no `new Function`, no `document.write`; JSON from
storage is parsed inside try/catch and type-checked; the tree contains no
credentials (checked).

**Build-time generation, not runtime.** The daily generator
(`tools/generate.mjs`) runs offline in CI or locally and only ever writes static
files; the host and the reader's browser execute nothing new. Every piece of
feed- or model-supplied text is escaped by `tools/lib/html.mjs` before it reaches
a template, and only `http(s)` source URLs are kept — so generated briefs stay
inline-code-free and safe under the same CSP. `security-check.mjs` scans the
generated pages too.

**Operational disclosures.** `/.well-known/security.txt` publishes the
security contact; `sitemap.xml` and `robots.txt` are minimal and static.

## Host matrix

| Host | Security headers | Notes |
|---|---|---|
| Netlify | Full, via `netlify.toml` + `_headers` | Recommended |
| Cloudflare Pages | Full, via `_headers` | Recommended |
| Vercel | Full, via `vercel.json` | Recommended |
| GitHub Pages | Partial (HSTS only) | GH Pages does not allow custom headers; use one of the above if you want the full set |

## Limits and follow-ups

- Domain placeholder: canonical URLs, `sitemap.xml`, `robots.txt` and
  `security.txt` assume `https://ainewz.tech`. If your domain differs,
  find-and-replace it before launch.
- The optional `ai-news-tech-preview/standalone.html` preview snapshot (kept
  outside the deploy folder) embeds its CSS/JS and cannot run under the strict
  CSP; it is never part of the deployment. The check only fails if a preview
  file leaks into the deploy folder itself.
- When you later add a backend (newsletter endpoint, comments, CMS), re-read
  this file: the CSP will need explicit `connect-src`/`form-action` entries,
  and any new input becomes XSS surface. Keep `security-check.mjs` in CI.
- The generator lives inside the deploy folder, so `content/`, `tools/` and
  `.github/` are served as static files (crawling excluded in `robots.txt`).
  If you would rather not serve the source, move the generator outside the
  publish root or set the host's publish directory to a `public/` subfolder.

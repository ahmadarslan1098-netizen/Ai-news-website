/* HTML templates. These mirror the hand-written pages byte-for-byte in structure
   so generated output is indistinguishable from the original desk markup.
   All interpolated values arrive pre-escaped from the render layer. */

import { CATEGORIES, SITE } from './config.mjs';
import { longDate, shortDate, fullDate, readTime } from './lib/html.mjs';

const SUN = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
const CHEVRON_LEFT = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
const SAVE = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z"/></svg>';
const COPY = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="13" height="13"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

/* Top of every page. `depth` is '' at the root and '../' inside article/. */
export function pageHead({ title, description, canonical, page, depth }) {
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#fafaf7">
<link rel="icon" href="${depth}assets/favicon.svg">
<link rel="stylesheet" href="${depth}assets/fonts.css">
<link rel="stylesheet" href="${depth}assets/styles.css">
</head>
<body data-page="${page}">
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <div class="topstrip">
    <div class="wrap">
      <span id="todayLine">Friday, October 16, 2026</span>
      <span class="right">
        <span>${SITE.tagline}</span>
        <button id="themeToggle" class="theme-btn" type="button" aria-pressed="false">
          ${SUN}
          <span id="themeLabel">Dark</span>
        </button>
      </span>
    </div>
  </div>
  <div class="wrap">
    <p class="brand"><a href="${depth}index.html">AI News<span class="brand-dot">.</span><span class="brand-tld">tech</span></a></p>
    <nav class="nav" aria-label="Sections">
      <a href="${depth}index.html"${page === 'home' ? ' aria-current="page"' : ''}>News</a>
      <a href="${depth}models.html"${page === 'models' ? ' aria-current="page"' : ''}>Models</a>
      <a href="${depth}radar.html"${page === 'radar' ? ' aria-current="page"' : ''}>Radar</a>
      <a href="${depth}about.html"${page === 'about' ? ' aria-current="page"' : ''}>About</a>
    </nav>
  </div>
  <div class="double-rule" role="presentation"></div>
</header>`;
}

export function pageFoot(depth) {
  return `<footer>
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <p class="foot-brand">AI News<span class="brand-dot">.</span><span class="brand-tld">tech</span></p>
        <p>Independent, text-first coverage of the AI era. Short briefs, primary sources, a model comparison desk, and a radar of what is ahead.</p>
      </div>
      <div>
        <h2>Sections</h2>
        <ul>
          <li><a href="${depth}index.html">News</a></li>
          <li><a href="${depth}models.html">The Model Desk</a></li>
          <li><a href="${depth}radar.html">Radar</a></li>
          <li><a href="${depth}about.html">About and methodology</a></li>
        </ul>
      </div>
      <div>
        <h2>Contact</h2>
        <ul>
          <li><a href="mailto:tips@ai-news.tech">tips@ai-news.tech</a></li>
          <li><a href="mailto:corrections@ai-news.tech">corrections@ai-news.tech</a></li>
        </ul>
      </div>
    </div>
    <div class="colophon">© 2026 AI News.tech. Every brief links its sources. Figures as of ${fullDate(SITE.updated)}. Shortcuts: "/" opens desk search, "T" switches theme.</div>
  </div>
</footer>
<script src="${depth}assets/app.js"></script>
</body>
</html>
`;
}

/* A front-page story card. Values are pre-escaped strings. */
export function storyCard(s, { lead = false, indent = 8 } = {}) {
  const pad = ' '.repeat(indent);
  const cat = CATEGORIES[s.category] || s.category;
  const tag = s.tag ? `<span class="tag">${s.tag}</span>` : '';
  return `${pad}<article class="story${lead ? ' lead' : ''}" data-story="${s.slug}" data-cat="${s.category}">
${pad}  <p class="kicker">${cat}${tag}</p>
${pad}  <h3 class="s-title"><a href="article/${s.slug}.html">${s.title}</a></h3>
${pad}  <p class="dek">${s.dek}</p>
${pad}  <p class="byline">By ${s.author} · <time datetime="${s.date}">${longDate(s.date)}</time><span class="rt">${s.read || readTime(s.paragraphs)}</span></p>
${pad}</article>`;
}

/* A numbered Wire line. Values are pre-escaped strings. */
export function wireItem(w, idx, { indent = 12 } = {}) {
  const pad = ' '.repeat(indent);
  const n = String(idx).padStart(2, '0');
  const live = w.live ? '<span class="live-dot" role="img" aria-label="Newest"></span>' : '';
  const src = w.url ? ` <a href="${w.url}" target="_blank" rel="noopener">Source</a>` : '';
  return `${pad}<li><span class="idx">${n}</span><time datetime="${w.date}">${shortDate(w.date)}</time><span>${live}${w.text}${src}</span></li>`;
}

/* Related card on a brief page (links are relative to article/). */
export function relatedCard(s) {
  const cat = CATEGORIES[s.category] || s.category;
  return `          <p class="kicker">${cat}</p>
          <h3 class="s-title"><a href="${s.slug}.html">${s.title}</a></h3>
          <p class="dek">${s.dek}</p>
          <p class="byline">By ${s.author} · <time datetime="${s.date}">${longDate(s.date)}</time><span class="rt">${s.read || readTime(s.paragraphs)}</span></p>`;
}

/* A full brief page. `s` fields are pre-escaped except paragraphs/sources which
   are formatted here. */
export function articlePage(s, related) {
  const title = `${s.title} | AI News.tech`;
  const canonical = `${SITE.domain}/article/${s.slug}.html`;
  const cat = CATEGORIES[s.category] || s.category;
  const tag = s.tag ? `<span class="tag">${s.tag}</span>` : '';
  const paras = s.paragraphs.map(p => `  <p>${p}</p>`).join('\n');
  const sources = s.sources
    .map(x => `    <li><a href="${x.url}" target="_blank" rel="noopener">${x.label}</a></li>`)
    .join('\n');
  const rel = related.length ? related.map(relatedCard).join('\n\n') : '<p class="dek">More briefs on the front page.</p>';

  return `${pageHead({ title, description: s.dek, canonical, page: 'article', depth: '../' })}
<main id="main" class="wrap">
  <section class="view" id="view-article" aria-label="Brief">
    <a class="backlink" href="../index.html">${CHEVRON_LEFT}Front page</a>
    <article class="article" id="articleBox">
      <p class="kicker">${cat}${tag}</p>
      <h1>${s.title}</h1>
      <p class="dek">${s.dek}</p>
      <p class="byline">By ${s.author} · <time datetime="${s.date}">${longDate(s.date)}</time></p>
      <hr class="rule">
      <div class="body">
${paras}
      </div>
<div class="src"><h2>Sources</h2><ul>
${sources}
</ul></div>
    <div class="related">
      <h2>Related</h2>
${rel}
    </div>
    </article>
    <div id="articleTools">
      <button class="tool" type="button" id="toolSave" data-save="${s.slug}" data-title="${s.title}">${SAVE}<span class="tl">Save</span></button>
      <button class="tool" type="button" id="copyLink">${COPY}<span class="tl">Copy link</span></button>
      <span class="count" id="toolRt">${s.read || readTime(s.paragraphs)}</span>
      <button class="tool" type="button" data-fs-btn="sm" aria-label="Smaller text">A-</button>
      <button class="tool" type="button" data-fs-btn="lg" aria-label="Larger text">A+</button>
    </div>
  </section>
</main>
${pageFoot('../')}`;
}

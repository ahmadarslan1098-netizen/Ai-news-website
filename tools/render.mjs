/* Render engine. Reads content/*.json and rewrites the generated regions of
   index.html, every article page, sitemap.xml (and optionally models.html).
   Running it on unchanged content produces identical files. */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SITE, CATEGORIES } from './config.mjs';
import { esc, safeUrl, readTime, longDate, fullDate } from './lib/html.mjs';
import { articlePage, storyCard, wireItem } from './templates.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONTENT = path.join(ROOT, 'content');

export function loadContent() {
  const stories = JSON.parse(fs.readFileSync(path.join(CONTENT, 'stories.json'), 'utf8')).stories;
  const wire = JSON.parse(fs.readFileSync(path.join(CONTENT, 'wire.json'), 'utf8')).items;
  return { stories, wire };
}

/* Normalize + escape a story for the templates. */
function norm(s) {
  const sources = (s.sources || [])
    .map(x => ({ label: esc(x.label || 'Source'), url: safeUrl(x.url) }))
    .filter(x => x.url);
  return {
    slug: s.slug,
    category: CATEGORIES[s.category] ? s.category : 'industry',
    tag: esc(s.tag || ''),
    title: esc(s.title || ''),
    dek: esc(s.dek || ''),
    author: esc(s.author || 'The Desk'),
    date: s.date || SITE.updated,
    read: s.read || readTime(s.paragraphs || []),
    paragraphs: (s.paragraphs || []).map(p => esc(p)),
    sources
  };
}

function orderStories(stories) {
  const lead = stories.find(s => s.lead) || stories[0];
  const rest = stories
    .filter(s => s !== lead)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { lead, rest };
}

function renderBriefs(stories) {
  const { lead, rest } = orderStories(stories);
  const leadHtml = lead ? storyCard(norm(lead), { lead: true, indent: 8 }) : '';
  const restHtml = rest.map(s => storyCard(norm(s), { indent: 8 })).join('\n\n');
  return { leadHtml, restHtml, total: stories.length };
}

function renderWireBlock(wire) {
  const items = wire.slice(0, 5).map((w, i) => wireItem({
    date: w.date, live: !!w.live, text: esc(w.text || ''), url: safeUrl(w.url)
  }, i + 1, { indent: 12 }));
  return items.join('\n');
}

const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function replaceRegion(html, name, body) {
  const re = new RegExp(`([ \\t]*)<!-- BEGIN:${name} -->[\\s\\S]*?<!-- END:${name} -->`);
  if (!re.test(html)) throw new Error('index.html is missing marker: ' + name);
  return html.replace(re, (m, ws) => `${ws}<!-- BEGIN:${name} -->\n${body}\n${ws}<!-- END:${name} -->`);
}

function relatedFor(story, stories) {
  const others = stories.filter(s => s.slug !== story.slug);
  const same = others.filter(s => s.category === story.category);
  const picks = same.slice(0, 3);
  for (const s of others) { if (picks.length >= 3) break; if (!picks.includes(s)) picks.push(s); }
  return picks.map(norm);
}

export function renderIndex({ stories, wire }) {
  const file = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const { leadHtml, restHtml, total } = renderBriefs(stories);
  html = replaceRegion(html, 'lead', leadHtml);
  html = replaceRegion(html, 'briefs', restHtml);
  html = replaceRegion(html, 'wire', renderWireBlock(wire));
  html = html.replace(/(<span id="storyCount" role="status">)[^<]*(<\/span>)/, (m, a, b) => `${a}${total} brief${total === 1 ? '' : 's'}${b}`);
  fs.writeFileSync(file, html);
  return total;
}

export function renderArticles({ stories }) {
  const dir = path.join(ROOT, 'article');
  fs.mkdirSync(dir, { recursive: true });
  const keep = new Set();
  for (const s of stories) {
    keep.add(s.slug + '.html');
    fs.writeFileSync(path.join(dir, s.slug + '.html'), articlePage(norm(s), relatedFor(s, stories)));
  }
  return stories.length;
}

export function renderSitemap({ stories }) {
  const base = SITE.domain;
  const url = (loc, lastmod, changefreq, priority) => {
    const parts = [`<loc>${loc}</loc>`, lastmod ? `<lastmod>${lastmod}</lastmod>` : '', changefreq ? `<changefreq>${changefreq}</changefreq>` : '', priority ? `<priority>${priority}</priority>` : ''];
    return `  <url>${parts.filter(Boolean).join('')}</url>`;
  };
  const rows = [
    url(`${base}/`, SITE.updated, 'daily', '1.0'),
    url(`${base}/models.html`, SITE.updated, 'daily', '0.9'),
    url(`${base}/radar.html`, SITE.updated, 'weekly', '0.6'),
    url(`${base}/about.html`, SITE.updated, 'monthly', '0.5')
  ];
  const ordered = stories.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const s of ordered) rows.push(url(`${base}/article/${s.slug}.html`, s.date, '', ''));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  return rows.length;
}

/* Upsert model-desk rows. Only called when the generator has validated rows. */
export function renderModels(models) {
  if (!models || !models.length) return 0;
  const file = path.join(ROOT, 'models.html');
  let html = fs.readFileSync(file, 'utf8');
  let changed = 0;
  for (const m of models) {
    const attrs = `data-model="${esc(m.name)}" data-org="${esc(m.org)}" data-date="${esc(m.date)}" data-ctx="${esc(m.ctx || 'n/a')}" data-in="${esc(m.in || '')}" data-out="${esc(m.out || '')}" data-lic="${m.lic}" data-note="${esc(m.note || '')}" data-src="${esc(safeUrl(m.src))}"`;
    const cells = `            <td><button class="rowlink" type="button"><span class="m-name">${esc(m.name)}</span></button></td>\n            <td><span class="org">${esc(m.org)}</span></td>\n            <td class="td-date">${longDate(m.date)}</td>\n            <td><span class="ctx">${esc(m.ctx || 'n/a')}</span></td>\n            <td class="num">${m.in ? '$' + esc(m.in) : '<span class="na">n/a</span>'}</td><td class="num">${m.out ? '$' + esc(m.out) : '<span class="na">n/a</span>'}</td>\n            <td><span class="lic">${m.lic === 'open' ? 'Open weights' : 'Proprietary'}</span></td>`;
    const row = `          <tr ${attrs}>\n${cells}\n          </tr>`;
    const existing = new RegExp(`[ \\t]*<tr data-model="${reEsc(esc(m.name))}"[\\s\\S]*?<\\/tr>`);
    /* NB: replacements are passed as functions — a string replacement would treat
       "$1"/"$15" inside prices as capture-group references. */
    if (existing.test(html)) { html = html.replace(existing, () => row); changed++; }
    else { html = html.replace(/(<tbody id="modelRows">\n)/, (mm) => mm + row + '\n'); changed++; }
  }
  const count = (html.match(/<tr data-model=/g) || []).length;
  html = html.replace(/(<span id="modelCount" role="status">)[^<]*(<\/span>)/, (m, a, b) => `${a}${count} model${count === 1 ? '' : 's'}${b}`);
  fs.writeFileSync(file, html);
  return changed;
}

/* Keep every "Figures as of ..." line and the desk's "Last updated" honest. */
function syncDates(updated) {
  const full = fullDate(updated);
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/^(assets|tools|content|node_modules|\.git|\.github)$/.test(e.name)) walk(p); return; }
    if (!p.endsWith('.html')) return;
    const before = fs.readFileSync(p, 'utf8');
    const after = before
      .replace(/Figures as of [A-Za-z]+ \d{1,2}, \d{4}/g, `Figures as of ${full}`)
      .replace(/Last updated [A-Za-z]+ \d{1,2}, \d{4}/g, `Last updated ${full}`);
    if (after !== before) fs.writeFileSync(p, after);
  });
  walk(ROOT);
}

/* CLI: regenerate the whole site from the current content store. */
export function renderAll(opts = {}) {
  const content = loadContent();
  SITE.updated = content.stories.reduce((m, s) => (s.date > m ? s.date : m), SITE.updated);
  const briefs = renderIndex(content);
  const articles = renderArticles(content);
  const urls = renderSitemap(content);
  syncDates(SITE.updated);
  const models = opts.models ? renderModels(opts.models) : 0;
  return { briefs, articles, urls, models };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = renderAll();
  console.log(`Rendered: index (${r.briefs} briefs), ${r.articles} article pages, sitemap (${r.urls} urls).`);
}

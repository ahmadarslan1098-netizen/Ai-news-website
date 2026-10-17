/* One-time migration: read the hand-written site (article/*.html + index.html)
   and produce content/stories.json, content/wire.json and content/state.json.
   After this, tools/render.mjs owns those files. Run with --force to rebuild. */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CATEGORIES } from './config.mjs';
import { stripTags, decodeEntities } from './lib/html.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content');
const CAT_BY_NAME = Object.fromEntries(Object.values(CATEGORIES).map(v => [v.toLowerCase(), Object.keys(CATEGORIES).find(k => CATEGORIES[k] === v)]));

const force = process.argv.includes('--force');
if (fs.existsSync(path.join(CONTENT, 'stories.json')) && !force) {
  console.log('content/stories.json exists; pass --force to overwrite.');
  process.exit(0);
}

function pick(html, re, i = 1) { const m = re.exec(html); return m ? m[i] : ''; }

function parseArticle(file) {
  const html = fs.readFileSync(file, 'utf8');
  const slug = path.basename(file, '.html');
  const kickerRaw = pick(html, /<p class="kicker">([\s\S]*?)<\/p>/);
  const tag = pick(kickerRaw, /<span class="tag">([\s\S]*?)<\/span>/);
  const catName = stripTags(kickerRaw.replace(/<span class="tag">[\s\S]*?<\/span>/, '')).toLowerCase();
  const category = CAT_BY_NAME[catName] || 'industry';
  const title = stripTags(pick(html, /<h1>([\s\S]*?)<\/h1>/));
  const dek = stripTags(pick(html, /<p class="dek">([\s\S]*?)<\/p>/));
  const byline = /<p class="byline">By ([\s\S]*?) · <time datetime="([^"]+)"/.exec(html);
  const author = byline ? stripTags(byline[1]) : 'The Desk';
  const date = byline ? byline[2] : '';
  const bodyBlock = pick(html, /<div class="body">([\s\S]*?)<\/div>/);
  const paragraphs = [...bodyBlock.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => decodeEntities(m[1]).trim()).filter(Boolean);
  const srcBlock = pick(html, /<div class="src">([\s\S]*?)<\/div>/);
  const sources = [...srcBlock.matchAll(/<li><a href="([^"]+)" target="_blank" rel="noopener">([\s\S]*?)<\/a><\/li>/g)]
    .map(m => ({ url: m[1], label: stripTags(m[2]) }));
  return { slug, category, tag, title, dek, author, date, paragraphs, sources };
}

function parseIndex() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const order = [];
  for (const m of html.matchAll(/<article class="story( lead)?" data-story="([^"]+)" data-cat="[^"]+">/g)) {
    order.push({ slug: m[2], lead: !!m[1] });
  }
  const wireBlock = pick(html, /<ul class="wire">([\s\S]*?)<\/ul>/);
  const wire = [];
  for (const m of wireBlock.matchAll(/<li><span class="idx">\d+<\/span><time datetime="([^"]+)">[^<]*<\/time><span>([\s\S]*?)<\/span><\/li>/g)) {
    const date = m[1];
    let inner = m[2];
    const live = /class="live-dot"/.test(inner);
    const url = pick(inner, /<a href="([^"]+)" target="_blank" rel="noopener">/);
    const text = stripTags(inner.replace(/<span class="live-dot"[\s\S]*?<\/span>/, '').replace(/<a href="[\s\S]*?<\/a>/, ''));
    wire.push({ date, text, url, live });
  }
  return { order, wire };
}

const leadSet = new Map();
const { order, wire } = parseIndex();
order.forEach((o, i) => leadSet.set(o.slug, { lead: o.lead, rank: i }));

const files = fs.readdirSync(path.join(ROOT, 'article')).filter(f => f.endsWith('.html'));
const stories = files.map(f => {
  const s = parseArticle(path.join(ROOT, 'article', f));
  const meta = leadSet.get(s.slug);
  s.lead = meta ? !!meta.lead : false;
  return s;
});
stories.sort((a, b) => (leadSet.get(a.slug)?.rank ?? 99) - (leadSet.get(b.slug)?.rank ?? 99));

fs.mkdirSync(CONTENT, { recursive: true });
fs.writeFileSync(path.join(CONTENT, 'stories.json'), JSON.stringify({ updated: '2026-10-16', stories }, null, 2) + '\n');
fs.writeFileSync(path.join(CONTENT, 'wire.json'), JSON.stringify({ updated: '2026-10-16', items: wire }, null, 2) + '\n');

const seen = new Set();
for (const s of stories) for (const src of s.sources || []) if (src.url) seen.add(src.url);
for (const w of wire) if (w.url) seen.add(w.url);
fs.writeFileSync(path.join(CONTENT, 'state.json'), JSON.stringify({ lastRun: null, seen: [...seen].sort() }, null, 2) + '\n');

console.log(`Seeded ${stories.length} stories and ${wire.length} wire items into content/.`);

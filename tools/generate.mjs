/* Daily pipeline: fetch the feeds, ask the model to write new briefs, validate
   everything, then merge into content/ and re-render the static site.
   Run: node tools/generate.mjs [--dry] [--limit N]
   Env: AI_PROVIDER, AI_MODEL, AI_API_KEY, AI_BASE_URL */

import fs from 'fs';
import path from 'path';
import { CONTENT, ROOT, loadContent, renderAll } from './render.mjs';
import { FEEDS, GENERATION, CATEGORIES, STAFF, SITE, llmConfig } from './config.mjs';
import { fetchAll } from './lib/feeds.mjs';
import { chat, extractJson } from './lib/llm.mjs';
import { buildPrompt } from './prompt.mjs';
import { slugify, safeUrl, isoDay } from './lib/html.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LIMIT = (() => { const i = args.indexOf('--limit'); return i !== -1 ? parseInt(args[i + 1], 10) : GENERATION.maxStoriesPerRun; })();

const TODAY = isoDay(new Date());
const normKey = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const normUrl = u => {
  let s = String(u == null ? '' : u).trim();
  if (s && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try { const x = new URL(s); return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')).toLowerCase(); } catch { return normKey(u); }
};
const clean = s => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();

function readJson(f, fallback) { try { return JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8')); } catch { return fallback; } }

/* ---- validation ---- */
function sanitizeStory(raw, taken) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clean(raw.title).slice(0, 140);
  const paragraphs = (Array.isArray(raw.paragraphs) ? raw.paragraphs : [])
    .map(p => clean(p).slice(0, 1400)).filter(Boolean);
  const sources = (Array.isArray(raw.sources) ? raw.sources : [])
    .map(s => ({ label: clean(s && s.label).slice(0, 120) || 'Source', url: safeUrl(s && s.url) }))
    .filter(s => s.url);
  if (!title || paragraphs.length < GENERATION.minParagraphs || !sources.length) return null;

  let slug = slugify(clean(raw.slug) || title);
  while (taken.has(slug)) slug = slug + '-2';
  taken.add(slug);

  const category = CATEGORIES[raw.category] ? raw.category : 'industry';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(clean(raw.date)) ? clean(raw.date) : TODAY;
  const author = STAFF.includes(clean(raw.author)) ? clean(raw.author) : STAFF[0];
  const dek = clean(raw.dek).slice(0, 320) || paragraphs[0].split(/(?<=\.)\s/)[0];
  return { slug, category, tag: clean(raw.tag).slice(0, 24), lead: false, title, dek, author, date, paragraphs: paragraphs.slice(0, GENERATION.maxParagraphs), sources };
}

function sanitizeWire(raw, seenTexts) {
  const out = [];
  for (const w of Array.isArray(raw) ? raw : []) {
    const text = clean(w && w.text).slice(0, 300);
    if (!text) continue;
    const key = normKey(text).slice(0, 80);
    if (seenTexts.has(key)) continue;
    seenTexts.add(key);
    out.push({ date: /^\d{4}-\d{2}-\d{2}$/.test(clean(w.date)) ? clean(w.date) : TODAY, text, url: safeUrl(w.url), live: false });
  }
  return out;
}

function sanitizeModels(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter(m => m && clean(m.name) && clean(m.org) && safeUrl(m.src))
    .map(m => ({
      name: clean(m.name).slice(0, 60), org: clean(m.org).slice(0, 40),
      date: /^\d{4}-\d{2}-\d{2}$/.test(clean(m.date)) ? clean(m.date) : TODAY,
      ctx: clean(m.ctx).slice(0, 20), in: /^\d+(?:\.\d+)?$/.test(clean(m.in)) ? clean(m.in) : '',
      out: /^\d+(?:\.\d+)?$/.test(clean(m.out)) ? clean(m.out) : '',
      lic: clean(m.lic) === 'open' ? 'open' : 'prop',
      note: clean(m.note).slice(0, 400), src: safeUrl(m.src)
    }));
}

/* ---- main ---- */
async function main() {
  const content = loadContent();
  const state = readJson('state.json', { lastRun: null, seen: [] });
  const known = new Set(content.stories.flatMap(s => (s.sources || []).map(x => normUrl(x.url))));
  const knownTitles = new Set(content.stories.map(s => normKey(s.title)));
  for (const u of state.seen || []) known.add(normUrl(u));

  console.log(`Fetching ${FEEDS.length} feeds...`);
  const items = await fetchAll(FEEDS);
  console.log(`  ${items.length} items retrieved.`);

  const window = Date.now() - GENERATION.maxAgeDays * 86400000;
  const candidates = items.filter(it => {
    if (it.url && known.has(normUrl(it.url))) return false;
    if (knownTitles.has(normKey(it.title))) return false;
    if (it.date && new Date(it.date).getTime() < window) return false;
    return !!it.title;
  }).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, GENERATION.maxCandidates);

  if (!candidates.length) { console.log('Nothing new in the window. Exiting.'); return; }
  console.log(`  ${candidates.length} candidate(s) after dedupe.`);

  const cfg = llmConfig();
  if (!cfg.key && cfg.provider !== 'openai-compatible') {
    console.error(`\nAborting: no AI_API_KEY. Set AI_PROVIDER/AI_MODEL/AI_API_KEY to generate.`);
    process.exitCode = 1; return;
  }

  const recentTitles = content.stories.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 25).map(s => s.title);
  const { system, user } = buildPrompt(candidates, recentTitles);

  console.log(`Calling ${cfg.provider}/${cfg.model}...`);
  const reply = await chat(cfg, { system, user });
  const parsed = extractJson(reply);

  const taken = new Set(content.stories.map(s => s.slug));
  const stories = (parsed.stories || []).map(s => sanitizeStory(s, taken)).filter(Boolean)
    /* drop anything whose sources we have already consumed (models sometimes re-emit seen items) */
    .filter(s => !s.sources.every(x => known.has(normUrl(x.url))))
    .slice(0, LIMIT);
  const seenTexts = new Set(content.wire.map(w => normKey(w.text).slice(0, 80)));
  const wire = sanitizeWire(parsed.wire, seenTexts).filter(w => !w.url || !known.has(normUrl(w.url)));
  const models = GENERATION.updateModels ? sanitizeModels(parsed.models) : [];

  console.log(`  model drafted ${stories.length} brief(s), ${wire.length} wire line(s), ${models.length} model row(s).`);
  if (!stories.length && !wire.length && !models.length) { console.log('Nothing publishable this run.'); return; }

  if (DRY) { console.log(JSON.stringify({ stories, wire, models }, null, 2)); return; }

  /* merge */
  if (stories.length && !content.stories.some(s => s.lead)) stories[0].lead = true;
  const storiesOut = { updated: TODAY, stories: content.stories.concat(stories) };
  const wireAll = content.wire.concat(wire).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  wireAll.forEach((w, i) => { w.live = i === 0; });
  const wireOut = { updated: TODAY, items: wireAll.slice(0, 40) };

  const stateSeen = new Set(state.seen || []);
  for (const it of candidates) { if (it.url) stateSeen.add(normUrl(it.url)); }
  const stateOut = { lastRun: new Date().toISOString(), seen: [...stateSeen].slice(-800) };

  fs.writeFileSync(path.join(CONTENT, 'stories.json'), JSON.stringify(storiesOut, null, 2) + '\n');
  fs.writeFileSync(path.join(CONTENT, 'wire.json'), JSON.stringify(wireOut, null, 2) + '\n');
  fs.writeFileSync(path.join(CONTENT, 'state.json'), JSON.stringify(stateOut, null, 2) + '\n');

  const r = renderAll({ models });
  console.log(`Published. Site now has ${r.briefs} briefs, ${r.articles} article pages, ${r.urls} sitemap urls${r.models ? `, ${r.models} model row(s) updated` : ''}.`);
}

main().catch(err => { console.error('Generation failed:', err.message); process.exitCode = 1; });

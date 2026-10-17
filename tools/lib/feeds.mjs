/* Dependency-free RSS 2.0 / Atom reader. Tolerant, not exhaustive: it pulls the
   fields the desk needs (title, link, date, summary) from each item. */

import { decodeEntities, stripTags, isoDay, safeUrl } from './html.mjs';

function firstTag(block, names) {
  for (const name of names) {
    const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i').exec(block);
    if (m && m[1] && m[1].trim()) return m[1];
  }
  return '';
}

/* Atom <link href=".."> — prefer rel="alternate". */
function atomLink(block) {
  const links = block.match(/<link\b[^>]*>/gi) || [];
  let fallback = '';
  for (const tag of links) {
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!href) continue;
    if (/rel\s*=\s*["']alternate["']/i.test(tag)) return href[1];
    if (!/rel\s*=\s*["'](?:self|edit|enclosure)["']/i.test(tag) && !fallback) fallback = href[1];
  }
  return fallback;
}

function rssLink(block) {
  const m = /<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i.exec(block);
  if (m && m[1].trim()) return decodeEntities(m[1]).trim();
  const guid = /<guid[^>]*isPermaLink\s*=\s*["']true["'][^>]*>([\s\S]*?)<\/guid>/i.exec(block);
  return guid ? decodeEntities(guid[1]).trim() : '';
}

export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks) {
    const isAtom = /^<entry/i.test(block);
    const title = stripTags(firstTag(block, ['title']));
    const link = safeUrl(isAtom ? atomLink(block) : rssLink(block));
    const dateRaw = stripTags(firstTag(block, ['pubDate', 'published', 'updated', 'dc:date']));
    const summary = stripTags(firstTag(block, ['description', 'summary', 'content', 'content:encoded'])).slice(0, 600);
    const parsed = dateRaw ? new Date(dateRaw) : null;
    if (!title) continue;
    items.push({
      title,
      url: link,
      date: parsed && !isNaN(parsed) ? isoDay(parsed) : '',
      summary
    });
  }
  return items;
}

export async function fetchFeed(feed, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(feed.url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'ai-news-tech-generator/1.0 (+https://ainewz.tech)' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return parseFeed(await res.text()).map(it => ({ ...it, source: feed.name }));
  } finally {
    clearTimeout(timer);
  }
}

/* Fetch every feed, tolerating individual failures. */
export async function fetchAll(feeds) {
  const results = await Promise.all(feeds.map(async f => {
    try { return { feed: f.name, items: await fetchFeed(f) }; }
    catch (err) { console.warn(`  ! ${f.name}: ${err.message}`); return { feed: f.name, items: [] }; }
  }));
  return results.flatMap(r => r.items);
}

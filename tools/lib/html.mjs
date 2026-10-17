/* Small HTML/string helpers. Everything that reaches a template is escaped here,
   which is what keeps generated pages free of inline code and safe under the CSP. */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

export function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/<!(?:\[CDATA\[)([\s\S]*?)(?:\]\]>)/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return ''; } })
    .replace(/&([a-z0-9#]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m);
}

export function stripTags(s) {
  /* Unwrap CDATA first: otherwise the tag-stripper eats "<![CDATA[...]]>" whole,
     because its first ">" is the one that closes "]]>". */
  const unwrapped = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(unwrapped.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/* Escape for text nodes and double-quoted attributes. Single quotes are left
   intact: every attribute we emit is double-quoted, so this keeps the markup as
   readable as the hand-written pages. */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'brief';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function isoDay(d) {
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x) ? '' : x.toISOString().slice(0, 10);
}

/* "Oct 12, 2026" */
export function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso || '');
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

/* "October 12, 2026" */
export function fullDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso || '');
  return `${MONTHS_LONG[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

/* "Oct 12" */
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!m) return String(iso || '');
  return `${MONTHS[+m[2] - 1]} ${+m[3]}`;
}

export function readTime(paragraphs) {
  const words = (paragraphs || []).join(' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200)) + ' min read';
}

/* Keep only http(s) URLs; everything else is dropped. */
export function safeUrl(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

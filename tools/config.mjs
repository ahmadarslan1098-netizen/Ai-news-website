/* Site + generator configuration. Everything an editor would tweak lives here. */

export const SITE = {
  domain: 'https://ainewz.tech',
  name: 'AI News.tech',
  tagline: 'Independent, text-first coverage of the AI era',
  updated: '2026-10-16'
};

/* Sections a brief can belong to. Keys match data-cat in the front page. */
export const CATEGORIES = {
  models: 'Models',
  industry: 'Industry',
  policy: 'Policy',
  safety: 'Safety',
  chips: 'Chips',
  funding: 'Funding'
};

/* Bylines the generator may assign. Kept in the house voice. */
export const STAFF = ['Mara Ellison', 'Dev Okafor', 'Lena Fischer', 'Tomás Rivera', 'Jonas Weber', 'Priya Nair'];

/* Sources the daily job reads. name is what appears in prompts/metadata. */
export const FEEDS = [
  { name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { name: 'The Decoder', url: 'https://the-decoder.com/feed/' },
  { name: 'VentureBeat', url: 'https://venturebeat.com/category/ai/feed/' },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/' }
];

export const GENERATION = {
  maxStoriesPerRun: 4,   /* full briefs + article pages written per run */
  maxWirePerRun: 6,      /* dated one-liners added to The Wire per run */
  maxCandidates: 40,     /* feed items handed to the model */
  maxAgeDays: 4,         /* ignore feed items older than this */
  minParagraphs: 2,
  maxParagraphs: 4,
  updateModels: true     /* upsert model-desk rows when a sourced model ships */
};

/* LLM settings come from the environment so no secret is ever committed.
   AI_PROVIDER: openai (default) | anthropic | google | openai-compatible
   AI_MODEL:    provider model id            AI_API_KEY: the key
   AI_BASE_URL: override endpoint (openai-compatible / self-hosted)  */
export function llmConfig(env = process.env) {
  const provider = (env.AI_PROVIDER || 'openai').toLowerCase();
  const defaults = {
    openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    anthropic: { base: 'https://api.anthropic.com/v1', model: 'claude-3-5-haiku-latest' },
    google: { base: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.8-flash' },
    'openai-compatible': { base: env.AI_BASE_URL || '', model: '' }
  }[provider];
  if (!defaults) throw new Error('Unknown AI_PROVIDER: ' + provider);
  return {
    provider,
    base: (env.AI_BASE_URL || defaults.base).replace(/\/$/, ''),
    model: env.AI_MODEL || defaults.model,
    key: env.AI_API_KEY || env.OPENAI_API_KEY || ''
  };
}

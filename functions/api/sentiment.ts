import { analyzeSentiment } from '../../shared/sentiment';

interface Env {
  NEWS_API_KEY: string;
  EDA_CONFIG: KVNamespace;
}

function parseRssTitles(xml: string): string[] {
  const titles: string[] = [];
  const regex = /<title[^>]*>([^<]+)<\/title>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const t = match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (t.length > 10 && !t.startsWith('Stock Market')) titles.push(t);
  }
  return titles.slice(0, 10);
}

async function fetchRssHeadlines(): Promise<string[]> {
  try {
    const res = await fetch('https://news.google.com/rss/search?q=stock+market+finance&hl=en-US&gl=US&ceid=US:en', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return [];
    return parseRssTitles(await res.text());
  } catch {
    return [];
  }
}

async function fetchNewsApiHeadlines(apiKey: string): Promise<string[]> {
  try {
    const url = `https://newsapi.org/v2/everything?q=stock+market+finance&language=en&pageSize=10&apiKey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json() as { articles?: { title: string }[] };
    return data.articles?.map((a) => a.title) ?? [];
  } catch {
    return [];
  }
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    const apiKey = context.env.NEWS_API_KEY;
    let headlines: string[] = [];

    if (apiKey) {
      headlines = await fetchNewsApiHeadlines(apiKey);
    }

    if (headlines.length === 0) {
      headlines = await fetchRssHeadlines();
    }

    const result = analyzeSentiment(headlines);
    await context.env.EDA_CONFIG.put('cache:news', JSON.stringify(result));
    return Response.json(result);
  } catch (err) {
    return Response.json({ score: 0, label: 'neutral', articlesAnalyzed: 0, timestamp: new Date().toISOString(), error: 'Sentiment fetch failed' });
  }
};

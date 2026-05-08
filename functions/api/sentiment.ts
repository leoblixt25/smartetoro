import { analyzeSentiment } from '../../shared/sentiment';

interface Env {
  NEWS_API_KEY: string;
  EDA_CONFIG: KVNamespace;
}

async function fetchHeadlines(apiKey: string): Promise<string[]> {
  const url = `https://newsapi.org/v2/everything?q=stock+market+finance&language=en&pageSize=10&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json() as { articles?: { title: string }[] };
  return data.articles?.map((a) => a.title) ?? [];
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.NEWS_API_KEY;

  if (!apiKey) {
    return Response.json({
      score: 0,
      label: 'neutral',
      articlesAnalyzed: 0,
      timestamp: new Date().toISOString(),
      note: 'No NEWS_API_KEY configured',
    });
  }

  const headlines = await fetchHeadlines(apiKey);
  const result = analyzeSentiment(headlines);

  await context.env.EDA_CONFIG?.put?.('cache:news', JSON.stringify(result));

  return Response.json(result);
};

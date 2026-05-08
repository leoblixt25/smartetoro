import { EtoroClient } from '../../shared/etoro-client';
import { executeRebalance } from '../../shared/rebalancer';
import { analyzeSentiment } from '../../shared/sentiment';
import type { UserPrefs } from '../../shared/types';

interface Env {
  EDA_CONFIG: KVNamespace;
  ETORO_API_KEY: string;
  ETORO_USER_KEY: string;
  NEWS_API_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    const apiKey = context.env.ETORO_API_KEY;
    const userKey = context.env.ETORO_USER_KEY;
    if (!apiKey || !userKey) {
      return Response.json({ error: 'eToro API keys not configured' }, { status: 401 });
    }

    const prefsRaw = await context.env.EDA_CONFIG.get('user:prefs', 'text');
    const prefs: UserPrefs = prefsRaw ? JSON.parse(prefsRaw) : {
      traderCount: 5, tpPercent: 20, slPercent: 15, rebalanceHours: 4, environment: 'demo',
    };

    const client = new EtoroClient({ apiKey, userKey, environment: prefs.environment });

    let sentiment;
    const newsKey = context.env.NEWS_API_KEY;
    if (newsKey) {
      try {
        const newsUrl = `https://newsapi.org/v2/everything?q=stock+market+finance&language=en&pageSize=10&apiKey=${newsKey}`;
        const newsRes = await fetch(newsUrl);
        if (newsRes.ok) {
          const newsData = await newsRes.json() as { articles?: { title: string }[] };
          const headlines = newsData.articles?.map(a => a.title) ?? [];
          sentiment = analyzeSentiment(headlines);
          await context.env.EDA_CONFIG.put('cache:news', JSON.stringify(sentiment));
        }
      } catch { /* sentiment is optional */ }
    }

    const result = await executeRebalance(client, prefs, sentiment);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Rebalance failed' }, { status: 502 });
  }
};

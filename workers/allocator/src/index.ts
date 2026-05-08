import { EtoroClient } from '../../../shared/etoro-client';
import { executeRebalance } from '../../../shared/rebalancer';
import { analyzeSentiment, type SentimentResult } from '../../../shared/sentiment';
import type { UserPrefs, AllocatorState, AllocationPlan } from '../../../shared/types';

interface Env {
  EDA_CONFIG: KVNamespace;
  ETORO_API_KEY: string;
  ETORO_USER_KEY: string;
  NEWS_API_KEY: string;
}

async function fetchSentiment(env: Env): Promise<SentimentResult | undefined> {
  const newsKey = env.NEWS_API_KEY;
  if (!newsKey) return undefined;

  try {
    const url = `https://newsapi.org/v2/everything?q=stock+market+finance&language=en&pageSize=10&apiKey=${newsKey}`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = await res.json() as { articles?: { title: string }[] };
    const headlines = data.articles?.map(a => a.title) ?? [];
    const result = analyzeSentiment(headlines);
    await env.EDA_CONFIG.put('cache:news', JSON.stringify(result));
    return result;
  } catch {
    return undefined;
  }
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    console.log('[Allocator] Cycle started');

    const prefsRaw = await env.EDA_CONFIG.get('user:prefs', 'text');
    if (!prefsRaw) {
      console.log('[Allocator] No user prefs configured — skipping');
      return;
    }

    const prefs: UserPrefs = JSON.parse(prefsRaw);
    const apiKey = env.ETORO_API_KEY;
    const userKey = env.ETORO_USER_KEY;

    if (!apiKey || !userKey) {
      console.log('[Allocator] No eToro API keys configured — skipping');
      return;
    }

    const client = new EtoroClient({ apiKey, userKey, environment: prefs.environment });

    try {
      const sentiment = await fetchSentiment(env);
      if (sentiment) console.log(`[Allocator] Sentiment: ${sentiment.label} (${sentiment.score.toFixed(2)})`);

      const result = await executeRebalance(client, prefs, sentiment);

      const plan: AllocationPlan = {
        timestamp: new Date().toISOString(),
        allocations: result.allocations,
        reason: sentiment ? `scheduled rebalance (sentiment: ${sentiment.label})` : 'scheduled rebalance',
      };

      const state: AllocatorState = {
        activeTraders: result.allocations.map((a) => ({
          username: a.username,
          instrumentId: 0,
          allocatedUsd: a.usdAmount,
          currentValue: a.usdAmount,
          pnlPercent: a.pnlPercent,
          status: 'active' as const,
        })),
        totalInvested: result.totalInvested,
        availableCash: result.remainingCash,
        lastRebalance: new Date().toISOString(),
        nextRebalance: new Date(Date.now() + prefs.rebalanceHours * 3600000).toISOString(),
      };

      await env.EDA_CONFIG.put('state:current', JSON.stringify(state));
      await env.EDA_CONFIG.put('state:last-plan', JSON.stringify(plan));
      await env.EDA_CONFIG.put('state:last-actions', JSON.stringify(result.actions));

      console.log(`[Allocator] Cycle complete — ${result.allocations.length} traders, ${result.actions.filter(a => a.type === 'open').length} new, ${result.actions.filter(a => a.type === 'close').length} closed`);
    } catch (err) {
      console.error('[Allocator] Error:', err);
    }
  },
};

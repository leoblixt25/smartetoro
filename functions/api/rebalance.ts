import { EtoroClient } from '../../shared/etoro-client';
import { executeRebalance, buildCloseQueue, calcMirrorCurrentValue, calcMirrorPnL } from '../../shared/rebalancer';
import { analyzeSentiment } from '../../shared/sentiment';
import type { UserPrefs, AllocatorState, AllocationPlan } from '../../shared/types';

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
    const mirrors = result.portfolio.clientPortfolio.mirrors;
    const currency = prefs.currency || 'EUR';

    // Manual name mapping KV (editable from dashboard)
    let manualNames: Record<string, string> = {};
    try {
      const raw = await context.env.EDA_CONFIG.get('manual:trader-names', 'text');
      if (raw) manualNames = JSON.parse(raw);
    } catch { /* ignore */ }

    const state: AllocatorState = {
      activeTraders: result.allocations.map((a) => {
        const mirrorId = parseInt(a.username.replace('mirror-', ''), 10);
        const mirror = mirrors.find((m) => m.mirrorId === mirrorId);
        return {
          username: a.username,
          traderName: mirror?.parentUsername || manualNames[String(mirrorId)] || a.username,
          instrumentId: 0,
          allocated: a.usdAmount || 0,
          currentValue: mirror ? calcMirrorCurrentValue(mirror) : 0,
          pnlPercent: mirror ? calcMirrorPnL(mirror) : 0,
          status: 'active' as const,
        };
      }),
      totalInvested: result.totalInvested || 0,
      currentPortfolioValue: result.currentPortfolioValue || 0,
      availableCash: result.remainingCash || 0,
      totalPnlPercent: result.totalPnlPercent || 0,
      currency,
      lastRebalance: new Date().toISOString(),
      nextRebalance: new Date(Date.now() + prefs.rebalanceHours * 3600000).toISOString(),
    };

    const plan: AllocationPlan = {
      timestamp: new Date().toISOString(),
      allocations: result.allocations,
      reason: sentiment ? `manual rebalance (sentiment: ${sentiment.label})` : 'manual rebalance',
    };

    const closeQueue = buildCloseQueue(mirrors, result.allocations, result.riskTriggers);
    await context.env.EDA_CONFIG.put('state:close-queue', JSON.stringify(closeQueue));
    await context.env.EDA_CONFIG.put('state:current', JSON.stringify(state));
    await context.env.EDA_CONFIG.put('state:last-plan', JSON.stringify(plan));
    await context.env.EDA_CONFIG.put('state:last-actions', JSON.stringify(result.actions));

    const { portfolio: _p, ...safeResult } = result;
    return Response.json({ ...safeResult, stateSaved: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Rebalance failed' }, { status: 502 });
  }
};

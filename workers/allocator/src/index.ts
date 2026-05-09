import { EtoroClient } from '../../../shared/etoro-client';
import { executeRebalance, buildCloseQueue, calcMirrorCurrentValue, calcMirrorPnL } from '../../../shared/rebalancer';
import { analyzeSentiment, type SentimentResult } from '../../../shared/sentiment';
import type { UserPrefs, AllocatorState, AllocationPlan } from '../../../shared/types';
import type { PortfolioResponse } from '../../../shared/etoro-types';

interface Env {
  EDA_CONFIG: KVNamespace;
  ETORO_API_KEY: string;
  ETORO_USER_KEY: string;
  NEWS_API_KEY: string;
}

interface ExecutionResult {
  closed: { mirrorId: number; reason: string; positions: number }[];
  errors: { mirrorId: number; reason: string; error: string }[];
  timestamp: string;
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

async function executeCloses(
  client: EtoroClient,
  env: Env,
  portfolio: PortfolioResponse,
  prefs: UserPrefs
): Promise<ExecutionResult> {
  const result: ExecutionResult = { closed: [], errors: [], timestamp: new Date().toISOString() };
  const posByInst = new Map<number, number>();
  for (const p of portfolio.clientPortfolio.positions) {
    if (p.instrumentId != null && p.positionId != null) posByInst.set(p.instrumentId, p.positionId);
  }

  const queueRaw = await env.EDA_CONFIG.get('state:close-queue', 'text');
  if (!queueRaw) return result;
  const queue = JSON.parse(queueRaw) as { mirrorId: number; reason: string }[];

  for (const item of queue) {
    const mirror = portfolio.clientPortfolio.mirrors.find(m => m.mirrorId === item.mirrorId);
    if (!mirror) continue;

    let closed = 0;
    for (const mp of mirror.positions) {
      const instId = mp.instrumentId;
      if (instId == null) continue;
      const pid = mp.positionId ?? posByInst.get(instId);
      if (!pid) continue;
      try {
        await client.closePosition(prefs.environment, pid, instId);
        closed++;
      } catch (e) {
        result.errors.push({ mirrorId: item.mirrorId, reason: item.reason, error: String(e) });
      }
    }
    if (closed > 0) {
      result.closed.push({ mirrorId: item.mirrorId, reason: item.reason, positions: closed });
    }
  }

  return result;
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

      const portfolio = await client.getPortfolio(prefs.environment);
      const result = await executeRebalance(client, prefs, sentiment, portfolio);

      const closeQueue = buildCloseQueue(portfolio.clientPortfolio.mirrors, result.allocations, result.riskTriggers);
      await env.EDA_CONFIG.put('state:close-queue', JSON.stringify(closeQueue));

      // Execute closes
      const execResult = await executeCloses(client, env, portfolio, prefs);

      const plan: AllocationPlan = {
        timestamp: new Date().toISOString(),
        allocations: result.allocations,
        reason: sentiment ? `scheduled rebalance (sentiment: ${sentiment.label})` : 'scheduled rebalance',
      };

      const currency = prefs.currency || 'EUR';
      const state: AllocatorState = {
        activeTraders: result.allocations.map((a) => {
          const mId = parseInt(a.username.replace('mirror-', ''), 10);
          const mirror = portfolio.clientPortfolio.mirrors.find((m) => m.mirrorId === mId);
          return {
            username: a.username,
            traderName: mirror?.parentUsername || a.username,
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

      await env.EDA_CONFIG.put('state:current', JSON.stringify(state));
      await env.EDA_CONFIG.put('state:last-plan', JSON.stringify(plan));
      await env.EDA_CONFIG.put('state:last-actions', JSON.stringify(result.actions));
      await env.EDA_CONFIG.put('state:execution', JSON.stringify(execResult));

      console.log(`[Allocator] Cycle complete — ${result.allocations.length} traders, ${closeQueue.length} positions to close, ${execResult.closed.length} closed, ${execResult.errors.length} errors`);
    } catch (err) {
      console.error('[Allocator] Error:', err);
    }
  },
};
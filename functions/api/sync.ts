import { EtoroClient } from '../../shared/etoro-client';
import {
  calcTotalInvested, calcAvailableCash, calcTotalPnL, calcEquity,
  calcMirrorCurrentValue, calcMirrorPnL, buildCloseQueue,
} from '../../shared/rebalancer';
import type { UserPrefs, AllocatorState } from '../../shared/types';

interface Env {
  EDA_CONFIG: KVNamespace;
  ETORO_API_KEY: string;
  ETORO_USER_KEY: string;
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
    const portfolio = await client.getPortfolio(prefs.environment);

    const cp = portfolio.clientPortfolio;
    const totalInvested = calcTotalInvested(portfolio);
    const availableCash = calcAvailableCash(portfolio);
    const totalPnL = calcTotalPnL(portfolio);
    const currentPortfolioValue = calcEquity(portfolio);
    const totalPnlPercent = totalInvested > 0 ? ((currentPortfolioValue - totalInvested) / totalInvested) * 100 : 0;
    const currency = prefs.currency || 'EUR';
    const mirrors = cp.mirrors;
    const lastRebalance = new Date().toISOString();

    const state: AllocatorState = {
      activeTraders: mirrors.map((m) => ({
        username: `mirror-${m.mirrorId}`,
        traderName: m.parentUsername || `mirror-${m.mirrorId}`,
        instrumentId: 0,
        allocated: calcMirrorCurrentValue(m),
        currentValue: calcMirrorCurrentValue(m),
        pnlPercent: calcMirrorPnL(m),
        status: m.isPaused ? ('closing' as const) : ('active' as const),
      })),
      totalInvested,
      currentPortfolioValue,
      availableCash,
      totalPnlPercent,
      currency,
      lastRebalance,
      nextRebalance: new Date(Date.now() + prefs.rebalanceHours * 3600000).toISOString(),
    };

    await context.env.EDA_CONFIG.put('state:current', JSON.stringify(state));

    return Response.json({
      status: 'ok',
      version: '0.1.0',
      portfolio: {
        totalInvested,
        currentPortfolioValue,
        availableCash,
        totalPnlPercent,
        currency,
        mirrors: mirrors.length,
        regularPositions: cp.positions.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    return Response.json({ status: 'error', version: '0.1.0', error: msg }, { status: 502 });
  }
};

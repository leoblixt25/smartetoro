import type { UserPrefs } from '../../shared/types';

interface Env {
  EDA_CONFIG: KVNamespace;
}

const DEFAULTS: UserPrefs = {
  traderCount: 5, tpPercent: 20, slPercent: 15, rebalanceHours: 4, environment: 'demo',
};

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    const kv = context.env.EDA_CONFIG;
    const method = context.request.method.toUpperCase();

    if (method === 'GET') {
      const raw = await kv.get('user:prefs', 'text');
      return Response.json(raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS);
    }

    if (method === 'POST' || method === 'PUT') {
      const body = await context.request.json<Partial<UserPrefs>>();
      const existing = await kv.get('user:prefs', 'text').then(r => r ? JSON.parse(r) : {});
      const merged = { ...DEFAULTS, ...existing, ...body };
      await kv.put('user:prefs', JSON.stringify(merged));
      return Response.json(merged);
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
};

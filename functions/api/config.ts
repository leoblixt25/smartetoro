import type { UserPrefs } from '../../shared/types';

interface Env {
  EDA_CONFIG: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const kv = context.env.EDA_CONFIG;
  const method = context.request.method.toUpperCase();

  const defaults: UserPrefs = {
    traderCount: 5,
    tpPercent: 20,
    slPercent: 15,
    rebalanceHours: 4,
    environment: 'demo',
  };

  if (method === 'GET') {
    const raw = await kv.get('user:prefs', 'text');
    return Response.json(raw ? { ...defaults, ...JSON.parse(raw) } : defaults);
  }

  if (method === 'POST' || method === 'PUT') {
    const body = await context.request.json<Partial<UserPrefs>>();
    const existing = await kv.get('user:prefs', 'text').then(r => r ? JSON.parse(r) : {});
    const merged = { ...defaults, ...existing, ...body };
    await kv.put('user:prefs', JSON.stringify(merged));
    return Response.json(merged);
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
};

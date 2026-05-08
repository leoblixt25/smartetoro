import { EtoroClient } from '../../shared/etoro-client';

interface Env {
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
    const client = new EtoroClient({ apiKey, userKey, environment: 'demo' });
    const portfolio = await client.getPortfolio('demo');
    return Response.json(portfolio);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'eToro API call failed' }, { status: 502 });
  }
};

import { EtoroClient } from '../../shared/etoro-client';

interface Env {
  ETORO_API_KEY: string;
  ETORO_USER_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const apiKey = context.env.ETORO_API_KEY;
  const userKey = context.env.ETORO_USER_KEY;

  if (!apiKey || !userKey) {
    return Response.json({ error: 'eToro API keys not configured' }, { status: 401 });
  }

  const environment = 'demo';
  const client = new EtoroClient({ apiKey, userKey, environment });
  const portfolio = await client.getPortfolio(environment);
  return Response.json(portfolio);
};

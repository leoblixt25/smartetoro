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

  const query = new URL(context.request.url).searchParams.get('q');
  if (!query) {
    return Response.json({ error: 'Missing search query (q)' }, { status: 400 });
  }

  const client = new EtoroClient({ apiKey, userKey, environment: 'demo' });
  const traders = await client.searchTraders(query);
  return Response.json(traders);
};

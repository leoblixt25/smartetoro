interface Env {
  EDA_CONFIG: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    const kv = context.env.EDA_CONFIG;
    const method = context.request.method.toUpperCase();

    if (method === 'GET') {
      const raw = await kv.get('manual:trader-names', 'text');
      return Response.json(raw ? JSON.parse(raw) : {});
    }

    if (method === 'POST' || method === 'PUT') {
      const body = await context.request.json<Record<string, string>>();
      await kv.put('manual:trader-names', JSON.stringify(body));
      return Response.json(body);
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Internal error' }, { status: 500 });
  }
};

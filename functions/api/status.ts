interface Env {
  EDA_CONFIG: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    const allocatorState = await context.env.EDA_CONFIG.get('state:current', 'text');
    return Response.json({
      status: 'ok',
      version: '0.1.0',
      allocator: allocatorState ? JSON.parse(allocatorState) : null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json({ status: 'error', version: '0.1.0', allocator: null, timestamp: new Date().toISOString() });
  }
};

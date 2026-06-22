import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_SHARES_PER_HOUR = 10;
const WINDOW_MINUTES = 60;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { workspace } = await req.json() as { workspace: 'roblox' | 'head3d' };

    if (!workspace || !['roblox', 'head3d'].includes(workspace)) {
      return new Response(JSON.stringify({ error: 'Invalid workspace' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      'unknown';

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

    const { count, error: countError } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('workspace', workspace)
      .gte('created_at', windowStart);

    if (countError) throw countError;

    const currentCount = count ?? 0;

    if (currentCount >= MAX_SHARES_PER_HOUR) {
      const { data: oldest, error: oldestError } = await supabase
        .from('rate_limits')
        .select('created_at')
        .eq('ip', ip)
        .eq('workspace', workspace)
        .gte('created_at', windowStart)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (oldestError) throw oldestError;

      const resetAt = new Date(oldest.created_at).getTime() + WINDOW_MINUTES * 60 * 1000;
      const minutesLeft = Math.ceil((resetAt - Date.now()) / 60000);

      return new Response(
        JSON.stringify({
          allowed: false,
          minutesLeft,
          message: `Rate limit exceeded. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.`,
        }),
        {
          status: 429,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        },
      );
    }

    const { error: insertError } = await supabase
      .from('rate_limits')
      .insert({ ip, workspace });

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({ allowed: true, remaining: MAX_SHARES_PER_HOUR - currentCount - 1 }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[check-rate-limit] Error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

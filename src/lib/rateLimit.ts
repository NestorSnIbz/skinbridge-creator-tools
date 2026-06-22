const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-rate-limit`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export class RateLimitError extends Error {
  minutesLeft: number;
  constructor(message: string, minutesLeft: number) {
    super(message);
    this.name = 'RateLimitError';
    this.minutesLeft = minutesLeft;
  }
}

export async function checkRateLimit(workspace: 'roblox' | 'head3d'): Promise<void> {
  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ workspace }),
    });

    const result = await res.json();

    if (res.status === 429) {
      const mins = result.minutesLeft ?? 1;
      throw new RateLimitError(
        `Too many shares. Please wait ${mins} minute${mins !== 1 ? 's' : ''} before sharing again.`,
        mins,
      );
    }

    if (!res.ok) {
      throw new Error(result.message ?? 'Failed to verify rate limit. Please try again.');
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    // Error de red: dejar pasar para no bloquear al usuario por fallos de infraestructura
    console.warn('[checkRateLimit] Network error, skipping check:', err);
  }
}

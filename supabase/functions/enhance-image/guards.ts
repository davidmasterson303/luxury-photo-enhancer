/* -- Request guards: CORS, auth, rate limiting ----------------------
 *
 * [!]  DUPLICATED FILE. An identical copy lives at
 *     supabase/functions/validate-image/guards.ts
 *     Change one, change both. They must not drift.
 *
 * Why the duplication: same reason as models.ts - these functions are
 * deployed through the Supabase dashboard editor, whose file tree is
 * flat. It cannot express the `../_shared/` layout the CLI supports,
 * so a per-function copy is the price of deploying without the CLI.
 *
 * Every entry point that spends Gemini quota must apply all three of
 * these. validate-image went live with none of them and was a fully
 * open endpoint; CORS alone constrains browsers, not curl.
 */

const DEMO_ORIGIN = "https://luxuryphotoenhancer-demo.davidmasterson.co";

const ALLOWED_ORIGINS = new Set([
  DEMO_ORIGIN,
  "http://localhost:5173",
  "http://localhost:4173",
]);

/* Unknown origins get the demo domain echoed back, which makes the
 * browser block the response rather than silently allowing it. */
export function corsHeadersFor(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : DEMO_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
}

export function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/* Injected automatically into every Supabase Edge Function. */
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

/* The anon key is public by design, so this is not authentication -
 * it only means a caller has to have loaded our client at least once.
 * That is enough to stop the cheap abuse case: a curl loop that found
 * the function URL and never touched the site. Skipped when the env
 * var is absent so local `supabase functions serve` still works. */
export function hasValidAnonKey(req: Request): boolean {
  if (!SUPABASE_ANON_KEY) return true;
  const authHeader = req.headers.get("authorization") ?? "";
  const apiKeyHeader = req.headers.get("apikey") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return bearer === SUPABASE_ANON_KEY || apiKeyHeader === SUPABASE_ANON_KEY;
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

/* Per-IP sliding window, in memory per isolate: not durable across cold
 * starts, and deliberately not the spend cap - it only stops a loop
 * hammering one isolate. A real daily budget is a separate concern. */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  return function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const stamps = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (stamps.length >= max) {
      hits.set(ip, stamps);
      return true;
    }
    stamps.push(now);
    hits.set(ip, stamps);
    // Opportunistic cleanup so the map can't grow unbounded.
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
    }
    return false;
  };
}

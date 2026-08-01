/* -- Request guards: CORS, auth, rate limiting ----------------------
 *
 * [!]  DUPLICATED FILE. An identical copy lives at
 *     supabase/functions/enhance-image/guards.ts
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

/* -- Why there is no app-level key check here ----------------------
 *
 * There used to be one: a string comparison of the caller's key against
 * Deno.env.get("SUPABASE_ANON_KEY"). It was removed on 2026-08-01 after
 * it locked every real visitor out of enhance-image with a 401.
 *
 * The cause is that this project has Supabase's newer API key system
 * enabled (sb_publishable_... / sb_secret_...) alongside the legacy JWT
 * keys. SUPABASE_ANON_KEY as injected into a function is the publishable
 * key; the browser bundle ships the legacy anon JWT. Both are valid
 * credentials for this project, they are simply different strings, so an
 * equality check rejects a caller the platform itself accepts.
 *
 * It is not worth repairing. The check was never authentication - the
 * anon key ships in the client bundle by design, so "has the key" means
 * "read our JavaScript". Its only claim was stopping a curl loop that
 * never loaded the site, and verify_jwt (see supabase/config.toml) does
 * exactly that at the gateway, before this code runs.
 *
 * The controls that actually bound spend are below: the per-IP window in
 * this file, and the daily ceiling in budget.ts.
 *
 * If verify_jwt is ever turned off, that gateway check disappears and
 * these endpoints become reachable by any POST. Do not turn it off.
 */

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

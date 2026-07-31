/*
  # Daily spend ceiling for the demo

  The per-IP sliding window in the edge functions caps a burst on one
  isolate. It does nothing about 500 uploads spread across twelve hours,
  across cold starts, or across addresses — each upload being one
  validation call plus four generation calls against a personal Gemini
  key on a publicly linked demo.

  1. New tables
    - `demo_usage`
      - `day` (date, primary key) — one row per UTC day
      - `calls` (integer) — Gemini calls consumed that day

  2. New functions
    - `consume_demo_call(p_budget integer)` — atomically reserves one
      call and reports whether it was within budget

  3. Security
    - RLS enabled with no policies. The service role does not need a
      permitting policy — it bypasses RLS outright — so "no policies" is
      the closed state for everyone else, not an oversight. Adding a
      policy to "let the function through" would only widen access.
    - EXECUTE on consume_demo_call is revoked from PUBLIC/anon/
      authenticated and granted to service_role only. See the note above
      the revoke: the default grant would have been reachable with the
      anon key over PostgREST.
*/

CREATE TABLE IF NOT EXISTS demo_usage (
  day date PRIMARY KEY,
  calls integer NOT NULL DEFAULT 0
);

ALTER TABLE demo_usage ENABLE ROW LEVEL SECURITY;

/*
  Reserves one call against today's budget and returns the outcome.

  The reservation is a single statement. Four parallel variations per
  upload is precisely the pattern that breaks read-modify-write, so the
  check lives in the ON CONFLICT ... WHERE clause where the row is
  already locked by the upsert, rather than in a separate SELECT.

  The WHERE also means a refused call does not increment. An unguarded
  `SET calls = calls + 1` would let a flood push the counter far past the
  ceiling and lock out the rest of the day on requests that never reached
  Gemini — the counter would be measuring attempts, not spend.
*/
CREATE OR REPLACE FUNCTION consume_demo_call(p_budget integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_total integer;
BEGIN
  -- A non-positive budget is a closed demo, not an invitation to insert
  -- the day's first row and call it allowed.
  IF p_budget IS NULL OR p_budget <= 0 THEN
    RETURN jsonb_build_object('allowed', false, 'calls', 0);
  END IF;

  INSERT INTO demo_usage (day, calls)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (day) DO UPDATE
    SET calls = demo_usage.calls + 1
    WHERE demo_usage.calls < p_budget
  RETURNING calls INTO new_total;

  -- No row came back: the WHERE excluded it, so the ceiling is reached.
  IF NOT FOUND THEN
    SELECT calls INTO new_total FROM demo_usage WHERE day = CURRENT_DATE;
    RETURN jsonb_build_object('allowed', false, 'calls', COALESCE(new_total, 0));
  END IF;

  RETURN jsonb_build_object('allowed', true, 'calls', new_total);
END;
$$;

/*
  Postgres grants EXECUTE on new functions to PUBLIC by default, and
  Supabase exposes every function in the public schema over PostgREST.
  Without this revoke, any visitor holding the anon key — which ships in
  the client bundle by design — could call the spend counter directly and
  drain the day's budget without generating a single portrait.
*/
REVOKE ALL ON FUNCTION consume_demo_call(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION consume_demo_call(integer) FROM anon;
REVOKE ALL ON FUNCTION consume_demo_call(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION consume_demo_call(integer) TO service_role;

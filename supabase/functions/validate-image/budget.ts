/* -- Daily spend ceiling --------------------------------------------
 *
 * [!]  DUPLICATED FILE. An identical copy lives at
 *     supabase/functions/enhance-image/budget.ts
 *     Change one, change both. They must not drift.
 *
 * Why the duplication: same reason as models.ts and guards.ts - these
 * deploy through the Supabase dashboard editor, whose file tree is flat.
 *
 * The per-IP window in guards.ts caps a burst on one isolate. This caps
 * the day, durably, across isolates and addresses. Both functions draw
 * on one shared counter, so the number to reason about is simply "Gemini
 * calls today" rather than two budgets that interact.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/* Absent or unparseable means the ceiling is simply not configured, and
 * the demo runs as it did before. Set it to switch spend protection on. */
const RAW_BUDGET = Deno.env.get("DAILY_CALL_BUDGET") ?? "";
const DAILY_CALL_BUDGET = /^\d+$/.test(RAW_BUDGET.trim())
  ? Number(RAW_BUDGET.trim())
  : null;

/* A blunt manual switch, independent of the counter: set DEMO_ENABLED to
 * "false" to close the demo immediately without touching code. */
const DEMO_DISABLED = (Deno.env.get("DEMO_ENABLED") ?? "true").toLowerCase() === "false";

export type BudgetVerdict =
  | { allowed: true }
  | { allowed: false; reason: "disabled" | "exhausted" };

/* Fails OPEN when no ceiling is configured, because that is the explicit
 * "feature off" state. Fails CLOSED when a ceiling is configured but the
 * check itself errors: once spend protection has been asked for, a
 * broken guard must not quietly hand out unmetered Gemini calls. */
export async function reserveCall(): Promise<BudgetVerdict> {
  if (DEMO_DISABLED) return { allowed: false, reason: "disabled" };
  if (DAILY_CALL_BUDGET === null) return { allowed: true };

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("DAILY_CALL_BUDGET set but Supabase credentials are missing");
    return { allowed: false, reason: "exhausted" };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_demo_call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ p_budget: DAILY_CALL_BUDGET }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      console.error("Budget check failed:", response.status, await response.text());
      return { allowed: false, reason: "exhausted" };
    }

    const result = await response.json() as { allowed?: boolean; calls?: number };
    if (result.allowed === true) return { allowed: true };

    console.warn(`Daily call budget reached (${result.calls}/${DAILY_CALL_BUDGET})`);
    return { allowed: false, reason: "exhausted" };
  } catch (error) {
    console.error("Budget check error:", error);
    return { allowed: false, reason: "exhausted" };
  }
}

/* One code and one message for both refusals: from the visitor's side
 * "closed for the day" and "closed by hand" are the same event, and the
 * client already treats BUDGET_EXHAUSTED as non-retryable. */
export const BUDGET_RESPONSE = {
  error: "The atelier is fully booked today. Please return tomorrow.",
  code: "BUDGET_EXHAUSTED",
} as const;

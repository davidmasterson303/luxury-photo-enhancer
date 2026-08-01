# Lumière — deploy runbook

Written 2026-08-01, while recovering from a stale `VITE_SUPABASE_URL` secret
that had the live demo pointed at a deleted Supabase project.

Everything here is dashboard clicks. No terminal, except the one commit that
already happened (the preflight assertion — see step 3).

**Do the steps in order.** The order is the point: each one makes the next
step's failure legible. Skipping ahead — particularly turning on the daily
budget before a portrait has ever generated — produces symptoms that look
identical to two different causes.

---

## The state this starts from

| | Value |
|---|---|
| Live front end | Netlify, current with `main`'s front-end code |
| Live front end talks to | `ngubpkpgpdbklyvygoww.supabase.co` — **deleted, NXDOMAIN** |
| `supabase/config.toml` says | `yfstictbmgguktlxeasr` — alive, returns 401 as expected |
| Local `main` | six commits ahead of `origin/main`, deliberately unpushed |
| Edge functions live | whatever was last hand-pasted into the dashboard; unknown |
| `demo_usage` table | never applied — CI does not run migrations |

A visitor today: upload succeeds, validation fails open by design, generation
retries against a dead host, and they get the connection error. No portrait is
possible until step 2 lands.

---

## Step 1 — Confirm the real project ref, by eye

Do not take this from `config.toml`. That file is an artifact too, and reading
config off an artifact instead of the source is the exact move that caused this.

1. Go to <https://supabase.com/dashboard>
2. Click the project that serves this demo
3. Left sidebar → **Project Settings** (gear, bottom) → **API**
4. Read **Project URL**. It looks like `https://<ref>.supabase.co`

Write down that `<ref>`.

**You do not need the anon key.** It was checked and is already correct. Supabase
anon keys are JWTs carrying the project ref as a claim, and the one in the live
bundle decodes to `{"iss":"supabase","ref":"yfstictbmgguktlxeasr","role":"anon"}`
— so the deployed front end has been shipping a valid key for the live project
next to a URL pointing at a deleted one. A mismatched pair, and only the URL half
is wrong. Re-entering the key would be motion without progress.

That decode is also the best confirmation of the ref available, better than
anything else here: it comes from a credential Supabase itself issued and signed,
not from a file in the repo claiming a value.

**If the ref is `yfstictbmgguktlxeasr`** — matches the repo. Continue to step 2.

**If it is anything else** — the repo is stale too. Edit
`supabase/config.toml` line 12 to the real ref before step 3, or CI will stop
with a mismatch error. That's the assertion doing its job, but fix it up front
rather than discovering it in a red run.

---

## Step 2 — Correct the one stale secret

Exactly one field. Everything else on this page is already right.

1. <https://github.com/davidmasterson303/luxury-photo-enhancer>
2. **Settings** tab → left sidebar **Secrets and variables** → **Actions**
3. Find `VITE_SUPABASE_URL` → pencil icon → paste:

   ```
   https://yfstictbmgguktlxeasr.supabase.co
   ```

   → **Update secret**
   - No trailing path, no trailing spaces. A trailing `/` is fine — the
     preflight tolerates it.
   - GitHub may interrupt with sudo-mode re-authentication ("Confirm access →
     Verify via email"). Complete it, then re-check the field: it can clear on
     the way back, and the update silently does not apply.
   - Confirm the **Updated** timestamp changes. If it still reads the old date,
     the save did not go through — this has already happened once.

`VITE_SUPABASE_ANON_KEY` is correct — see step 1. Do not touch it.

### `SUPABASE_ACCESS_TOKEN` — needed, but not blocking today

The repo currently holds four secrets and this is not among them, so the
functions job will stop at its preflight with the secret named. That is the
designed behaviour, not a failure: the two deploy jobs are independent, so the
front end deploys anyway and step 5 becomes possible without it.

It is not optional, though — only that job closes the gap described in step 5.
When you want it: Supabase dashboard → avatar (top right) → **Access Tokens** →
**Generate new token**. Copy it immediately; it is shown once. Then add it here
as a repository secret.

---

## Step 3 — Push, now that the preflight is in place

The commit sitting locally adds a check to **both** deploy jobs: parse the ref
out of `VITE_SUPABASE_URL`, compare it to `project_id` in `config.toml`, and
stop the deploy if they disagree.

It is in both jobs on purpose. The two deploys are independent and run in
parallel, so guarding only the functions job would reproduce exactly today's
outcome — a red functions run beside a green Netlify deploy that shipped a
front end wired to nothing. Visitors see the front end, not the red X.

Push via **GitHub Desktop** (CLI pushes on this repo 403 on stale keychain
credentials):

1. Open GitHub Desktop
2. Confirm the repo selector top-left reads **luxury-photo-enhancer**
3. Confirm the branch reads **main**
4. You should see two commits to push. Click **Push origin**

If Desktop shows uncommitted changes to `.github/workflows/ci.yml` or
`supabase/config.toml`, those are the preflight — commit them first.

---

## Step 4 — Watch the run

1. Repo → **Actions** tab → newest run at the top
2. Three jobs: `build-and-test`, then `deploy` and `deploy-functions` in parallel

What you want to see:

- **`Verify the Supabase URL matches the repo's project`** — green, logging
  `Building against project <ref> (matches config.toml)`
- **`Resolve and verify the target project ref`** — green, same ref
- Both deploys green

If either preflight is red, it prints both values and which file each came
from. That message is the whole reason this step exists — fix whichever is
stale and push again.

**First functions deploy.** This is the first time CI has ever shipped the edge
functions; they were hand-pasted before. Expect the deployed code to change,
including the model IDs in `models.ts` — a retired `gemini-2.0-flash-exp` alias
previously sat in `validate-image` for months returning 500s. That's a fix, but
it means the backend behaviour genuinely changes at this step.

---

## Step 5 — Verify a real upload produces a portrait

**Do this before touching the budget.** It spends about five Gemini calls.

1. Open <https://luxuryphotoenhancer-demo.davidmasterson.co/> in a private
   window (avoids any cached bundle)
2. Upload a photo — use a real iPhone HEIC export if you have one, since that
   path was rebuilt and has never been exercised end to end
3. Expect: validation passes, the grid appears, four variations fill in
   progressively
4. Download one. Confirm the file extension matches what actually opens

If it fails here, the failure is now honest — the budget is off, so anything
you see is a real bug rather than a spend ceiling.

### What a successful upload does and does not prove

It proves generation works. It does **not** prove the deployed edge functions
match `main`.

The functions on that project were deployed by hand and their vintage is
unknown. Validation fails open by design, so a months-stale `validate-image`
returning 500 is invisible from the front end — generation carries on and a
portrait still appears. A retired model ID sat in that function for exactly this
reason once already.

Only the `deploy-functions` job closes that gap, which is what makes
`SUPABASE_ACCESS_TOKEN` not-optional even though it is not blocking today. Until
that job runs green, treat the backend as "works" rather than "is what the repo
says".

This closes the "Not yet verified" note that has been open in
`CODE-REVIEW-HANDOFF.md` since 30 July.

---

## Step 6 — Apply the migration

Only once step 5 has produced a portrait.

The `demo_usage` table and `consume_demo_call` function do not exist yet, and
CI does not apply migrations. Without them the budget code fails **closed**.

1. Supabase dashboard → your project → **SQL Editor** (left sidebar)
2. **New query**
3. Open `supabase/migrations/20260731120000_create_demo_usage.sql` in the repo
   (or on GitHub) and paste the whole file
4. **Run**
5. Confirm: **Table Editor** → `demo_usage` exists, zero rows

Note: running it through the SQL Editor applies the schema but does not record
it in the CLI's migration history. Fine for a demo. If you ever run
`supabase db push` later, `CREATE TABLE IF NOT EXISTS` and `CREATE OR REPLACE
FUNCTION` make it safe to re-apply.

---

## Step 7 — Turn on the daily budget

Only once step 6 is done. Turning it on before the table exists makes every
visitor see "The atelier is fully booked today" — indistinguishable from a
working ceiling, which is why this is last.

1. Supabase dashboard → **Project Settings** → **Edge Functions** → **Secrets**
   (some layouts: Settings → **Functions** → Secrets)
2. Add `DAILY_CALL_BUDGET` — an integer. One upload = 1 validation + 4
   generation calls, so **50** is roughly ten full runs a day.
3. Confirm `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are present. Supabase
   normally injects both automatically; if not, add them from Settings → API.
4. Reload the demo and run one upload. It should still work.
5. Check **Table Editor** → `demo_usage` — today's row should show `calls`
   climbing by 5 per upload. That row is your proof the counter is live.

**The off switch:** add `DEMO_ENABLED` = `false` to close the demo immediately
without touching code. Remove it or set `true` to reopen.

**To roll back:** delete `DAILY_CALL_BUDGET`. Unset means the ceiling is off and
the demo runs unmetered, which is the pre-step-7 behaviour.

---

## Step 8 — Cap the spend at Google, too

Everything above is application-level. It protects against a busy demo, not
against a bug in the demo. A cap at the provider is the layer that holds when
the app's own accounting is wrong.

In the Google Cloud console for the project holding the Gemini key:

- Set a **budget alert** on the billing account (Billing → Budgets & alerts)
- Set a **quota limit** on the Generative Language API (APIs & Services →
  the API → Quotas), capping requests per day

The console's layout shifts; treat these as the destinations rather than exact
click paths. The goal is a hard ceiling that does not depend on this repo's
code being correct.

---

## Sequence at a glance

```
1. Read the real ref from Supabase Settings → API              (by eye)
2. Update VITE_SUPABASE_URL on GitHub          ← the only stale value
3. Push six commits (GitHub Desktop) — preflight ships with them
4. Watch Actions; the Netlify preflight must log a matching ref
     deploy-functions goes red on the missing token — expected
5. Upload a photo; confirm a portrait generates          ← budget still OFF
     proves generation, NOT that functions match main
6. Apply the migration in the SQL Editor
7. Set DAILY_CALL_BUDGET; confirm demo_usage increments
8. Cap quota/billing at Google
   ·  Add SUPABASE_ACCESS_TOKEN whenever — closes the step 5 gap
```

Steps 1–5 fix the outage. 6–8 are spend protection and can wait, but should
land before the link is promoted anywhere.

---

## Still open after this runbook

Tracked in `CODE-REVIEW-HANDOFF.md`; none of it blocks shipping.

- **Item 3 — README screenshot.** The one gap in the repo first-impression
  pass, and the plan called it the single highest-value addition in the
  document. Naturally step 5's tail: the shot worth having is the
  four-variation grid mid-fill, which needs a reachable backend.
- **Item 8a — the two prohibited-word lists.** The matching semantics were
  unified on both sides and the `+ 5` offset window is gone. What remains is a
  per-word question, not a structural one: *would you want this blocked on the
  server too?*
  - `space`, `flying`, `driving`, `motorcycle`, `kid`, `historical` — no.
    Accidental strictness on plausible prompts. `space` is safe to delete
    outright: `/in (space|underwater)/i` in `phrasePatterns` already catches
    the actual risk, so "in space" stays blocked while "more space between me
    and the background" starts working.
  - `younger`, `older`, `child`, `baby`, `plastic surgery` — arguably yes, in
    which case they belong on the *server*, because that is the gate `curl`
    cannot skip. Blocking identity and age changes client-side only is
    protection you lose to anyone who reads the network tab.
- **The structural fix, once the functions job proves out.** CI deploying
  functions removes the flat-file-tree constraint that forced the duplication
  banners, so `supabase/functions/_shared/prompt-rules.ts` becomes viable — one
  list, imported by both sides, drift impossible rather than policed. These
  lists are a better candidate than `guards`/`budget`/`models`, which are
  duplicated but identical; these two actually diverged, and semantically.
  The cost: it commits the project to CI-only function deploys, since the
  dashboard editor cannot express `../_shared/`. Worth paying, but worth
  knowing before an incident rather than during one.
- **Item 10 — collapsing `variationStatus` / `photoState.variations`.** Cut.
  Already optional in the plan, and merging the arrays now risks a fresh
  desync bug in the one flow visitors actually walk.

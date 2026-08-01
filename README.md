# Lumière — Portrait Atelier

Turns a selfie or uploaded photo into a polished profile portrait. Pick a style,
and an image model recalibrates lighting, background, and attire while leaving the
person's face alone. Four variations generate in parallel and fill into the grid
as each one lands.

**Live demo:** https://luxuryphotoenhancer-demo.davidmasterson.co

A proof of concept, not a production product — built to explore what a
multimodal image pipeline feels like when the failure modes are taken
seriously. The interesting parts are in [Engineering notes](#engineering-notes).

## What it does

1. Capture from the webcam or upload a file (JPG, PNG, HEIC).
2. A vision model checks the photo is usable — one clear subject, a detectable
   face, no severe quality problems — and flags whether extra people need
   removing.
3. Four styles generate in parallel: **Natural**, **Corporate**, **Vacation**,
   **Editorial**.
4. Pick one, compare against the original with a drag slider, and download. Or
   write a custom prompt, within limits the app enforces on both sides.

## Architecture

```
Browser (React/Vite)
    │  multipart POST, Supabase anon key
    ▼
Supabase Edge Function (Deno)  ── validate-image   ─┐
                               ── enhance-image    ─┤
                                                    ▼
                                        Google Gemini API
```

Everything that costs money runs server-side. Three consequences worth naming:

- **The Gemini key never reaches the client.** It lives as a Supabase Function
  secret. The browser only ever holds the Supabase anon key, which is public by
  design and grants nothing but the ability to call these two functions.
- **Validation and enhancement are separate functions** because they have
  different cost profiles and different failure semantics. Validation is one
  cheap vision call per upload and fails *open* — a validator outage should not
  stop someone using the app. Enhancement is four image-generation calls per
  click and fails *closed*, per slot.
- **Both functions carry the same guards** — origin allow-list, anon-key check,
  per-IP rate limit, and a shared daily call ceiling — because CORS only
  constrains browsers. It does nothing about `curl`. When the day's budget is
  spent the app shows a capacity notice rather than an error: for a demo on a
  metered model, running out is a normal operating state, not a fault.

## Engineering notes

The decisions that were not obvious, and what they cost to learn:

**Stale closures around async generation.** Person-removal never applied on the
first pass. The flag was React state, read inside an async flow that started in
the same tick it was set, so the read saw the previous render's value. It is a
`useRef` now (`personRemovalRef` in `App.tsx`), along with the resized file and
the object URL, for the same reason. This is deliberate — converting them back
to `useState` reintroduces the bug.

**One failed variation used to discard three paid ones.** `Promise.all` rejects
on first failure, so a single 502 threw away three successful generations and
showed an error screen. It is `Promise.allSettled` with per-slot status updates,
so each tile independently resolves to done or failed, and a failed tile offers
a retry that regenerates only itself.

**Retry counts multiply.** A three-attempt retry loop across four parallel
variations is up to twelve Gemini calls from one click. It is two attempts with
jittered backoff, plus a `NON_RETRYABLE` set so requests the API rejected
outright (bad prompt, bad request, unauthorized) fail immediately instead of
burning a second call to be told the same thing.

**Substring matching on a blocklist gives false positives.** "fireplace" matched
`fire`; "deadline" matched `dead`; "jointly" matched `joint`. Both sides are
word-boundary matched now, with negation handling so "no weapons" does not trip
`weapon`.

**Negation has a scope, and offsets do not express it.** The client used to
rescue a negated keyword by finding it with `indexOf`, finding an allowed phrase
with a regex, and comparing the two string offsets against a `< length + 5`
window. It failed in both directions — "no sexy lighting and sexy pose" passed,
because only the first occurrence was ever examined, while "not sexy" was
rejected for not being one of the literal rescue phrases. Every occurrence is
checked now, and the search for a negation stops at the clause boundary rather
than running back a fixed number of characters: otherwise one opening "no"
launders every later use of the word, and "no X and X" cannot be told apart from
"no X and no X".

The two sides deliberately keep *different word lists* — the client's is longer
because it is UX guidance, the server's is trimmed to what it will actually
enforce — but they share matching semantics. Where they differ, the server wins,
because it is the one a `curl` has to get past.

**HEIC is the likeliest input and the one that did not work.** iPhones shoot
HEIC, and no browser engine outside Safari decodes it. The format was advertised
in the file picker and in the UI copy, then dead-ended on a generic error. It is
converted to JPEG in the browser now, via a dynamically imported converter that
is only fetched when someone actually uploads one. Decoding also moved from a
`FileReader` data URL to `createImageBitmap`, which skips materialising a ~13MB
base64 string for a 10MB upload.

**The camera kept recording after cancel.** The cleanup function closed over the
`stream` state from the render in which the effect ran — `null` on mount — so it
stopped nothing, and the capture indicator stayed lit. The stream is a ref, and
the effect also handles `getUserMedia` resolving *after* the user backs out.

## Running locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in your Supabase project URL and anon key.
`GEMINI_API_KEY` is not a client variable — set it as a Supabase Function secret:

```bash
supabase secrets set GEMINI_API_KEY=...
```

Other scripts: `npm test` (Vitest), `npm run typecheck`, `npm run lint`,
`npm run build`.

## Operating the demo

Three Edge Function secrets control spend and are safe to change at any time
without a deploy:

| Secret | Effect |
|---|---|
| `DAILY_CALL_BUDGET` | Max Gemini calls per UTC day, shared by both functions. One sitting costs 5 (1 validation + 4 generations). Unset means no ceiling. |
| `DEMO_ENABLED` | Set to `false` to close the demo immediately, independently of the counter. |
| `VALIDATE_DEBUG` | Set to `true` to re-enable verbose validation logging. Off by default — those logs contained the model's analysis of a user's photo. |

Once `DAILY_CALL_BUDGET` is set, a budget check that *errors* refuses the call
rather than allowing it. Asking for spend protection and then silently getting
none is the failure mode worth designing against; a demo being briefly down is
recoverable, an unbounded bill is not.

Today's usage lives in `demo_usage`. Row-level security is on with no policies,
so only the service role — i.e. the Edge Functions — can read or write it.

> **Apply the migration before setting `DAILY_CALL_BUDGET`.** CI deploys the
> functions but does not run migrations, so `demo_usage` and `consume_demo_call`
> have to be applied to the project first — `supabase db push`, or paste
> `supabase/migrations/20260731120000_create_demo_usage.sql` into the SQL Editor.
> Setting the budget without them means every budget check errors, and because
> the check fails closed, every visitor gets "fully booked today" — which looks
> exactly like a working ceiling. Verify a generation succeeds *before* turning
> the budget on, so the two states stay distinguishable.

Deployment, and the order to do it in, is in
[DEPLOY-RUNBOOK.md](DEPLOY-RUNBOOK.md).

## Stack

- Vite, React 18, TypeScript
- Tailwind CSS, Lucide icons
- Supabase Edge Functions (Deno)
- Google Gemini — image generation and vision. Model IDs are pinned in one place
  per function (`supabase/functions/*/models.ts`) rather than buried in URL
  literals; the last time one was inlined, the alias was retired and the
  validator returned 500 for months without anyone noticing.

## What I would do differently at production scale

This is a demo on a personal API key, and several things are sized for that:

- **Rate limiting is two layers, and only one of them is durable.** The per-IP
  sliding window is in-memory per isolate: it stops a loop hammering one
  endpoint, but does not survive cold starts or aggregate across addresses.
  Underneath it sits a real daily ceiling (`DAILY_CALL_BUDGET`) backed by a
  Postgres row, which is what actually bounds the bill. Production would want
  the burst layer durable too, and per-user quotas rather than one global pool.
- **Images move as base64 data URLs.** Fine for one portrait at a time; wasteful
  at any volume. Object storage with signed URLs, passing references instead of
  bytes.
- **Generation is synchronous.** Four parallel calls inside a request that the
  user waits on. A queue with a job ID and polling or websockets would survive
  slow upstreams and let a user close the tab.
- **Validation fails open by design.** Correct for a demo where a false reject is
  worse than a wasted call. At real volume that is a spend leak, and the tradeoff
  flips.

## License

MIT — see [LICENSE](LICENSE).

Originally scaffolded with [Bolt.new](https://bolt.new), substantially rewritten since.

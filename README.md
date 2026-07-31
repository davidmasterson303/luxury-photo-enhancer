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
  per-IP rate limit — because CORS only constrains browsers. It does nothing
  about `curl`.

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
`fire`; "space between" matched `space`. Prompt validation is word-boundary
matched, with negation handling so "no weapons" does not trip `weapon`.

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

- **Rate limiting is in-memory, per isolate.** It stops a loop hammering one
  endpoint and nothing else — it does not survive cold starts and does not
  aggregate across IPs. Production needs a durable counter (Redis, or a
  Postgres row) and a real daily spend ceiling that returns a capacity response
  rather than an error.
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

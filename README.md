# Lumière — Member Directory Portrait Atelier

A proof of concept that turns a quick selfie or uploaded photo into a polished,
professional profile portrait. Upload or capture an image, pick a style, and an
AI image pipeline recalibrates lighting, background, and attire while keeping the
person's face unchanged.

**Live demo:** https://luxuryphotoenhancer-demo.davidmasterson.co

Built and demoed as an internal proof of concept — not a production feature.

## What it does

- Upload or capture a portrait directly in the browser
- Choose a style: Natural Enhancement, LinkedIn Professional, Beach Vacation, or Editorial
- Server-side validation checks the image before enhancement
- AI enhancement returns refined variations to choose from

## Stack

- Vite + React + TypeScript
- Tailwind CSS, Lucide icons
- Supabase Edge Functions (Deno) for server-side image validation and enhancement
- Google Gemini image models — `gemini-2.5-flash-image` for enhancement,
  `gemini-2.0-flash-exp` for validation

## Running locally

1. `npm install`
2. `npm run dev`

The edge functions read `GEMINI_API_KEY` from the Supabase function environment.
Set it as a Supabase Function secret before deploying — never hardcode it.

Built with [Bolt.new](https://bolt.new).

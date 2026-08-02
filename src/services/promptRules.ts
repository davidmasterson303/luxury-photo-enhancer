/* -- Custom prompt enforcement rules -----------------------------------
 *
 * [!]  DUPLICATED FILE. An identical copy lives at
 *     supabase/functions/enhance-image/promptRules.ts
 *     Change one, change both.
 *
 * Unlike guards.ts and models.ts, this pair is not held together by
 * discipline alone: promptRules.parity.test.ts reads both files and fails
 * if the region between the ENFORCEMENT-CORE markers differs. The two
 * copies exist because the client is a Vite bundle and the server is a
 * Deno edge function with no shared build step - not because drift is
 * acceptable. It previously happened, and the client ended up rejecting
 * prompts the server would have run.
 *
 * Division of labour: this file is ENFORCEMENT and is identical on both
 * sides. The client layers guidance on top (minimum length, "describe
 * lighting or background", phrasing hints) because that is UX, and being
 * wrong about it costs a helpful message rather than a hole. The server
 * is authoritative: it is the copy a curl has to get past.
 *
 * Use case is headshots for a members' community. Refusing too much costs
 * someone a rephrase; refusing too little puts the platform's name on an
 * image it would not want to host. The bias is deliberate.
 */

/* ENFORCEMENT-CORE:START */

/* No legitimate reading inside a professional headshot request. Matched on
 * word boundaries, never as substrings - "space between" must not trip
 * 'space', "deadline" must not trip 'dead'. */
export const PROHIBITED_WORDS = [
  // Sexual content and undress
  "naked", "nude", "nudity", "topless", "shirtless", "underwear",
  "lingerie", "bikini", "swimsuit", "cleavage", "thong", "fetish",
  // Minors. Age regression of a real face is refused outright.
  "child", "children", "kid", "kids", "baby", "toddler", "infant",
  "teen", "teenager", "schoolgirl", "schoolboy",
  // Violence and weapons
  "weapon", "weapons", "gun", "guns", "rifle", "pistol", "knife",
  "blood", "bloody", "gore", "gory", "violent", "violence", "corpse",
  "death", "execution", "explosion", "explosions", "combat",
  // Hate and extremism
  "nazi", "swastika", "hitler", "klan", "terrorist", "isis",
  // Drugs and intoxication
  "cocaine", "heroin", "meth", "methamphetamine", "marijuana", "cannabis",
  "drugs", "smoking", "cigarette", "drunk", "alcohol",
  // Self-harm
  "suicide", "self-harm",
  // Impersonation of identity or authority
  "celebrity", "famous", "lookalike", "deepfake", "impersonate",
  "military", "soldier", "police",
  // Body and cosmetic alteration
  "botox", "fillers", "liposuction", "thinner", "slimmer", "skinnier",
  // Not photographic - out of scope for a portrait
  "dragon", "dragons", "unicorn", "unicorns", "monster", "monsters",
  "alien", "aliens", "zombie", "zombies", "vampire", "vampires",
  "werewolf", "werewolves", "shark", "sharks",
  "anime", "cartoon", "comic", "superhero",
  "wizard", "witch", "magical", "astronaut", "levitating",
];

/* Blocked unless every occurrence sits in a negation ("no sexy poses").
 * The app's own style prompts are full of such clauses, and so are the
 * prompts of people trying to be careful. */
export const CONTEXTUAL_WORDS = [
  "sexy", "seductive", "provocative", "sultry", "revealing", "flirty",
];

/* Phrase-level rules for things no single word captures.
 *
 * Every identity pattern requires FIRST-PERSON phrasing ("my face", "make
 * me"). That is not stylistic: the app's own style prompts contain
 * sentences like "DO NOT modify the person's face", and patterns are not
 * negation-aware, so a pattern matching "modify the face" would refuse all
 * four built-in styles. Anchoring on "my" / "me" keeps user requests and
 * system prompts distinguishable. */
export const PROHIBITED_PATTERNS: Array<[RegExp, string]> = [
  // Age alteration of a real person
  [/\bmake me (look |appear )?(younger|older)\b/i, "age"],
  [/\b(de-?age|age me (up|down))\b/i, "age"],
  [/\bmy (younger|older) self\b/i, "age"],
  // Likeness substitution
  [/\b(look|appear) like (a |an |the )?(celebrity|famous|model|actor|actress|singer|someone else)\b/i, "likeness"],
  [/\b(face|head) swap\b/i, "likeness"],
  [/\bswap my (face|head)\b/i, "likeness"],
  [/\bmake me look like [a-z]/i, "likeness"],
  // Protected attributes
  [/\b(lighter|darker|whiter|paler) skin\b/i, "attribute"],
  [/\bchange my (race|ethnicity|skin colou?r|gender|sex)\b/i, "attribute"],
  [/\bmake me (look )?(more|less) (asian|black|white|latino|hispanic|african|european|indian|arab)\b/i, "attribute"],
  // Facial structure and body
  [/\bchange my (face|facial|nose|jaw|chin|cheekbones|eyes|lips|teeth)\b/i, "body"],
  [/\b(reshape|resize|reduce|enlarge) my (nose|jaw|chin|lips|eyes|ears|waist|chest)\b/i, "body"],
  [/\b(lose weight|slim me down|make me thinner|smaller waist)\b/i, "body"],
  [/\bplastic surgery\b/i, "body"],
  // Attempts to redirect the model rather than describe a photo
  [/\bignore (all |any |the )?(previous|prior|above|earlier) (instruction|prompt|rule)/i, "injection"],
  [/\bdisregard (all |the )?(previous|prior|above|earlier)\b/i, "injection"],
  [/\b(system|developer) prompt\b/i, "injection"],
  [/\byou are now\b/i, "injection"],
  [/\bnew instructions?:/i, "injection"],
];

export const NEGATION_PHRASES = [
  "no ", "not ", "avoid ", "without ", "never ", "don't ", "do not ",
  "absolutely no", "remove any", "eliminating", "excluding",
];

/* A negation governs its own clause. A flat character window lets one
 * early "no" launder every later use of the word, which makes "no X and X"
 * indistinguishable from "no X and no X". */
export const CLAUSE_BOUNDARY = /[,.;:!?]|\band\b|\bbut\b|\bthen\b|\balso\b|\bplus\b/gi;

export function escapeForRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${escapeForRegex(word)}\\b`, "i").test(text);
}

/* True only when EVERY occurrence of the word sits in a negation context.
 * Checking one occurrence is how "no sexy lighting and sexy pose" used to
 * pass: the opening clause cleared everything after it. */
export function everyOccurrenceNegated(word: string, text: string): boolean {
  const pattern = new RegExp(`\\b${escapeForRegex(word)}\\b`, "gi");
  let found = false;

  for (const match of text.matchAll(pattern)) {
    found = true;
    const segments = text.substring(0, match.index).split(CLAUSE_BOUNDARY);
    const clause = segments[segments.length - 1];
    if (!NEGATION_PHRASES.some((phrase) => clause.includes(phrase))) return false;
  }

  return found;
}

export interface PromptVerdict {
  allowed: boolean;
  /* Which rule refused, for logs and tests. Never shown to the visitor:
   * naming the tripped category tells someone probing the filter exactly
   * which word to swap. */
  category?: string;
}

export function evaluatePrompt(prompt: string): PromptVerdict {
  const text = prompt.toLowerCase().trim();

  for (const [pattern, category] of PROHIBITED_PATTERNS) {
    if (pattern.test(text)) return { allowed: false, category };
  }

  for (const word of PROHIBITED_WORDS) {
    if (hasWord(text, word)) return { allowed: false, category: "prohibited" };
  }

  for (const word of CONTEXTUAL_WORDS) {
    if (hasWord(text, word) && !everyOccurrenceNegated(word, text)) {
      return { allowed: false, category: "contextual" };
    }
  }

  return { allowed: true };
}

/* ENFORCEMENT-CORE:END */

/* One message for every refusal. A category-specific message is friendlier
 * to the honest user and an oracle for anyone probing the filter, and on a
 * platform where the downside is a hosted image with the client's name on
 * it, that trade does not favour specificity. */
export const PROMPT_BLOCKED_MESSAGE =
  "We can only adjust lighting, background, clothing, and colour — try describing those instead.";

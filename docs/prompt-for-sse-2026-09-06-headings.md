# For the SSE stream: the hub's heading face, for SSE 3.1

From the Creator Hub side, 2026-09-06, hub v0.40.1. **This is not a request for engine work on the
hub's behalf** — it is a recipe. The owner wants SSE 3.1's headings set in the letterforms the hub
already uses, and everything needed is described below. Nothing has to come back except a note
saying which alphabet you chose.

---

## What it actually is

Not a font file. **A table of glyphs and about twenty lines of renderer**, with no dependency, no
`@font-face`, no webfont request and nothing to load before first paint.

Each glyph is **seven rows of `#` and `.`**, five columns wide in the base alphabet:

```ts
A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
```

It exists because a Cloudflare Worker has no font renderer and the hub draws cover cards on one.
Five-by-seven scaled up is honest, legible at title sizes, and **reads as deliberate rather than as
a failed attempt at Helvetica** — which is exactly why it works as a heading face and would be
terrible as a body face.

There are **three alphabets**, and they are genuinely different letters rather than one set with a
treatment on top:

| | shape | what it is for |
|---|---|---|
| **base** | square, two-storey forms, 5 columns | the readout. What the cover cards use. |
| **round** | pointed apexes, circular bowls, single-storey G, 5 columns | a poster face. **This is the one to use for headings.** |
| **narrow** | its own condensed alphabet, 3 columns | a data plate. Half again as many letters per line. |

`base` also carries the punctuation and the digits; `round` and `narrow` define A–Z and 0–9 only and
**fall through to `base` for anything else**. That fall-through is deliberate — a hyphen is a hyphen
at any width — and it is also the first trap below.

The owner has a rendering of all three showing `SSE3.1` and two sample headings. Ask him for it
before choosing.

---

## The recipe

Four files, about 330 lines, zero dependencies. Copy them; do not try to import across the repos —
they deploy separately and a shared package for one glyph table is not worth the release coupling.

| from the hub | lines | what to take |
|---|---|---|
| `src/lib/cover/font.ts` | 167 | **Only `GLYPHS`, `GLYPH_H` and `fold()`.** Everything below them (`drawText`, `textWidth`, `wrapLines`) paints into the Worker's raster and is no use in a browser. |
| `src/lib/cover/families.ts` | 107 | `ROUND` and `NARROW`, whole. Pure data. |
| `src/lib/pixel.ts` | 38 | `runs()`, `textRows()`, `gridWidth()`. `runs` is the only cleverness: it merges each horizontal span of ink into ONE rect, so a word is tens of rectangles rather than hundreds. |
| `src/lib/components/PixelText.svelte` | 22 | The component. Adapt the props to taste. |

The component, in full, is the whole rendering story:

```svelte
<svg class="pixel-text" width={w * scale} height={7 * scale} viewBox="0 0 {w} 7"
  shape-rendering="crispEdges" role="img" aria-label={text}>
  <title>{text}</title>
  {#each rects as r, i (i)}<rect x={r.x} y={r.y} width={r.w} height="1" fill={colour} />{/each}
</svg>
```

`textRows` needs one line changing to take a family — the hub's copy is hard-wired to `GLYPHS`
because the hub only ever wanted the base face on a web page:

```ts
const g = (family?.[ch] ?? GLYPHS[ch] ?? GLYPHS[' ']);
```

`viewBox="0 0 {w} 7"` with an integer `scale` is what makes it resolution-independent: the SVG
scales, the pixels stay square, and it is crisp on a phone and on a 4K monitor from the same markup.

---

## The traps. Each of these cost the hub something.

**1. The alphabet is CAPITALS ONLY, and `fold()` enforces it.** There are no lowercase glyphs and
adding twenty-six is a project, not an afternoon. `fold` upper-cases, strips accents, folds curly
quotes, and turns anything it does not have into a space. **So every heading set in this face is a
capitalised heading** — a real design constraint to accept on purpose rather than discover halfway
through. It suits `SSE3.1` and `STAR SYSTEM` and it will fight a long sentence.

**2. `SSE3.1` in the narrow face mixes two alphabets, and the full stop is the giveaway.** NARROW's
letters are three columns wide; the full stop is not defined in NARROW, so it falls through to the
base set at **five columns** — nearly twice the width of the letters beside it. Look at the sample
before choosing narrow for a wordmark containing punctuation. Either pick `round`, or add a 3-wide
`'.'` to NARROW (one line of data).

**3. A heading made of rectangles is invisible to a screen reader, to Ctrl-F, and to an anchor
link.** This is the one that matters most for headings specifically, and it is a bigger problem than
it was for the hub's wordmark. `role="img"` plus `aria-label` plus `<title>` is the minimum and is
what the hub does. **For an `<h2>` do better:** keep the real text in the DOM as the heading and put
the SVG beside it as decoration —

```svelte
<h2>
  <span class="visually-hidden">Star System</span>
  <PixelText text="Star System" aria-hidden="true" />
</h2>
```

— so the outline, the in-page search and the deep link all still work. A page whose headings cannot
be found by Ctrl-F is a page people quietly stop using.

**4. Two characters drawn identically is the failure mode, and it is invisible in review.** When the
hub added ROUND and NARROW, a test that refuses any two glyphs with identical rows caught **`O` and
`0` drawn the same in BOTH new alphabets**, `N` reading as `K` in NARROW, and `U` byte-identical to
`V` in ROUND. Nobody spotted any of them by eye. **If you add or edit a single glyph, copy that
test** before you touch the data. It is the whole of it, and it has already paid for itself three
times:

```ts
it('never draws two different characters identically', () => {
  const seen = new Map<string, string>();
  for (const [ch, rows] of Object.entries(family)) {
    if (ch === ' ') continue;
    const key = rows.join('/');
    expect(seen.has(key), name + ': ' + ch + ' is drawn exactly like ' + seen.get(key)).toBe(false);
    seen.set(key, ch);
  }
});
```

`tests/families.test.ts` in the hub has the rest — every glyph is seven rows, every row in a glyph
is the same width, only `#` and `.`, and no letter is blank.

**5. `shape-rendering="crispEdges"` is not optional.** Without it the browser antialiases the rect
edges and the whole point — hard square pixels — turns to mush at some zoom levels and not others.

**6. Integer scales only.** A fractional scale puts rect boundaries on half-pixels and some columns
come out a pixel wider than their neighbours. The hub uses 1.5 for one face and pays for it in the
raster, where it can control the rounding; in SVG, keep it whole.

**7. Do not use it below about scale 3 for anything anybody has to read.** Seven rows tall means a
`scale` of 3 is 21px of cap height, which is a heading. At 2 it is a label. At 1 it is decoration.

---

## What we would like back

Nothing blocking. When it ships, a line saying **which alphabet you used and at what scale**, so the
hub can match it if the two ever sit side by side — a map card on the hub and the same map's heading
in the app should not be set in two different faces by accident.

If you add glyphs — lowercase, more punctuation, a fourth alphabet — **say so and the hub will take
them back**. The glyph tables are pure data with no engine or hub in them, so they travel in either
direction, and one canonical set beating two divergent ones is worth a round trip.

---

## Provenance, so nobody has to guess later

The base alphabet was drawn for the cover cards (**D-21** — a Worker has no font renderer); putting
it on web pages as the wordmark and the labels is **D-29**, which is also where the owner's brief
lives: *"something appropriately retro - i kinda like the 8-bit feel... not embracing it"*. The
ROUND and NARROW alphabets are **D-46**, which records the identical-glyph test and what it caught. The reasoning for
drawing text as SVG rects rather than shipping a font is in the header of `src/lib/pixel.ts`.

**The hub's rule, worth keeping in 3.1:** *a touch of it, not a theme.* Body text stays a system
font; the pixels are the trim. The moment every paragraph is set in a 5×7 bitmap, the effect stops
reading as a deliberate choice and starts reading as a broken stylesheet.

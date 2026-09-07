// THE ONE MOBILE RULE A MACHINE CAN CHECK (D-65).
//
// ============================================================================================
// iOS Safari zooms the whole page in when it focuses a form field whose text is smaller than 16px,
// and it does not zoom back out afterwards. The reader is left in a scaled-up page they have to
// pinch their way out of, having done nothing but tap a search box.
//
// It is invisible in review, invisible on a desktop, and invisible in every browser except the one
// most of the hub's readers will be holding. The map page's tree search sat at 0.9rem - 14.4px -
// for weeks and nobody saw it, because seeing it requires an iPhone and a reason to tap that field.
//
// `src/app.css` carries a 16px floor for the whole site, but a floor can be dropped below: Svelte
// scopes a component's rules with a class, so `.q.svelte-abc123` outranks a bare `input` selector
// no matter how the global sheet is written. Hence `!important` there - and hence this, which
// catches the case at the source instead of relying on the net.
//
// WHAT IT DOES: for every component, work out which classes land on an `<input>`, `<select>` or
// `<textarea>`, then read the `<style>` block for a `font-size` on those classes - or on the bare
// element - and refuse anything under 16px. Approximate by construction (it does not build a
// cascade), and approximate in the safe direction: it can miss an exotic selector, and it cannot
// invent a failure that is not written in the file.
// ============================================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const FIELDS = ['input', 'select', 'textarea'];

/** px, or null when the value is relative to something this cannot see (`inherit`, `em`, `%`). */
function toPx(value: string): number | null {
  const v = value.trim();
  let m = /^([\d.]+)px$/.exec(v);
  if (m) return parseFloat(m[1]);
  m = /^([\d.]+)rem$/.exec(v);
  if (m) return parseFloat(m[1]) * 16;
  return null;
}

/** Class names this file puts on a form field, including `class:foo={...}` directives. */
function fieldClasses(markup: string): Set<string> {
  const out = new Set<string>();
  for (const field of FIELDS) {
    const tag = new RegExp('<' + field + '\\b[^>]*>', 'gi');
    for (const [openTag] of markup.matchAll(tag)) {
      for (const [, list] of openTag.matchAll(/\bclass="([^"{]*)"/g)) {
        for (const c of list.split(/\s+/)) if (c) out.add(c);
      }
      for (const [, name] of openTag.matchAll(/\bclass:([\w-]+)/g)) out.add(name);
    }
  }
  return out;
}

/** Every `selector { ... font-size: X ... }` in a style block, flattened to [selector, value]. */
function fontSizeRules(css: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const m = /(?:^|;)\s*font-size:\s*([^;!}]+)/.exec(body);
    if (m) out.push([selector.replace(/\s+/g, ' ').trim(), m[1].trim()]);
  }
  return out;
}

const files = globSync('src/**/*.svelte');

describe('no form field is small enough to make iOS zoom the page', () => {
  it('found the components to check', () => {
    // If the glob ever returns nothing, everything below passes vacuously and says nothing.
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source);
    if (!style) continue;
    const onFields = fieldClasses(source);
    const rules = fontSizeRules(style[1]);
    const suspects = rules.filter(([selector]) =>
      FIELDS.some((f) => new RegExp('(^|[\\s,>+~])' + f + '([\\s,{:.\\[]|$)').test(selector))
      || [...onFields].some((c) => selector.includes('.' + c))
    );
    if (!suspects.length) continue;

    it(file.replace(/\\/g, '/'), () => {
      for (const [selector, value] of suspects) {
        const px = toPx(value);
        if (px === null) continue;
        expect(px, selector + ' sets ' + value + ' on a form field - iOS will zoom the page in and '
          + 'leave the reader there. 16px is the threshold, exactly.').toBeGreaterThanOrEqual(16);
      }
    });
  }
});

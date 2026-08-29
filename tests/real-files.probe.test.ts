// TEMPORARY PROBE, not part of the suite's contract.
//
// Runs the real parser over real Star System Explorer saves living outside this repo, to find out
// whether the mirrored assumptions in src/lib/bundle/ actually hold against files the engine wrote.
// Skips silently when the files are not present, so it never breaks a clean checkout.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { normalise } from '../src/lib/bundle/normalise';
import { checkProvenance } from '../src/lib/bundle/attribution';
import { detectGmContent } from '../src/lib/bundle/gmContent';
import { readProvenance } from '../src/lib/bundle/provenance';
import { computeFacets, deriveTags, formatBytes } from '../src/lib/bundle/facets';

const ROOT = 'C:/Development/star-system-explorer-v2';
const FILES = [
  ['fresh starmap (exported today)', `${ROOT}/Local_Neighbourhood-Starmap.json`],
  ['fresh scifi starmap', `${ROOT}/Local_Neighbourhood_(Science_Fiction)-Starmap.json`],
  ['bundled starmap', `${ROOT}/star-system-generator/static/example-starmaps/Local_Neighbourhood-Starmap.json`],
  ['bundled system: TRAPPIST-1', `${ROOT}/star-system-generator/static/examples/TRAPPIST-1-System.json`],
  ['bundled system: Sol 2030', `${ROOT}/star-system-generator/static/examples/Sol_2030-System.json`],
  ['bundled system: Uggi (Traveller)', `${ROOT}/star-system-generator/static/examples/Uggi_(Traveller_Example)-System.json`],
  ['exported system: Regina', `${ROOT}/Regina-System.json`]
] as const;

describe('the parser against REAL engine saves', () => {
  for (const [label, path] of FILES) {
    it(label, () => {
      if (!existsSync(path)) return; // not a failure: these live outside the repo
      const doc = JSON.parse(readFileSync(path, 'utf8'));

      const shaped = normalise(doc);
      const prov = readProvenance(doc);
      const attrib = checkProvenance(doc, doc.modelMeta ?? {});
      const gm = detectGmContent(doc);
      const facets = computeFacets(doc);
      const autoTags = deriveTags(facets, { hasGmContent: gm.hasGmContent });

      console.log(
        `\n${label}\n` +
        `  title        ${shaped.title}\n` +
        `  createdWith  ${prov.createdWith ?? '(none)'}  baseMap ${prov.baseMapVersion ?? '-'}\n` +
        `  bodies       ${shaped.bodies.length}   constructs ${shaped.constructs.length}\n` +
        `  systems      ${shaped.systemNames.length}\n` +
        `  assets       ${attrib.entries.length}  missing ${attrib.missing.length}  ccByBreach ${attrib.breaches.length}\n` +
        `  mayPublish   ${attrib.mayPublish}\n` +
        `  gmContent    ${gm.hasGmContent ? gm.summary.join('; ') : 'none'}
` +
        `  roles        ${Object.entries(facets.roleCounts).map(([r, n]) => n + ' ' + r).join(', ') || '-'}
` +
        `  carried      ${facets.carriedImages} images, ${facets.carriedModels} models  (app art: ${facets.appArtwork})
` +
        `  size         ${formatBytes(readFileSync(path).length)}
` +
        `  PILLS        ${autoTags.join('  ')}`
      );

      // The only hard assertions: it must not throw, and it must find SOMETHING.
      expect(shaped.title.length).toBeGreaterThan(0);
      expect(shaped.bodies.length + shaped.constructs.length).toBeGreaterThan(0);
    });
  }
});

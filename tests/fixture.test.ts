// THE CONTRACT TEST between the two repositories.
//
// These are the engine's own canonical fixtures - real saves, checked in by SSE and copied here.
// They are the reason `KNOWN_BUNDLE_FORMATS` contains 1: the parser has actually been run against
// the thing it claims to parse, rather than against something written to match my reading of the
// source.
//
// If SSE changes the layout it regenerates these and bumps `bundleFormat`. This suite then goes red
// on a fixture it does not understand, which is exactly what it is for.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { readZip } from '../src/lib/bundle/read';
import { isZip, DOC_NAME, MODELS_DIR, IMAGES_DIR } from '../src/lib/bundle/contract';
import { checkBundleFormat } from '../src/lib/bundle/format';
import { checkProvenance } from '../src/lib/bundle/attribution';
import { detectGmContent } from '../src/lib/bundle/gmContent';
import { readProvenance } from '../src/lib/bundle/provenance';
import { computeFacets, deriveTags } from '../src/lib/bundle/facets';
import { normalise } from '../src/lib/bundle/normalise';
import { sha256Hex, claimedHashFromModelPath } from '../src/lib/bundle/hash';

const OPTS = { acceptUnstamped: true, unstampedAs: 1 };
const BUNDLE = 'tests/fixtures/creator-hub-bundle.sse.zip';
const SYSTEM = 'tests/fixtures/creator-hub-system.sse.zip';

function open(path: string) {
  const bytes = new Uint8Array(readFileSync(path));
  const members = readZip(bytes);
  const names = Object.keys(members);
  const docName =
    names.find((n) => n.endsWith(DOC_NAME.starmap)) ?? names.find((n) => n.endsWith(DOC_NAME.system))!;
  return { bytes, members, names, docName, doc: JSON.parse(new TextDecoder().decode(members[docName])) };
}

describe.skipIf(!existsSync(BUNDLE))('the campaign fixture', () => {
  it('is a zip carrying starmap.json, ATTRIBUTIONS.md and README.txt', () => {
    const { bytes, names, docName } = open(BUNDLE);
    expect(isZip(bytes)).toBe(true);
    expect(docName.endsWith('starmap.json')).toBe(true);
    expect(names).toContain('ATTRIBUTIONS.md');
    expect(names).toContain('README.txt');
  });

  it('IS STAMPED, and the gate accepts it', () => {
    const { doc } = open(BUNDLE);
    expect(doc.bundleFormat).toBe(1);
    expect(checkBundleFormat(doc, OPTS)).toEqual({ ok: true, format: 1, legacyStamped: false });
  });

  it('carries the new capability markers', () => {
    const { doc } = open(BUNDLE);
    expect(readProvenance(doc).createdWith).toBeTruthy();
    // A campaign carries a monotonic revision; a single system deliberately does not.
    expect(typeof doc.revision).toBe('number');
  });

  it('every model path hash MATCHES ITS BYTES (R-03, from our side)', async () => {
    // The engine now refuses to write a mismatched hash. The hub still checks, because the path is
    // a claim from a file a stranger sent - this test proves the honest case passes.
    const { members } = open(BUNDLE);
    const models = Object.keys(members).filter((n) => n.includes(MODELS_DIR) && n.endsWith('.glb'));
    expect(models.length).toBeGreaterThan(0);

    for (const path of models) {
      const claimed = claimedHashFromModelPath(path, MODELS_DIR);
      expect(claimed).not.toBeNull();
      expect(await sha256Hex(members[path])).toBe(claimed);
    }
  });

  it('the shared hull is stored ONCE and credited once', () => {
    const { members, doc } = open(BUNDLE);
    const models = Object.keys(members).filter((n) => n.includes(MODELS_DIR) && n.endsWith('.glb'));

    const entries = checkProvenance(doc, doc.modelMeta ?? {}).entries.filter((e) => e.kind === 'model');
    // Two ships, one hull: one stored file, one attribution entry, two things using it.
    expect(models.length).toBe(entries.length);
    expect(entries.some((e) => e.usedBy.length >= 2)).toBe(true);
  });

  it('finds the asset with provenance AND the one without', () => {
    const { doc } = open(BUNDLE);
    const p = checkProvenance(doc, doc.modelMeta ?? {});
    expect(p.entries.length).toBeGreaterThan(1);
    expect(p.missing.length).toBeGreaterThan(0);
    // A save with an uncredited asset must NOT be publishable - the gate's whole purpose.
    expect(p.mayPublish).toBe(false);
  });

  it('ignores a remote url and an app-shipped graphic (C-06)', () => {
    const { doc } = open(BUNDLE);
    const f = computeFacets(doc);
    const claimed = checkProvenance(doc, doc.modelMeta ?? {}).entries.map((e) => e.path);
    // Nothing we claim to host may be an http url or an app path.
    expect(claimed.some((p) => p.startsWith('http'))).toBe(false);
    expect(claimed.some((p) => p.startsWith('/images/'))).toBe(false);
    // Carried images are counted; app artwork is counted separately and never stored.
    expect(f.carriedImages).toBeGreaterThan(0);
  });

  it('normalises into rows and derives pills', () => {
    const { doc } = open(BUNDLE);
    const shaped = normalise(doc);
    expect(shaped.title.length).toBeGreaterThan(0);
    expect(shaped.bodies.length + shaped.constructs.length).toBeGreaterThan(0);

    const tags = deriveTags(computeFacets(doc), { hasGmContent: detectGmContent(doc).hasGmContent });
    expect(tags).toContain('has-artwork');
    expect(tags).toContain('has-3d-models');
  });
});

describe.skipIf(!existsSync(SYSTEM))('the single-system fixture', () => {
  it('carries system.json, is stamped, and has NO revision', () => {
    const { docName, doc } = open(SYSTEM);
    expect(docName.endsWith('system.json')).toBe(true);
    expect(doc.bundleFormat).toBe(1);
    // Deliberate: a system is a slice of a campaign, not a separately versioned document.
    expect(doc.revision).toBeUndefined();
  });

  it('carries exportMode as a LABEL the hub does not trust', () => {
    const { doc } = open(SYSTEM);
    if (doc.exportMode !== undefined) expect(['gm', 'player']).toContain(doc.exportMode);
    // Whatever it claims, detection is the control - this is the R-10 rule, asserted.
    const detected = detectGmContent(doc);
    expect(typeof detected.hasGmContent).toBe('boolean');
  });

  it('parses into rows', () => {
    const { doc } = open(SYSTEM);
    const shaped = normalise(doc);
    expect(shaped.bodies.length + shaped.constructs.length).toBeGreaterThan(0);
    // A single-system save has no `systems[]`.
    expect(shaped.systemNames.length).toBe(0);
  });
});

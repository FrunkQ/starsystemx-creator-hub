# Fixtures

**This directory is empty on purpose, and that is why uploads are closed.**

## What is needed here

A **canonical save bundle**, checked in by the Star System Explorer repo, that the hub's parser
tests against. It is the contract test between the two codebases and it costs one file
(`creator-hub-design.md` §4).

It should:

- carry a `bundleFormat` integer in its document — the stamp that does not exist yet
- exercise the whole layout: `starmap.json` (and ideally a `system.json` sibling fixture),
  `assets/models/<sha256>.glb`, `assets/images/<nodeId>.<ext>`,
  `assets/images/player/<assetId>.<ext>`, `ATTRIBUTIONS.md`, `README.txt`
- include at least one asset **with** full provenance and one **without**, so the public-sharing
  gate is exercised in both directions
- include one model shared by two nodes, so the "credited once" path is covered

## Why nothing is parsed until it arrives

The hub refuses a format it has never been tested against rather than parsing it into a public
database. `KNOWN_BUNDLE_FORMATS` in `src/lib/bundle/contract.ts` is empty and every upload is
refused with `no-parser-yet`.

The parser, normaliser, provenance gate and ingest pipeline are all written and type-checked. They
are unreachable, not absent.

## Opening it up

1. Drop the fixture here.
2. Add its `bundleFormat` integer to `KNOWN_BUNDLE_FORMATS`.
3. Write `tests/fixture.test.ts` asserting the real thing: that the bundle reads, that the node
   counts match, that provenance resolves as expected, and that model path hashes match the bytes.
4. `npm test && npm run check && npm run build`.

If step 3 goes red, **that is the fixture doing its job** — the mirror in `src/lib/bundle/` was
written from reading the engine's source, which is evidence but not proof.

Note also `docs/decisions.md` **Q-01**: every bundle that exists today is *unstamped*, so the
`accept_unstamped_bundles` gate decides whether the hub opens to saves people already have.

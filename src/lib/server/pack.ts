// Reassemble a downloadable bundle FROM APPROVED ASSETS ONLY.
//
// ============================================================================================
// THE EASY THING TO GET WRONG (design 6.2). The withholding covers the DOWNLOAD too, not just
// the page. Serving the original uploaded zip would hand out the very bytes being withheld - so
// the stored zip is never served, and this rebuilds one.
// ============================================================================================
//
// AND IT IS CHEAPER THAN IT LOOKS, because the engine already tolerates a referenced-but-absent
// asset ON PURPOSE. `unpackBundle` (engine io/bundle.ts) does this:
//
//   node images:   "referenced but absent: honest blank, not a broken img"   -> delete node.image
//   player assets: "referenced but absent: leave the path, so the loss is visible not silent"
//
// So withholding an asset requires NO surgery on the document. Omit the file and the engine
// degrades gracefully on open, exactly as its authors intended for a hand-edited save. The doc
// goes out untouched, which also means the download stays byte-identical to the upload for the
// overwhelmingly common case where everything is approved.
import { zipSync, strToU8 } from 'fflate';
import type { Db } from './database.types';
import type { HubEnv } from './db';
import * as r2 from './r2';
import * as ledger from './ledger';
import { readZip } from '$lib/bundle/read';
import { isZip, README_NAME, ATTRIBUTIONS_NAME, DOC_NAME, detectKind } from '$lib/bundle/contract';
import { creditedDoc, type ClaimsByPath } from '$lib/bundle/credits';
import { fanWorkFileNotice } from '$lib/fanWork';

export interface PackResult {
  bytes: Uint8Array;
  withheld: string[];
  filename: string;
}

/**
 * Build the download for a published map.
 *
 * Every asset path in the stored zip is checked against the ledger. Approved bytes go in;
 * anything novel or banned is left out and named in the README, so a downloader can see that
 * something is missing rather than wondering why a planet has no picture.
 */
export async function packForDownload(
  env: HubEnv, sb: Db, systemId: string, slug: string, fanSetting?: string | null
): Promise<PackResult | null> {
  const stored = await r2.getBundle(env, systemId);
  if (!stored) return null;

  const raw = new Uint8Array(await stored.arrayBuffer());

  // An assetless .json save has nothing to withhold and nothing to repack.
  //
  // AND NOTHING TO WRITE A NOTICE INTO, which is worth saying out loud: the fan-work notice below
  // rides in README.txt, and a bare .json download has no README and must not grow one - it is a
  // document the engine parses, and adding a key to somebody's save to carry a legal notice would
  // be editing their file. For those, the notice lives on the page the download came from and in
  // the response header the route sets.
  if (!isZip(raw)) return { bytes: raw, withheld: [], filename: slug + '.json' };

  const { data: rows, error } = await sb.from('system_assets')
    .select('sha256, bundle_path').eq('system_id', systemId);
  if (error) throw new Error('could not read the asset manifest: ' + error.message);

  const hashByPath = new Map((rows ?? []).map((r) => [r.bundle_path as string, r.sha256 as string]));
  const approved = await ledger.approvedOnly(sb, [...hashByPath.values()]);

  const members = readZip(raw);
  const out: Record<string, Uint8Array> = {};
  const withheld: string[] = [];

  for (const [path, bytes] of Object.entries(members)) {
    const hash = hashByPath.get(path);
    // Not a tracked asset: the document, ATTRIBUTIONS.md, README.txt. These always travel.
    if (!hash) { out[path] = bytes; continue; }
    if (approved.has(hash)) { out[path] = bytes; continue; }
    withheld.push(path);
  }

  // ------------------------------------------------------------------------------------------
  // THE CREDITS THE CREATOR TYPED ON THE HUB GO INTO THE FILE (D-62).
  //
  // The owner: *"that is then written back to the file for publication as this is the first time
  // the user is challenged."* Before this, a credit fixed on the manage page satisfied the publish
  // gate and printed on the map's page - and the download still carried a picture with nobody's
  // name on it. The hub was saying something on a web page that the file it served did not agree
  // with, which is the wrong way round for a hub whose argument is "credit the artists".
  //
  // ON THE WAY OUT, not into the stored bytes: those are what was uploaded and attested to, the
  // claims are already the truth the gate reads, and patching here cannot drift - edit a credit
  // and the very next download has it. `bundle/credits.ts` has the full reasoning.
  //
  // NEVER FATAL. A save whose doc will not parse, or a claim that matches nothing, leaves the
  // download exactly as it was. A download that failed because a credit could not be applied would
  // be a worse outcome than a download missing a line of provenance.
  await creditDownload(sb, systemId, out).catch(() => undefined);

  if (withheld.length) out[README_NAME] = strToU8(withheldNote(out[README_NAME], withheld));

  // THE FAN-WORK NOTICE TRAVELS WITH THE FILE (D-61). A notice that only exists on a web page
  // protects nothing once the zip has been passed around a Discord server, and this is a hub whose
  // whole purpose is files leaving it. Always written, whether or not a setting was named - the map
  // that needs it most is the one nobody filled the field in on.
  //
  // APPENDED, never replacing: README.txt is the engine's, and this is a paragraph after it.
  out[README_NAME] = strToU8(appendNotice(out[README_NAME], fanWorkFileNotice(fanSetting)));

  return { bytes: zipSync(out), withheld, filename: slug + '.sse.zip' };
}

/**
 * Say plainly what is missing and why. A silent gap reads as a broken download; a named one reads
 * as a hub that is being careful, which is the difference between feeling fair and feeling
 * arbitrary (design 6.7).
 */
function appendNotice(existing: Uint8Array | undefined, notice: string): string {
  const head = existing ? new TextDecoder().decode(existing).replace(/\s+$/, '') + '\n\n' : '';
  return head + notice + '\n';
}

function withheldNote(existing: Uint8Array | undefined, withheld: string[]): string {
  const head = existing ? new TextDecoder().decode(existing) + '\n\n' : '';
  return head +
    '---\n\n' +
    withheld.length + ' picture' + (withheld.length === 1 ? '' : 's') +
    ' in this save have not been included.\n\n' +
    'Every image uploaded to the hub is looked at by a person before it is shared onward. These\n' +
    'ones are still waiting, so they have been left out of this download. The map itself is\n' +
    'complete and will open normally - the bodies concerned simply have no picture.\n\n' +
    withheld.map((w) => '  ' + w).join('\n') + '\n';
}


/**
 * Put the creator's typed credits into the copy of the save that is about to leave (D-62).
 *
 * MUTATES `out` - the member map the zip is built from. Silent when there is nothing to do, which
 * is the overwhelmingly common case: most maps have every credit already recorded in the app.
 */
async function creditDownload(sb: Db, systemId: string, out: Record<string, Uint8Array>): Promise<void> {
  // Only claims with something in them. A row with all four fields empty is a picture nobody has
  // credited yet - it is BLOCKING the publish, not waiting to be copied into a file.
  const { data: rows } = await sb.from('asset_claims')
    .select('sha256, title, credit, license, source_url')
    .eq('system_id', systemId)
    .or('title.not.is.null,credit.not.is.null,license.not.is.null,source_url.not.is.null');
  if (!rows?.length) return;

  // sha256 -> where that asset sits in THIS bundle. The claim is keyed by bytes; the doc refers to
  // paths; `system_assets` is the only thing that knows both.
  const { data: assets } = await sb.from('system_assets')
    .select('sha256, bundle_path').eq('system_id', systemId);
  const pathBySha = new Map((assets ?? []).map((a) => [a.sha256 as string, a.bundle_path as string]));

  const claims: ClaimsByPath = new Map();
  for (const r of rows as unknown as Array<Record<string, any>>) {
    const path = pathBySha.get(r.sha256);
    if (!path) continue;
    claims.set(path, { title: r.title, credit: r.credit, license: r.license, sourceUrl: r.source_url });
  }
  if (!claims.size) return;

  const docPath = Object.keys(out).find((n) => n.endsWith(DOC_NAME.starmap))
    ?? Object.keys(out).find((n) => n.endsWith(DOC_NAME.system));
  if (!docPath) return;

  let doc: unknown;
  try {
    doc = JSON.parse(new TextDecoder().decode(out[docPath]));
  } catch {
    // A save whose own document will not parse is not one to start editing.
    return;
  }

  const patched = creditedDoc(doc, detectKind(doc, docPath), claims);
  if (!patched) return;

  // Two spaces, which is what the engine exports and what anybody opening the file expects to see.
  // The README tells them to edit it in a text editor, so it has to stay readable.
  out[docPath] = strToU8(JSON.stringify(patched.doc, null, 2));

  // WHERE THE SAVE ALREADY KEEPS IT, or the root when it has none. Writing to the root regardless
  // would leave a save with two attributions files disagreeing with each other, which is worse than
  // either of them being wrong on its own.
  const attrPath = Object.keys(out).find((n) => n.endsWith(ATTRIBUTIONS_NAME)) ?? ATTRIBUTIONS_NAME;
  out[attrPath] = strToU8(patched.attributions);
}

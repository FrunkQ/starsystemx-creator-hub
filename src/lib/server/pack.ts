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
import { isZip, README_NAME } from '$lib/bundle/contract';

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
  env: HubEnv, sb: Db, systemId: string, slug: string
): Promise<PackResult | null> {
  const stored = await r2.getBundle(env, systemId);
  if (!stored) return null;

  const raw = new Uint8Array(await stored.arrayBuffer());

  // An assetless .json save has nothing to withhold and nothing to repack.
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

  if (withheld.length) out[README_NAME] = strToU8(withheldNote(out[README_NAME], withheld));

  return { bytes: zipSync(out), withheld, filename: slug + '.sse.zip' };
}

/**
 * Say plainly what is missing and why. A silent gap reads as a broken download; a named one reads
 * as a hub that is being careful, which is the difference between feeling fair and feeling
 * arbitrary (design 6.7).
 */
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

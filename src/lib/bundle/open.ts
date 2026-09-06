// Open a save - a zip bundle or a plain .json - and hand back its document.
//
// ONE PLACE, used by ingest (a fresh upload) and by re-indexing (the bundle the hub already
// holds), so the two can never read a file differently. Everything here is container handling;
// the format gate, GM detection and the rest happen on the document afterwards.
import { readZip, BundleReadError } from './read';
import { DOC_NAME, detectKind, isZip } from './contract';

export type Opened =
  | { ok: true; zipped: boolean; members: Record<string, Uint8Array>; docPath: string; doc: any }
  | { ok: false; code: string; message: string };

export function openBundle(bytes: Uint8Array): Opened {
  const zipped = isZip(bytes);
  let members: Record<string, Uint8Array> = {};
  let docPath: string;
  let docText: string;

  if (zipped) {
    try {
      members = readZip(bytes);
    } catch (e) {
      const message = e instanceof BundleReadError ? e.message : 'That archive could not be read.';
      return { ok: false, code: 'unreadable', message };
    }
    const names = Object.keys(members);
    const found =
      names.find((n) => n.endsWith(DOC_NAME.starmap)) ?? names.find((n) => n.endsWith(DOC_NAME.system));
    if (!found) {
      return {
        ok: false, code: 'not-a-save',
        message: 'That zip is not a Star System Explorer save (no starmap.json or system.json inside).'
      };
    }
    docPath = found;
    docText = new TextDecoder().decode(members[found]);
  } else {
    // A bare .json carries no filename to read, so the name is decided AFTER the parse, from what
    // the document turns out to be. It used to be assumed to be `starmap.json` - which is where
    // every plain upload got its kind, and why every one of them was called a campaign (D-48).
    docPath = '';
    docText = new TextDecoder().decode(bytes);
  }

  let doc: any;
  try {
    doc = JSON.parse(docText);
  } catch {
    return { ok: false, code: 'bad-json', message: 'The save data inside that file is not valid JSON.' };
  }
  // The name matters beyond the kind: a stripped save is rebuilt as a zip under this path, and a
  // single system written into `starmap.json` is a bundle that lies about itself.
  if (!docPath) docPath = DOC_NAME[detectKind(doc)];
  return { ok: true, zipped, members, docPath, doc };
}

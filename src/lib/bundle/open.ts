// Open a save - a zip bundle or a plain .json - and hand back its document.
//
// ONE PLACE, used by ingest (a fresh upload) and by re-indexing (the bundle the hub already
// holds), so the two can never read a file differently. Everything here is container handling;
// the format gate, GM detection and the rest happen on the document afterwards.
import { readZip, BundleReadError } from './read';
import { DOC_NAME, isZip } from './contract';

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
    docPath = DOC_NAME.starmap;
    docText = new TextDecoder().decode(bytes);
  }

  let doc: any;
  try {
    doc = JSON.parse(docText);
  } catch {
    return { ok: false, code: 'bad-json', message: 'The save data inside that file is not valid JSON.' };
  }
  return { ok: true, zipped, members, docPath, doc };
}

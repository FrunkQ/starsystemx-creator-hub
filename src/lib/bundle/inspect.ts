// INSPECT a file that may be broken - a debug upload - without ever letting it break us (D-35).
//
// The owner (2026-09-05): "see if it can do a basic parse - pull out version numbers and complete
// objects - detect any json errors or truncated file, resources and other files it says it
// requires... useful stuff like that for debugging."
//
// Everything here is tolerant: a truncated zip, half a JSON document, a node with no id. Nothing
// throws; every finding is a line in the report. This is READ-ONLY evidence gathering and shares
// nothing with the upload pipeline - a file that crashed the engine's parser must not be able to
// crash this one, so the walk is bounded and every step is guarded.
import { readZip } from './read';
import { isZip, DOC_NAME, IMAGES_DIR, MODELS_DIR, ATTRIBUTIONS_NAME } from './contract';

export interface ZipReport {
  ok: boolean;
  message: string | null;
  /** No end-of-central-directory record: the file stops before the zip's own index. */
  truncated: boolean;
  entries: Array<{ name: string; size: number }>;
  docPath: string | null;
  hasAttributions: boolean;
}

export type ParseReport =
  | { ok: true }
  | { ok: false; message: string; position: number | null; truncated: boolean; near: string };

export interface DocReport {
  parse: ParseReport;
  textLength: number;
  keys: string[];
  kind: 'starmap' | 'system' | 'unknown';
  name: string | null;
  bundleFormat: unknown;
  appVersion: unknown;
  revision: unknown;
  exportMode: unknown;
  systems: number;
  nodes: number;
  /** Nodes with an id, a kind and a name - the ones the engine can place. */
  complete: number;
  incomplete: string[];
  orphans: string[];
  duplicateIds: string[];
  gmNotes: number;
  hiddenNodes: number;
}

/**
 * A CRASH LOG, read as evidence (owner, 2026-09-06: "does debug parse crash files too?").
 *
 * It did not, and it should: when the app falls over, what a person has to hand is the console, not
 * the save. The file that arrives is then plain text, which the inspector used to refuse with
 * "neither a zip nor JSON" - technically true and useless.
 *
 * WHAT IS PULLED OUT is only what a maintainer reads first: which build it was, what the browser
 * was, the FIRST error with the frames under it (the first is the cause; the rest are usually its
 * echoes), and how many errors there are in total. Everything else stays in the file, which is
 * still there to be read.
 */
export interface LogReport {
  lines: number;
  /** An app version the log mentions - `3.0.317`, or whatever it said. */
  appVersion: string | null;
  /** The browser's own line, when the log carries one. */
  userAgent: string | null;
  /** How many lines look like an error or a warning. */
  errors: number;
  warnings: number;
  /** The first error line, and the stack frames directly under it. */
  firstError: string | null;
  stack: string[];
  /** Every distinct error line, deduplicated, most recent last. */
  distinct: string[];
}

export interface InspectReport {
  bytes: number;
  container: 'zip' | 'json' | 'text' | 'unknown';
  zip: ZipReport | null;
  doc: DocReport | null;
  /** Present when the upload is a log rather than a save. */
  log: LogReport | null;
  /** Files under assets/ the document refers to, and whether the zip has them. */
  requires: string[];
  missing: string[];
  unreferenced: string[];
  warnings: string[];
}

const MAX_TEXT = 80 * 1024 * 1024;
/** A log is read by a person, and a person reads the top of it. A megabyte is already generous. */
const MAX_LOG = 1024 * 1024;
const MAX_NODES = 250_000;
const LIST = 12;

/** Does the tail of the file carry a zip end-of-central-directory signature? */
function hasZipEnd(bytes: Uint8Array): boolean {
  const from = Math.max(0, bytes.length - 66_000);
  for (let i = bytes.length - 22; i >= from; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) return true;
  }
  return false;
}

/** Bracket depth at the end of the text, strings honoured: above zero means it stops mid-structure. */
export function openDepthAtEnd(text: string): number {
  let depth = 0, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') depth--;
  }
  return inString ? depth + 1 : depth;
}

export function parseReport(text: string): ParseReport {
  try {
    JSON.parse(text);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const m = /at position (\d+)/.exec(message);
    const position = m ? Number(m[1]) : null;
    const nearEnd = position !== null && position >= text.length - 2;
    const truncated = /end of JSON input|Unterminated string/i.test(message) || nearEnd || openDepthAtEnd(text) > 0;
    const at = position ?? text.length;
    const near = text.slice(Math.max(0, at - 60), Math.min(text.length, at + 60)).replace(/\s+/g, ' ');
    return { ok: false, message, position, truncated, near };
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function* nodesOf(doc: any): Generator<any> {
  let seen = 0;
  const lists: any[] = [];
  if (Array.isArray(doc?.nodes)) lists.push(doc.nodes);
  if (Array.isArray(doc?.systems)) {
    for (const entry of doc.systems) if (Array.isArray(entry?.system?.nodes)) lists.push(entry.system.nodes);
  }
  for (const list of lists) for (const n of list) { if (seen++ >= MAX_NODES) return; yield n; }
}

export function docReport(text: string): DocReport {
  const parse = parseReport(text);
  const base: DocReport = {
    parse, textLength: text.length, keys: [], kind: 'unknown', name: null,
    bundleFormat: null, appVersion: null, revision: null, exportMode: null,
    systems: 0, nodes: 0, complete: 0, incomplete: [], orphans: [], duplicateIds: [], gmNotes: 0, hiddenNodes: 0
  };
  if (!parse.ok) return base;

  let doc: any;
  try { doc = JSON.parse(text); } catch { return base; }
  if (!doc || typeof doc !== 'object') return base;

  base.keys = Object.keys(doc).slice(0, 40);
  base.kind = Array.isArray(doc.systems) ? 'starmap' : Array.isArray(doc.nodes) ? 'system' : 'unknown';
  base.name = str(doc.name);
  base.bundleFormat = doc.bundleFormat ?? null;
  base.appVersion = doc.appVersion ?? null;
  base.revision = doc.revision ?? null;
  base.exportMode = doc.exportMode ?? null;
  base.systems = Array.isArray(doc.systems) ? doc.systems.length : 0;

  const ids = new Set<string>();
  const dupes = new Set<string>();
  const parents: Array<[string, string]> = [];
  for (const n of nodesOf(doc)) {
    base.nodes++;
    const id = str(n?.id);
    const label = id ?? str(n?.name) ?? '#' + base.nodes;
    if (id && str(n?.kind) && str(n?.name)) base.complete++;
    else if (base.incomplete.length < LIST) base.incomplete.push(label);
    if (id) { if (ids.has(id)) dupes.add(id); ids.add(id); }
    const p = str(n?.parentId);
    if (id && p) parents.push([id, p]);
    if (typeof n?.gmNotes === 'string' && n.gmNotes.trim()) base.gmNotes++;
    if (n?.object_playerhidden) base.hiddenNodes++;
  }
  base.duplicateIds = [...dupes].slice(0, LIST);
  base.orphans = parents.filter(([, p]) => !ids.has(p)).map(([id, p]) => id + ' -> ' + p).slice(0, LIST);
  return base;
}

/** Every string anywhere in the document that names a file under assets/. Bounded walk. */
export function requiredAssets(text: string): string[] {
  const out = new Set<string>();
  const re = /"(assets\/[^"\\]{1,300})"/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text)) && n++ < 50_000) {
    const p = m[1];
    if (p.startsWith(IMAGES_DIR) || p.startsWith(MODELS_DIR)) out.add(p);
  }
  return [...out].sort();
}

/**
 * Is this readable text rather than some other binary?
 *
 * A cheap, honest test on the first kilobyte: no NUL bytes, and almost everything printable. It is
 * not charset detection and does not try to be - the question is only "would a person see words if
 * they opened this", and a wrong answer costs a report saying "no errors found" rather than a crash.
 */
export function looksLikeText(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 1024);
  if (!head.length) return false;
  let printable = 0;
  for (const b of head) {
    if (b === 0) return false;
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b !== 127)) printable++;
  }
  return printable / head.length > 0.9;
}

/** Does the whole thing parse as JSON? Bounded, and false rather than throwing on anything. */
function parsesAsJson(bytes: Uint8Array): boolean {
  if (bytes.length > MAX_TEXT) return false;
  try {
    JSON.parse(new TextDecoder().decode(bytes));
    return true;
  } catch {
    return false;
  }
}

/** Lines that read as a failure. Deliberately broad: a missed error is worse than a false one. */
const ERROR_LINE = /(^|[^a-z])(error|exception|uncaught|unhandled|fatal|failed|cannot read|is not a function|is not defined)([^a-z]|$)/i;
const WARN_LINE = /(^|[^a-z])(warn|warning|deprecated)([^a-z]|$)/i;
/** A stack frame, in the shapes the three browsers write them. */
const STACK_LINE = /^\s*(at\s|[\w$.<>]+@|\s{4,}\S)/;

/**
 * Read a log. Bounded, never throws: a file that crashed the app must not crash this.
 */
export function logReport(text: string): LogReport {
  const lines = text.split(/\r?\n/);
  const out: LogReport = {
    lines: lines.length, appVersion: null, userAgent: null,
    errors: 0, warnings: 0, firstError: null, stack: [], distinct: []
  };

  // The build, however the log happened to say it. `3.0.317` is the shape; the words around it vary.
  const version = text.match(/\b(?:v|version\s*|Star System Explorer\s*)?(\d+\.\d+\.\d+(?:-[a-z0-9.]+)?)\b/i);
  if (version) out.appVersion = version[1];

  const ua = lines.find((l) => /Mozilla\/5\.0|user[- ]?agent/i.test(l));
  if (ua) out.userAgent = ua.trim().slice(0, 300);

  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    if (ERROR_LINE.test(line)) {
      out.errors++;
      const trimmed = line.trim().slice(0, 300);
      if (!seen.has(trimmed)) { seen.add(trimmed); out.distinct.push(trimmed); }
      if (!out.firstError) {
        out.firstError = trimmed;
        // The frames directly under it. The FIRST error is the cause; what follows is usually its
        // echo, so the stack that matters is this one.
        for (let j = i + 1; j < lines.length && out.stack.length < 12; j++) {
          if (!STACK_LINE.test(lines[j])) break;
          out.stack.push(lines[j].trim().slice(0, 300));
        }
      }
    } else if (WARN_LINE.test(line)) {
      out.warnings++;
    }
  }
  out.distinct = out.distinct.slice(0, 20);
  return out;
}

export function inspectBytes(bytes: Uint8Array): InspectReport {
  const report: InspectReport = {
    bytes: bytes.length, container: 'unknown', zip: null, doc: null, log: null,
    requires: [], missing: [], unreferenced: [], warnings: []
  };
  if (!bytes.length) { report.warnings.push('The file is empty.'); return report; }

  let text: string | null = null;
  let entries: Record<string, Uint8Array> = {};

  if (isZip(bytes)) {
    report.container = 'zip';
    const zip: ZipReport = { ok: false, message: null, truncated: !hasZipEnd(bytes), entries: [], docPath: null, hasAttributions: false };
    try {
      entries = readZip(bytes);
      zip.ok = true;
    } catch (e) {
      zip.message = e instanceof Error ? e.message : String(e);
    }
    zip.entries = Object.entries(entries).map(([name, b]) => ({ name, size: b.length })).sort((a, b) => a.name.localeCompare(b.name));
    zip.hasAttributions = zip.entries.some((e) => e.name.endsWith(ATTRIBUTIONS_NAME));
    const names = zip.entries.map((e) => e.name);
    zip.docPath = names.find((n) => n.endsWith(DOC_NAME.starmap)) ?? names.find((n) => n.endsWith(DOC_NAME.system)) ?? null;
    report.zip = zip;
    if (zip.truncated) report.warnings.push('The zip has no end-of-central-directory record: it stops before its own index. Almost certainly truncated in transfer.');
    if (zip.ok && !zip.docPath) report.warnings.push('No starmap.json or system.json inside: not a Star System Explorer save.');
    if (zip.docPath) text = new TextDecoder().decode(entries[zip.docPath]);
  } else {
    const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
    // A `{` IS A SAVE, INCLUDING A BROKEN ONE - the whole point of this page is to report on JSON
    // that does not parse. A `[` IS ALMOST NEVER: no save the hub reads is an array at the top
    // level, and `[holo] scene ready` is what a console log's first line looks like. So a leading
    // bracket has to earn "JSON" by actually parsing; otherwise it is read as a log. Caught by a
    // test rather than by reasoning - the first log written for one started with `[holo]`.
    const bracketedJson = head.startsWith('[') && parsesAsJson(bytes);
    if (head.startsWith('{') || bracketedJson) {
      report.container = 'json';
      text = new TextDecoder().decode(bytes);
    } else if (looksLikeText(bytes)) {
      // A crash log, a console dump, an error report: text somebody pasted out of the browser.
      report.container = 'text';
      report.log = logReport(new TextDecoder().decode(bytes.subarray(0, MAX_LOG)));
      if (bytes.length > MAX_LOG) report.warnings.push('Only the first megabyte of the log was read.');
      if (!report.log.errors) report.warnings.push('No error lines found: this reads as a log, but nothing in it looks like a failure.');
      return report;
    } else {
      report.warnings.push('Neither a zip, JSON nor text: the first bytes are ' + JSON.stringify(head.slice(0, 24)) + '.');
      return report;
    }
  }

  if (text !== null) {
    if (text.length > MAX_TEXT) {
      report.warnings.push('The document is over 80 MB; only its container was inspected.');
    } else {
      report.doc = docReport(text);
      if (!report.doc.parse.ok) {
        report.warnings.push(report.doc.parse.truncated
          ? 'The JSON stops mid-structure: the file was cut short.'
          : 'The JSON does not parse: ' + report.doc.parse.message);
      }
      report.requires = requiredAssets(text);
      const have = new Set(Object.keys(entries));
      report.missing = report.requires.filter((p) => !have.has(p));
      report.unreferenced = [...have].filter((n) => (n.startsWith(IMAGES_DIR) || n.startsWith(MODELS_DIR)) && !report.requires.includes(n)).sort();
      if (report.container === 'zip' && report.missing.length) {
        report.warnings.push(report.missing.length + ' asset ' + (report.missing.length === 1 ? 'file the document needs is' : 'files the document needs are') + ' not in the zip.');
      }
      if (report.doc.parse.ok && report.doc.kind === 'unknown') report.warnings.push('Parses, but has neither `nodes` nor `systems`: not a save the hub recognises.');
      if (report.doc.incomplete.length) report.warnings.push(report.doc.incomplete.length + '+ nodes are missing an id, a kind or a name.');
      if (report.doc.orphans.length) report.warnings.push(report.doc.orphans.length + '+ nodes point at a parent that is not in the file.');
      if (report.doc.duplicateIds.length) report.warnings.push('Duplicate node ids: ' + report.doc.duplicateIds.join(', '));
    }
  }
  return report;
}

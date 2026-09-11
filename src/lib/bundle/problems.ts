// WHAT IS WRONG WITH A MAP, IN WORDS ITS CREATOR CAN ACT ON (D-88).
//
// ============================================================================================
// The owner, 2026-09-11, after a map went public with every body missing: *"Worth having a
// 'problematic' map status that triggers when it spots something like this - with advice on the
// issue to help them resolve it themselves."*
//
// Each problem carries three things, and the third is the point: WHAT the hub found, naming the
// systems and objects involved; and WHAT TO DO about it, in Star System Explorer, in steps. A flag
// that says "invalid file" is a flag the creator can only forward to somebody else.
//
// ONLY WHAT CAN BE STOOD BEHIND. The structural checks mirror, field for field, what the engine's
// own `validateStarmap` (src/lib/utils.ts) refuses to open - so "Star System Explorer will not open
// this" is a fact about the app, not a guess. The rest are faults visible in the file itself: an id
// used twice, a parent that is not there, a loop. None of them second-guesses the physics or the
// creator's choices; a strange map is not a broken one.
//
// PURE, AND READ FROM THE DOCUMENT, so upload and re-index reach the same answer from the same
// bytes, and a map clears itself the moment a new version no longer has the problem.
// ============================================================================================

/**
 * `refuses`: Star System Explorer will not open the map at all.
 * `faulty`:  it opens, but part of it is wrong or missing.
 */
export type ProblemSeverity = 'refuses' | 'faulty';

export interface MapProblem {
  /** Stable, for the dedupe key and for tests. Never shown. */
  code: string;
  severity: ProblemSeverity;
  /** One line. */
  title: string;
  /** What was found, naming names. */
  detail: string;
  /** What to do about it. */
  fix: string;
}

/** The pill a map with problems wears, on its card, its page and in `/browse?tag=`. */
export const PROBLEM_TAG = 'needs-a-fix';

/** A few names and a count of the rest: a list of forty names is a list nobody reads. */
function names(list: string[], max = 4): string {
  const shown = list.slice(0, max);
  const rest = list.length - shown.length;
  const joined = shown.length > 1 ? shown.slice(0, -1).join(', ') + ' and ' + shown[shown.length - 1] : shown[0] ?? '';
  return rest > 0 ? joined + ' and ' + rest + ' more' : joined;
}

/**
 * A name out of a stranger's file, fit to print: one line, trimmed, short. These end up in an email
 * to the staff as well as on a page, and a name with a line break in it would write its own lines.
 */
const label = (v: unknown, fallback: string): string =>
  (typeof v === 'string' && v.trim() ? v : fallback).replace(/\s+/g, ' ').trim().slice(0, 60);

/** Everything the hub can see is wrong with this document. Empty for a healthy map. */
export function findProblems(doc: unknown): MapProblem[] {
  if (!doc || typeof doc !== 'object') return [];
  const d = doc as Record<string, any>;
  const out: MapProblem[] = [];

  // A single-system save is one list of nodes; a starmap is systems, each with its own.
  const isStarmap = Array.isArray(d.systems) || !Array.isArray(d.nodes);
  if (isStarmap) out.push(...starmapProblems(d));

  const groups: { name: string; nodes: unknown[] }[] = Array.isArray(d.nodes)
    ? [{ name: label(d.name, 'this system'), nodes: d.nodes }]
    : (Array.isArray(d.systems) ? d.systems : [])
        .filter((s: any) => Array.isArray(s?.system?.nodes))
        .map((s: any) => ({ name: label(s?.name ?? s?.system?.name, 'a system'), nodes: s.system.nodes }));
  out.push(...nodeProblems(groups));
  return out;
}

// ---- what the engine refuses to open ------------------------------------------------------------

function starmapProblems(d: Record<string, any>): MapProblem[] {
  const out: MapProblem[] = [];

  // THE TOP OF THE FILE, exactly as `validateStarmap` checks it - and it stops there when these
  // fail, so this does too: the per-system checks below mean nothing without a list of systems.
  const missing: string[] = [];
  if (!d.id) missing.push('"id"');
  if (!d.name) missing.push('"name"');
  if (typeof d.distanceUnit !== 'string') missing.push('"distanceUnit"');
  if (!Array.isArray(d.systems)) missing.push('"systems"');
  if (!Array.isArray(d.routes)) missing.push('"routes"');
  if (missing.length) {
    out.push({
      code: 'map-structure',
      severity: 'refuses',
      title: 'Star System Explorer will not open this map',
      detail: 'The file is missing ' + names(missing, 5) + ', which every starmap needs.',
      fix: 'This usually means the file was edited by hand or written by another program. Export the '
        + 'map from Star System Explorer again and upload that. If you edited it yourself, compare the '
        + 'top of it with a fresh export: it needs "id", "name", "distanceUnit" (such as "ly"), '
        + '"systems" and "routes" - an empty list is fine for routes.'
    });
    return out;
  }

  const broken: string[] = [];
  const seen = new Map<string, string>();
  const shared = new Map<string, string[]>();
  d.systems.forEach((entry: any, i: number) => {
    const name = label(entry?.name ?? entry?.system?.name, 'system ' + (i + 1));
    const faults: string[] = [];
    if (!entry?.id) faults.push('no id');
    if (typeof entry?.position?.x !== 'number' || typeof entry?.position?.y !== 'number') faults.push('no position');
    if (!entry?.system) faults.push('no system data');
    else {
      if (!entry.system.id) faults.push('no inner id');
      if (!Array.isArray(entry.system.nodes)) faults.push('no list of objects');
    }
    if (faults.length) broken.push(name + ' (' + faults.join(', ') + ')');

    if (entry?.id) {
      const id = String(entry.id);
      const first = seen.get(id);
      if (first === undefined) seen.set(id, name);
      else shared.set(id, [...(shared.get(id) ?? [first]), name]);
    }
  });

  if (broken.length) {
    out.push({
      code: 'system-structure',
      severity: 'refuses',
      title: 'Star System Explorer will not open this map',
      detail: (broken.length === 1 ? 'One system is' : broken.length + ' systems are')
        + ' missing what the app needs to place it: ' + names(broken) + '.',
      fix: 'Export the map from Star System Explorer again and upload that. If the file was edited by '
        + 'hand, each entry in "systems" needs an "id", a "position" with numbers for x and y, and a '
        + '"system" with its own "id" and a "nodes" list.'
    });
  }

  if (shared.size) {
    // A107 in the engine: refused outright before 3.1.66, repaired as the map opens from 3.1.66 on.
    const pairs = [...shared].map(([id, who]) => names(who) + (who.length === 2 ? ' are both "' : ' are all "') + id + '"');
    out.push({
      code: 'duplicate-system-ids',
      severity: 'refuses',
      title: 'Two systems share one id',
      detail: pairs.join('; ') + '. Star System Explorer before version 3.1.66 will not open a map '
        + 'like this at all, and any route to one of them can only lead to the first.',
      fix: 'Open the map in Star System Explorer 3.1.66 or later: it renames the second system as the '
        + 'map opens and tells you what it renamed. Check the routes to those systems still go where '
        + 'you meant, save, and upload the new file. It usually happens when the same example system '
        + 'is added to a map twice.'
    });
  }
  return out;
}

// ---- faults inside a system ---------------------------------------------------------------------

function nodeProblems(groups: { name: string; nodes: unknown[] }[]): MapProblem[] {
  const repeats: string[] = [];
  const detached: string[] = [];
  const loops: string[] = [];

  for (const g of groups) {
    const byId = new Map<string, any>();
    const repeated = new Map<string, string[]>();
    for (const raw of g.nodes) {
      const n = raw as any;
      if (!n || typeof n !== 'object' || n.id == null) continue;
      const id = String(n.id);
      const name = label(n.name, id);
      if (byId.has(id)) repeated.set(id, [...(repeated.get(id) ?? [label(byId.get(id).name, id)]), name]);
      else byId.set(id, n);
    }
    for (const [id, who] of repeated) repeats.push('in ' + g.name + ', "' + id + '" is ' + names(who));

    for (const n of byId.values()) {
      const parent = n.parentId;
      if (parent == null || parent === '') continue;
      if (!byId.has(String(parent))) detached.push(label(n.name, String(n.id)) + ' in ' + g.name);
    }

    // A LOOP: walk each chain upward; meeting a node already on this walk means it is its own
    // ancestor. Every node in the loop is reported once, by the first one found.
    const inLoop = new Set<string>();
    for (const start of byId.keys()) {
      if (inLoop.has(start)) continue;
      const path: string[] = [];
      const onPath = new Set<string>();
      let cur: string | null = start;
      while (cur !== null && byId.has(cur) && !onPath.has(cur)) {
        path.push(cur);
        onPath.add(cur);
        const p: unknown = byId.get(cur).parentId;
        cur = p == null || p === '' ? null : String(p);
      }
      if (cur !== null && onPath.has(cur)) {
        const loop = path.slice(path.indexOf(cur));
        if (loop.some((id) => inLoop.has(id))) continue;
        loop.forEach((id) => inLoop.add(id));
        loops.push(names(loop.map((id) => label(byId.get(id).name, id))) + ' in ' + g.name);
      }
    }
  }

  const out: MapProblem[] = [];
  if (repeats.length) {
    out.push({
      code: 'duplicate-object-ids',
      severity: 'faulty',
      title: 'Two objects in one system share an id',
      detail: repeats.slice(0, 4).join('; ') + (repeats.length > 4 ? '; and ' + (repeats.length - 4) + ' more' : '')
        + '. Anything that refers to that id - an orbit, a docking port - can only mean one of them.',
      fix: 'Open the system in Star System Explorer and check both are there and where they should be. '
        + 'The simplest fix is to delete one and add it again, which gives it an id of its own; then '
        + 'save and upload the new file.'
    });
  }
  if (detached.length) {
    out.push({
      code: 'detached-objects',
      severity: 'faulty',
      title: 'Objects attached to something that is not there',
      detail: names(detached) + ' ' + (detached.length === 1 ? 'names a parent' : 'name parents')
        + ' missing from the file - usually a planet or star that was deleted.',
      fix: 'Open the system in Star System Explorer. If they appear, move each one onto a star or '
        + 'planet; if they do not, add them again where they belong. Then save and upload the new file.'
    });
  }
  if (loops.length) {
    out.push({
      code: 'parent-loops',
      severity: 'faulty',
      title: 'Objects that orbit each other in a circle',
      detail: names(loops) + ': each is, through the others, its own parent, so nothing can place them.',
      fix: 'Open the system in Star System Explorer and delete these objects, then add them again under '
        + 'the star or planet they belong to. Save and upload the new file.'
    });
  }
  return out;
}

/** The same problems, in the same order, compared by what they ARE rather than how they are worded. */
export const problemKey = (problems: readonly Pick<MapProblem, 'code' | 'detail'>[] | null | undefined): string =>
  (problems ?? []).map((p) => p.code + ':' + p.detail).join('|');

/** Stored problems, read back defensively: the column is JSON written by an older build, perhaps. */
export function problemsFrom(value: unknown): MapProblem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((p): p is MapProblem =>
    !!p && typeof p === 'object'
    && typeof (p as MapProblem).code === 'string'
    && typeof (p as MapProblem).title === 'string'
    && typeof (p as MapProblem).detail === 'string'
    && typeof (p as MapProblem).fix === 'string'
    && ((p as MapProblem).severity === 'refuses' || (p as MapProblem).severity === 'faulty'));
}

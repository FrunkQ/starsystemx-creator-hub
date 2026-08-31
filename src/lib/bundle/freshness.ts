// WOULD THIS SAVE BE BETTER IF IT WERE RE-SAVED IN A CURRENT STAR SYSTEM EXPLORER?
//
// An old file still works - the hub accepts it, publishes it, and it downloads fine. But an older
// export carries less: no format stamp, no build stamp, and (once the engine's save-hygiene work
// lands) app defaults written in as though the creator had authored them. Re-opening it in a current
// SSE and saving again costs the creator about ten seconds and gives their page more to show.
//
// ============================================================================================
// TONE: THIS IS A SUGGESTION, NOT A FAULT. It appears AFTER a successful upload, it never blocks
// anything, and it says what is GAINED rather than what is wrong. A creator whose map published
// perfectly well should not be made to feel they did it badly.
//
// And it must say what is actually gained, concretely. "Re-save for better results" is the kind of
// vague nudge everybody ignores; "your page would show which build made it, and how many custom
// calendars you added" is one somebody acts on.
// ============================================================================================

export interface Freshness {
  /** True when re-saving would demonstrably add something. */
  worthResaving: boolean;
  /** What the file is missing, in the creator's terms. */
  reasons: string[];
  /** The build that wrote it, when known. */
  createdWith: string | null;
}

export interface FreshnessInput {
  createdWith: string | null;
  /** The hub had to stamp the format itself, because the file carried none. */
  legacyStamped: boolean;
  /** config: recommend a re-save below this engine version. Empty disables the version check. */
  recommendBelow: string;
}

export function checkFreshness(input: FreshnessInput): Freshness {
  const reasons: string[] = [];

  if (input.legacyStamped) {
    reasons.push('it does not record which save format it uses, so the hub had to assume');
  }

  if (!input.createdWith) {
    reasons.push('it does not record which version of Star System Explorer made it');
  } else if (input.recommendBelow && compareVersions(input.createdWith, input.recommendBelow) < 0) {
    reasons.push(`it was made with version ${input.createdWith}, and newer saves carry more detail`);
  }

  return { worthResaving: reasons.length > 0, reasons, createdWith: input.createdWith };
}

/**
 * Compare two engine version strings. Negative when `a` is older.
 *
 * Deliberately forgiving: SSE versions look like `3.0.190` and `2.1.692-beta`, so it compares the
 * numeric segments and ignores any suffix. A string it cannot read compares EQUAL rather than old -
 * a version this cannot parse must never produce a nag, because the nag would be unfixable.
 */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) =>
    v.split('-')[0].split('.').map((n) => Number.parseInt(n, 10)).filter((n) => Number.isFinite(n));

  const pa = parts(a);
  const pb = parts(b);
  if (!pa.length || !pb.length) return 0;

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// Writes that survive a column the database does not have YET.
//
// ============================================================================================
// WHY THIS EXISTS. A push to `main` deploys within minutes; a migration runs when the owner pastes
// it into the Supabase SQL editor, which can be hours or days later. In between, the code knows
// about columns the table lacks, and PostgREST answers an insert that names one with PGRST204:
// "Could not find the 'revision' column of 'systems' in the schema cache". Failing EVERY upload for
// that window - over a column that records a nicety - is the wrong trade.
//
// So a write that names an unknown column drops that column and tries again. The row lands minus
// the one fact the schema cannot hold yet; the log says so; the person uploading never knows.
//
// It only ever REMOVES a key the database itself named, one per retry, capped. It cannot mask any
// other failure, and it cannot drop a key the error did not name.
// ============================================================================================

export interface WriteError { code?: string; message: string }

const UNKNOWN_COLUMN = /'([A-Za-z0-9_]+)' column/;

export async function tolerantWrite<T extends Record<string, unknown>>(
  row: T,
  write: (row: Partial<T>) => Promise<{ error: WriteError | null }>,
  maxDrops = 4
): Promise<{ error: WriteError | null; dropped: string[] }> {
  let current: Partial<T> = { ...row };
  const dropped: string[] = [];

  for (let i = 0; i <= maxDrops; i++) {
    const { error } = await write(current);
    if (!error) return { error: null, dropped };

    const m = error.code === 'PGRST204' ? UNKNOWN_COLUMN.exec(error.message) : null;
    const column = m?.[1];
    if (!column || !(column in current)) return { error, dropped };

    console.warn('schema is behind the code: no column ' + column + ' yet; written without it');
    delete current[column as keyof T];
    dropped.push(column);
  }

  return { error: { message: 'gave up after dropping ' + dropped.join(', ') }, dropped };
}

/**
 * A READ that names a column the database does not have yet. Postgres answers with 42703,
 * "column systems.comments_count does not exist"; the column is dropped from the list and the
 * query run again. Only a column the caller listed as OPTIONAL may be dropped - a missing column
 * the page depends on is still an error - and only one the error itself named.
 *
 * `run` builds the whole query from the column string, because a supabase-js builder cannot be
 * re-run once awaited. The data comes back untyped and the caller says what it is.
 */
const MISSING_COLUMN = /column [A-Za-z0-9_]+\.([A-Za-z0-9_]+) does not exist/;

export async function tolerantSelect<T>(
  columns: readonly string[],
  optional: readonly string[],
  run: (columns: string) => PromiseLike<{ data: unknown; error: WriteError | null }>
): Promise<{ data: T | null; error: WriteError | null; dropped: string[] }> {
  let current = [...columns];
  const dropped: string[] = [];

  for (let i = 0; i <= optional.length; i++) {
    const { data, error } = await run(current.join(', '));
    if (!error) return { data: data as T | null, error: null, dropped };

    const column = MISSING_COLUMN.exec(error.message)?.[1];
    if (!column || !optional.includes(column) || !current.includes(column)) return { data: null, error, dropped };

    console.warn('schema is behind the code: no column ' + column + ' yet; read without it');
    current = current.filter((c) => c !== column);
    dropped.push(column);
  }

  return { data: null, error: { message: 'gave up after dropping ' + dropped.join(', ') }, dropped };
}

/** The same, for a bulk insert: the named column is dropped from EVERY row before the retry. */
export async function tolerantWriteMany<T extends Record<string, unknown>>(
  rows: T[],
  write: (rows: Partial<T>[]) => Promise<{ error: WriteError | null }>,
  maxDrops = 4
): Promise<{ error: WriteError | null; dropped: string[] }> {
  if (!rows.length) return { error: null, dropped: [] };
  let current: Partial<T>[] = rows.map((r) => ({ ...r }));
  const dropped: string[] = [];

  for (let i = 0; i <= maxDrops; i++) {
    const { error } = await write(current);
    if (!error) return { error: null, dropped };

    const m = error.code === 'PGRST204' ? UNKNOWN_COLUMN.exec(error.message) : null;
    const column = m?.[1];
    if (!column || !(column in current[0])) return { error, dropped };

    console.warn('schema is behind the code: no column ' + column + ' yet; rows written without it');
    current = current.map((r) => { const c = { ...r }; delete c[column as keyof T]; return c; });
    dropped.push(column);
  }

  return { error: { message: 'gave up after dropping ' + dropped.join(', ') }, dropped };
}

import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);

export interface StatementLike {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): StatementLike;
  close(): void;
  runInTransaction<T>(fn: () => T): T;
}

/**
 * On Vercel serverless functions, use `:memory:` SQLite so cold-start
 * ingestion completes in ~3ms with zero read-only filesystem errors.
 * Locally (VS Code / server), persist to `data/dealeros.sqlite`.
 */
export const DEFAULT_DB_PATH = process.env.VERCEL
  ? ':memory:'
  : path.resolve(process.cwd(), 'data', 'dealeros.sqlite');

/**
 * Opens a SQLite database using `better-sqlite3` with an automatic zero-native
 * fallback to Node 22+'s built-in `node:sqlite` (`DatabaseSync`) so both local
 * VS Code and Vercel serverless runtimes work without native binary errors.
 */
export function openDatabase(dbPath: string = DEFAULT_DB_PATH): SqliteDatabase {
  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  let db: SqliteDatabase;

  try {
    const BetterSqlite3 = require('better-sqlite3') as new (file: string) => {
      pragma(str: string): void;
      exec(sql: string): void;
      prepare(sql: string): StatementLike;
      transaction<T>(fn: () => T): () => T;
      close(): void;
    };
    const native = new BetterSqlite3(dbPath);
    native.pragma('foreign_keys = ON');
    if (dbPath !== ':memory:') {
      native.pragma('journal_mode = WAL');
      native.pragma('synchronous = NORMAL');
    }
    db = {
      exec: (sql) => native.exec(sql),
      prepare: (sql) => native.prepare(sql),
      close: () => native.close(),
      runInTransaction: <T>(fn: () => T) => native.transaction(fn)(),
    };
  } catch {
    // Fallback to Node 22+ built-in `node:sqlite` (zero native C++ addon needed)
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (file: string) => {
        exec(sql: string): void;
        prepare(sql: string): StatementLike;
        close(): void;
      };
    };
    const builtIn = new DatabaseSync(dbPath);
    builtIn.exec('PRAGMA foreign_keys = ON;');
    db = {
      exec: (sql) => builtIn.exec(sql),
      prepare: (sql) => builtIn.prepare(sql),
      close: () => builtIn.close(),
      runInTransaction: <T>(fn: () => T) => {
        builtIn.exec('BEGIN IMMEDIATE');
        try {
          const result = fn();
          builtIn.exec('COMMIT');
          return result;
        } catch (err) {
          builtIn.exec('ROLLBACK');
          throw err;
        }
      },
    };
  }

  initSchema(db);
  return db;
}

/**
 * Table design:
 * - `locations`: authoritative location -> org tenant map.
 * - `system_a_records`: 1 row per System A event; exact integer-cent money fields.
 * - `system_b_entries`: 1 row per System B entry; stores raw and cleaned refs/values;
 *   intentionally omits FK to `system_a_records` so orphans persist, and leaves
 *   `record_ref` non-unique so splits and duplicates persist.
 */
export function initSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS locations (
      location_id   TEXT PRIMARY KEY,
      org_id        TEXT NOT NULL,
      location_name TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_locations_org_id
      ON locations(org_id);

    CREATE TABLE IF NOT EXISTS system_a_records (
      record_id         TEXT PRIMARY KEY,
      location_id       TEXT NOT NULL REFERENCES locations(location_id),
      event_date        TEXT NOT NULL,
      category_code     TEXT NOT NULL,
      actor_id          TEXT NULL,
      base_value_cents  INTEGER NOT NULL,
      adjustment_cents  INTEGER NOT NULL,
      total_value_cents INTEGER NOT NULL,
      state             TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_system_a_location_id
      ON system_a_records(location_id);

    CREATE TABLE IF NOT EXISTS system_b_entries (
      entry_id       TEXT PRIMARY KEY,
      record_ref_raw TEXT NOT NULL,
      record_ref     TEXT NULL,
      location_id    TEXT NOT NULL REFERENCES locations(location_id),
      recorded_on    TEXT NOT NULL,
      value_raw      TEXT NOT NULL,
      value_cents    INTEGER NULL,
      label          TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_system_b_record_ref
      ON system_b_entries(record_ref);

    CREATE INDEX IF NOT EXISTS idx_system_b_location_id
      ON system_b_entries(location_id);

    CREATE TABLE IF NOT EXISTS import_audit (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      summary_json TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
  `);
}

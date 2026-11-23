import fs from 'fs';
import path from 'path';
import { normalizeRef, parseAmountToCents, parseCsv } from './cleaning';
import type { SqliteDatabase } from './db';
import type { ImportSummary } from './types';

export interface CsvPaths {
  locations: string;
  systemA: string;
  systemB: string;
}

export const DEFAULT_CSV_PATHS: CsvPaths = {
  locations: path.resolve(process.cwd(), 'public/assets/aistudio/locations_1f766b2d.csv'),
  systemA: path.resolve(process.cwd(), 'public/assets/aistudio/system_a_859d289d.csv'),
  systemB: path.resolve(process.cwd(), 'public/assets/aistudio/system_b_083e8440.csv'),
};

/**
 * Idempotent, zero-loss CSV importer using positional `?` parameters so it runs
 * identically on both `better-sqlite3` and Node's built-in `node:sqlite`.
 */
export function importAllCsvs(
  db: SqliteDatabase,
  paths: CsvPaths = DEFAULT_CSV_PATHS,
): ImportSummary {
  const locationRows = parseCsv(fs.readFileSync(paths.locations, 'utf8'));
  const systemARows = parseCsv(fs.readFileSync(paths.systemA, 'utf8'));
  const systemBRows = parseCsv(fs.readFileSync(paths.systemB, 'utf8'));

  const warnings: string[] = [];

  const upsertLocation = db.prepare(`
    INSERT INTO locations (location_id, org_id, location_name)
    VALUES (?, ?, ?)
    ON CONFLICT(location_id) DO UPDATE SET
      org_id = excluded.org_id,
      location_name = excluded.location_name
  `);

  const upsertSystemA = db.prepare(`
    INSERT INTO system_a_records (
      record_id, location_id, event_date, category_code, actor_id,
      base_value_cents, adjustment_cents, total_value_cents, state
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(record_id) DO UPDATE SET
      location_id = excluded.location_id,
      event_date = excluded.event_date,
      category_code = excluded.category_code,
      actor_id = excluded.actor_id,
      base_value_cents = excluded.base_value_cents,
      adjustment_cents = excluded.adjustment_cents,
      total_value_cents = excluded.total_value_cents,
      state = excluded.state
  `);

  const upsertSystemB = db.prepare(`
    INSERT INTO system_b_entries (
      entry_id, record_ref_raw, record_ref, location_id,
      recorded_on, value_raw, value_cents, label
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(entry_id) DO UPDATE SET
      record_ref_raw = excluded.record_ref_raw,
      record_ref = excluded.record_ref,
      location_id = excluded.location_id,
      recorded_on = excluded.recorded_on,
      value_raw = excluded.value_raw,
      value_cents = excluded.value_cents,
      label = excluded.label
  `);

  const upsertAudit = db.prepare(`
    INSERT INTO import_audit (id, summary_json, updated_at)
    VALUES (1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      summary_json = excluded.summary_json,
      updated_at = excluded.updated_at
  `);

  let locationsSaved = 0;
  let aSaved = 0;
  let blankActors = 0;
  let voidedRecords = 0;

  let bSaved = 0;
  let refsNormalized = 0;
  let valuesLeftNull = 0;
  let formattedValuesCleaned = 0;

  return db.runInTransaction(() => {
    for (const row of locationRows) {
      upsertLocation.run(row.location_id, row.org_id, row.location_name);
      locationsSaved++;
    }

    for (const row of systemARows) {
      const actorId = row.actor_id ? row.actor_id : null;
      if (actorId === null) {
        blankActors++;
        warnings.push(`System A ${row.record_id}: blank actor_id stored as NULL`);
      }
      if (row.state === 'VOIDED') {
        voidedRecords++;
      }

      const baseCents = parseAmountToCents(row.base_value);
      const adjCents = parseAmountToCents(row.adjustment);
      const totalCents = parseAmountToCents(row.total_value);

      if (baseCents === null || adjCents === null || totalCents === null) {
        throw new Error(`Invalid numeric field in System A row ${row.record_id}`);
      }

      upsertSystemA.run(
        row.record_id,
        row.location_id,
        row.event_date,
        row.category_code,
        actorId,
        baseCents,
        adjCents,
        totalCents,
        row.state,
      );
      aSaved++;
    }

    for (const row of systemBRows) {
      const rawRef = row.record_ref;
      const cleanRef = normalizeRef(rawRef);
      if (cleanRef !== rawRef) {
        refsNormalized++;
        warnings.push(
          `System B ${row.entry_id}: reference "${rawRef}" normalized to "${cleanRef ?? 'NULL'}"`,
        );
      }

      const rawValue = row.value;
      const valueCents = parseAmountToCents(rawValue);
      if (valueCents === null) {
        valuesLeftNull++;
        warnings.push(
          `System B ${row.entry_id}: blank or unparseable value "${rawValue}" stored as NULL`,
        );
      } else if (rawValue.includes(',')) {
        formattedValuesCleaned++;
        warnings.push(`System B ${row.entry_id}: grouped value "${rawValue}" parsed as exact cents`);
      }

      upsertSystemB.run(
        row.entry_id,
        rawRef,
        cleanRef,
        row.location_id,
        row.recorded_on,
        rawValue,
        valueCents,
        row.label,
      );
      bSaved++;
    }

    const summary: ImportSummary = {
      ranAt: new Date().toISOString(),
      locations: {
        read: locationRows.length,
        saved: locationsSaved,
      },
      systemA: {
        read: systemARows.length,
        saved: aSaved,
        blankActors,
        voidedRecords,
      },
      systemB: {
        read: systemBRows.length,
        saved: bSaved,
        refsNormalized,
        valuesLeftNull,
        formattedValuesCleaned,
      },
      warnings,
    };

    upsertAudit.run(JSON.stringify(summary), summary.ranAt);
    return summary;
  });
}

export function getSavedImportSummary(db: SqliteDatabase): ImportSummary | null {
  const row = db
    .prepare('SELECT summary_json FROM import_audit WHERE id = 1')
    .get() as { summary_json: string } | undefined;

  if (!row) return null;
  return JSON.parse(row.summary_json) as ImportSummary;
}

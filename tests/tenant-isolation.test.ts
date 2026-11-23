import express from 'express';
import http from 'http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApiRouter } from '../src/reconcile/app';
import { openDatabase } from '../src/reconcile/db';
import { importAllCsvs } from '../src/reconcile/importer';
import type { DisagreementsResponse } from '../src/reconcile/types';

describe('Idempotent CSV import and strict tenant isolation on real datasets', () => {
  const db = openDatabase(':memory:');
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    importAllCsvs(db);

    const app = express();
    app.use('/api', createApiRouter(db));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });

  it('persists every single CSV row with zero loss and stays idempotent across re-runs', () => {
    const secondRun = importAllCsvs(db);

    expect(secondRun.locations).toEqual({ read: 5, saved: 5 });
    expect(secondRun.systemA).toEqual({
      read: 120,
      saved: 120,
      blankActors: 1,
      voidedRecords: 1,
    });
    expect(secondRun.systemB).toEqual({
      read: 121,
      saved: 121,
      refsNormalized: 3,
      valuesLeftNull: 1,
      formattedValuesCleaned: 1,
    });

    const aCount = (db.prepare('SELECT COUNT(*) as c FROM system_a_records').get() as { c: number }).c;
    const bCount = (db.prepare('SELECT COUNT(*) as c FROM system_b_entries').get() as { c: number }).c;
    expect(aCount).toBe(120);
    expect(bCount).toBe(121);
  });

  it('rejects requests missing or naming an unknown org with HTTP 400', async () => {
    const missingRes = await fetch(`${baseUrl}/api/disagreements`);
    expect(missingRes.status).toBe(400);

    const unknownRes = await fetch(`${baseUrl}/api/disagreements?org=ORG-Z`);
    expect(unknownRes.status).toBe(400);
  });

  it('returns exact ORG-A disagreements with ZERO ORG-B locations, records, or trap-row leakage', async () => {
    const res = await fetch(`${baseUrl}/api/disagreements?org=ORG-A`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as DisagreementsResponse;

    expect(data.org).toBe('ORG-A');
    expect(data.disagreements).toHaveLength(7);

    const orgBLocations = (
      db.prepare("SELECT location_id FROM locations WHERE org_id = 'ORG-B'").all() as Array<{
        location_id: string;
      }>
    ).map((r) => r.location_id);

    const orgBRecords = (
      db
        .prepare(
          `SELECT a.record_id FROM system_a_records a
           INNER JOIN locations l ON l.location_id = a.location_id
           WHERE l.org_id = 'ORG-B'`,
        )
        .all() as Array<{ record_id: string }>
    ).map((r) => r.record_id);

    const rawBody = JSON.stringify(data);
    expect(rawBody).not.toContain('ORG-B');
    for (const loc of orgBLocations) {
      expect(rawBody).not.toContain(loc);
    }
    for (const rid of orgBRecords) {
      expect(rawBody).not.toContain(rid);
    }

    const flaggedIds = data.disagreements.map((d) => d.record_id);
    expect(flaggedIds).not.toContain('REC-1055');
    expect(flaggedIds).not.toContain('REC-1034');
    expect(flaggedIds).not.toContain('REC-1112');

    const trapRow = data.disagreements.find((d) => d.record_id === 'REC-1077');
    expect(trapRow).toBeDefined();
    expect(trapRow?.reason).toBe('LOCATION_MISMATCH');
    expect(trapRow?.location).toBe('LOC-102');
    expect(trapRow?.cross_org_redacted).toBe(true);
  });

  it('returns exact ORG-B disagreements with ZERO ORG-A locations, records, or trap-row leakage', async () => {
    const res = await fetch(`${baseUrl}/api/disagreements?org=ORG-B`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as DisagreementsResponse;

    expect(data.org).toBe('ORG-B');
    expect(data.disagreements).toHaveLength(5);

    const orgALocations = (
      db.prepare("SELECT location_id FROM locations WHERE org_id = 'ORG-A'").all() as Array<{
        location_id: string;
      }>
    ).map((r) => r.location_id);

    const orgARecords = (
      db
        .prepare(
          `SELECT a.record_id FROM system_a_records a
           INNER JOIN locations l ON l.location_id = a.location_id
           WHERE l.org_id = 'ORG-A'`,
        )
        .all() as Array<{ record_id: string }>
    ).map((r) => r.record_id);

    const rawBody = JSON.stringify(data);
    expect(rawBody).not.toContain('ORG-A');
    for (const loc of orgALocations) {
      expect(rawBody).not.toContain(loc);
    }
    for (const rid of orgARecords) {
      expect(rawBody).not.toContain(rid);
    }

    expect(data.disagreements.map((d) => d.record_id)).not.toContain('REC-1070');

    const blankRow = data.disagreements.find((d) => d.record_id === 'REC-1050');
    expect(blankRow).toBeDefined();
    expect(blankRow?.reason).toBe('VALUE_MISMATCH');
    expect(blankRow?.b_value).toBeNull();
    expect(blankRow?.difference).toBeNull();
  });

  it('supports reason filtering and value sorting via query parameters', async () => {
    const res = await fetch(
      `${baseUrl}/api/disagreements?org=ORG-A&reason=VALUE_MISMATCH&sort=-value`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as DisagreementsResponse;

    expect(data.disagreements).toHaveLength(3);
    expect(data.disagreements.every((d) => d.reason === 'VALUE_MISMATCH')).toBe(true);
    expect(data.disagreements.map((d) => d.record_id)).toEqual([
      'REC-1064',
      'REC-1088',
      'REC-1027',
    ]);
  });
});

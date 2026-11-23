import { describe, expect, it } from 'vitest';
import { formatCents, normalizeRef, parseAmountToCents } from '../src/reconcile/cleaning';
import { compareRecords } from '../src/reconcile/compare';
import type { SystemARow, SystemBRow } from '../src/reconcile/types';

function makeA(overrides: Partial<SystemARow> = {}): SystemARow {
  return {
    record_id: 'REC-1001',
    location_id: 'LOC-101',
    org_id: 'ORG-A',
    location_name: 'Location 101',
    event_date: '2026-03-10',
    category_code: 'CAT-01',
    actor_id: 'USR-11',
    base_value_cents: 8000,
    adjustment_cents: 2000,
    total_value_cents: 10000,
    state: 'CONFIRMED',
    ...overrides,
  };
}

function makeB(overrides: Partial<SystemBRow> = {}): SystemBRow {
  return {
    entry_id: 'ENT/2026/4001',
    record_ref_raw: 'REC-1001',
    record_ref: 'REC-1001',
    location_id: 'LOC-101',
    org_id: 'ORG-A',
    location_name: 'Location 101',
    recorded_on: '2026-03-10',
    value_raw: '100.00',
    value_cents: 10000,
    label: 'Entry for CAT-01',
    ...overrides,
  };
}

describe('Cleaning and exact money helpers', () => {
  it('normalizes messy record references into canonical REC-XXXX format', () => {
    expect(normalizeRef('REC-1034')).toBe('REC-1034');
    expect(normalizeRef('rec1034')).toBe('REC-1034');
    expect(normalizeRef(' REC - 1070 ')).toBe('REC-1070');
    expect(normalizeRef('1112')).toBe('REC-1112');
    expect(normalizeRef('')).toBeNull();
    expect(normalizeRef('no-digits')).toBeNull();
  });

  it('parses Indian and standard comma-formatted amounts without float drift', () => {
    expect(parseAmountToCents('1,25,400.00')).toBe(12540000);
    expect(parseAmountToCents('0.10')! + parseAmountToCents('0.20')!).toBe(
      parseAmountToCents('0.30'),
    );
    expect(formatCents(12540000)).toBe('125400.00');
  });

  it('treats blank or malformed amounts strictly as null, never 0', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('   ')).toBeNull();
    expect(parseAmountToCents('N/A')).toBeNull();
    expect(parseAmountToCents('0.00')).toBe(0);
    expect(formatCents(null)).toBeNull();
  });
});

describe('Pure comparison engine rules', () => {
  it('returns no disagreements for a clean matching pair', () => {
    expect(compareRecords([makeA()], [makeB()])).toEqual([]);
  });

  it('matches messy references after normalization without flagging an error', () => {
    const aRows = [
      makeA({ record_id: 'REC-1034' }),
      makeA({ record_id: 'REC-1070' }),
      makeA({ record_id: 'REC-1112' }),
    ];
    const bRows = [
      makeB({ entry_id: 'E1', record_ref_raw: 'rec1034', record_ref: normalizeRef('rec1034') }),
      makeB({
        entry_id: 'E2',
        record_ref_raw: ' REC - 1070 ',
        record_ref: normalizeRef(' REC - 1070 '),
      }),
      makeB({ entry_id: 'E3', record_ref_raw: '1112', record_ref: normalizeRef('1112') }),
    ];
    expect(compareRecords(aRows, bRows)).toEqual([]);
  });

  it('flags MISSING_IN_B when a confirmed System A record has no System B entry', () => {
    const result = compareRecords([makeA({ record_id: 'REC-1015', total_value_cents: 4109533 })], []);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: 'MISSING_IN_B',
      record_id: 'REC-1015',
      a_value: '41095.33',
      b_value: null,
      difference: null,
    });
  });

  it('flags ORPHAN_IN_B when a System B entry points to an unknown record', () => {
    const result = compareRecords(
      [],
      [makeB({ entry_id: 'ENT/2026/4901', record_ref: 'REC-1999', value_cents: 4125000 })],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: 'ORPHAN_IN_B',
      record_id: 'REC-1999',
      entry_ids: ['ENT/2026/4901'],
      a_value: null,
      b_value: '41250.00',
      difference: null,
    });
  });

  it('flags DUPLICATE_IN_B when the same amount is entered twice', () => {
    const a = makeA({ record_id: 'REC-1042', total_value_cents: 11283706 });
    const b = [
      makeB({ entry_id: 'ENT/2026/4042', record_ref: 'REC-1042', value_cents: 11283706 }),
      makeB({ entry_id: 'ENT/2026/4902', record_ref: 'REC-1042', value_cents: 11283706 }),
    ];
    const result = compareRecords([a], b);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: 'DUPLICATE_IN_B',
      record_id: 'REC-1042',
      a_value: '112837.06',
      b_value: '225674.12',
      difference: '112837.06',
    });
  });

  it('does NOT flag split entries that sum exactly to System A total_value', () => {
    const a = makeA({ record_id: 'REC-1055', total_value_cents: 17987732 });
    const b = [
      makeB({ entry_id: 'ENT/2026/4055', record_ref: 'REC-1055', value_cents: 7195093 }),
      makeB({
        entry_id: 'ENT/2026/4903',
        record_ref: 'REC-1055',
        value_cents: 10792639,
        label: 'Entry part 2 of 2',
      }),
    ];
    expect(compareRecords([a], b)).toEqual([]);
  });

  it('flags VALUE_MISMATCH when System B differs from System A total_value', () => {
    const a = makeA({
      record_id: 'REC-1027',
      base_value_cents: 6192112,
      adjustment_cents: 1733791,
      total_value_cents: 7925903,
    });
    const b = makeB({ record_ref: 'REC-1027', value_cents: 6192112 });
    const result = compareRecords([a], [b]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: 'VALUE_MISMATCH',
      a_value: '79259.03',
      b_value: '61921.12',
      difference: '-17337.91',
    });
  });

  it('flags VALUE_MISMATCH for blank B value and keeps b_value and difference as null (never 0)', () => {
    const a = makeA({ record_id: 'REC-1050', total_value_cents: 16040585 });
    const b = makeB({ record_ref: 'REC-1050', value_raw: '', value_cents: null });
    const result = compareRecords([a], [b]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: 'VALUE_MISMATCH',
      a_value: '160405.85',
      b_value: null,
      difference: null,
    });
  });

  it('flags LOCATION_MISMATCH and strictly redacts B location when it belongs to another org', () => {
    const a = makeA({
      record_id: 'REC-1077',
      location_id: 'LOC-102',
      org_id: 'ORG-A',
      location_name: 'Location 102',
    });
    const b = makeB({
      entry_id: 'ENT/2026/4077',
      record_ref: 'REC-1077',
      location_id: 'LOC-201',
      org_id: 'ORG-B',
      location_name: 'Location 201',
    });
    const result = compareRecords([a], [b]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: 'LOCATION_MISMATCH',
      location: 'LOC-102',
      cross_org_redacted: true,
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('LOC-201');
    expect(serialized).not.toContain('ORG-B');
    expect(serialized).not.toContain('Location 201');
  });

  it('flags DATE_MISMATCH when System A event_date differs from System B recorded_on', () => {
    const a = makeA({ record_id: 'REC-1009', event_date: '2026-03-31' });
    const b = makeB({ record_ref: 'REC-1009', recorded_on: '2026-04-02' });
    const result = compareRecords([a], [b]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: 'DATE_MISMATCH',
      event_date: '2026-03-31',
      recorded_on: '2026-04-02',
    });
  });

  it('flags VOIDED_IN_A when System A is VOIDED but System B still has an active entry', () => {
    const a = makeA({ record_id: 'REC-1019', state: 'VOIDED', total_value_cents: 5709235 });
    const b = makeB({ entry_id: 'ENT/2026/4019', record_ref: 'REC-1019', value_cents: 5709235 });
    const result = compareRecords([a], [b]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      reason: 'VOIDED_IN_A',
      record_id: 'REC-1019',
      state: 'VOIDED',
      b_value: '57092.35',
    });
  });
});

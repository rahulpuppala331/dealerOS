import { formatCents } from './cleaning';
import type { DisagreementItem, SystemARow, SystemBRow } from './types';

/**
 * Pure ledger comparison engine (zero database or HTTP code).
 */
export function compareRecords(
  aRows: readonly SystemARow[],
  bRows: readonly SystemBRow[],
): DisagreementItem[] {
  const disagreements: DisagreementItem[] = [];

  const aById = new Map<string, SystemARow>();
  for (const a of aRows) {
    aById.set(a.record_id, a);
  }

  const bByRef = new Map<string, SystemBRow[]>();
  const unparseableB: SystemBRow[] = [];

  for (const b of bRows) {
    if (!b.record_ref) {
      unparseableB.push(b);
      continue;
    }
    const existing = bByRef.get(b.record_ref);
    if (existing) {
      existing.push(b);
    } else {
      bByRef.set(b.record_ref, [b]);
    }
  }

  // 1. Orphan entries in System B
  for (const b of unparseableB) {
    disagreements.push({
      id: `ORPHAN_IN_B:${b.entry_id}`,
      reason: 'ORPHAN_IN_B',
      record_id: b.record_ref_raw || b.entry_id,
      entry_ids: [b.entry_id],
      location: b.location_id,
      location_name: b.location_name,
      a_value: null,
      b_value: formatCents(b.value_cents),
      difference: null,
      a_value_cents: null,
      b_value_cents: b.value_cents,
      difference_cents: null,
      event_date: null,
      recorded_on: b.recorded_on,
      state: null,
      detail: `System B entry ${b.entry_id} has unparseable reference "${b.record_ref_raw}" with no matching System A record.`,
      cross_org_redacted: false,
    });
  }

  for (const [ref, entries] of bByRef.entries()) {
    if (!aById.has(ref)) {
      for (const b of entries) {
        disagreements.push({
          id: `ORPHAN_IN_B:${b.entry_id}`,
          reason: 'ORPHAN_IN_B',
          record_id: ref,
          entry_ids: [b.entry_id],
          location: b.location_id,
          location_name: b.location_name,
          a_value: null,
          b_value: formatCents(b.value_cents),
          difference: null,
          a_value_cents: null,
          b_value_cents: b.value_cents,
          difference_cents: null,
          event_date: null,
          recorded_on: b.recorded_on,
          state: null,
          detail: `System B entry ${b.entry_id} references ${ref}, which does not exist in System A.`,
          cross_org_redacted: false,
        });
      }
    }
  }

  // 2. Walk every System A record and reconcile against grouped System B entries
  for (const a of aRows) {
    const entries = bByRef.get(a.record_id) ?? [];

    if (entries.length === 0) {
      if (a.state === 'VOIDED') {
        continue;
      }
      disagreements.push({
        id: `MISSING_IN_B:${a.record_id}`,
        reason: 'MISSING_IN_B',
        record_id: a.record_id,
        entry_ids: [],
        location: a.location_id,
        location_name: a.location_name,
        a_value: formatCents(a.total_value_cents),
        b_value: null,
        difference: null,
        a_value_cents: a.total_value_cents,
        b_value_cents: null,
        difference_cents: null,
        event_date: a.event_date,
        recorded_on: null,
        state: a.state,
        detail: `Confirmed System A record (${a.category_code}) has no corresponding entry in System B.`,
        cross_org_redacted: false,
      });
      continue;
    }

    const entryIds = entries.map((e) => e.entry_id);
    const hasNullValue = entries.some((e) => e.value_cents === null);

    if (a.state === 'VOIDED') {
      const bTotalCents = hasNullValue
        ? null
        : entries.reduce((sum, e) => sum + (e.value_cents as number), 0);
      disagreements.push({
        id: `VOIDED_IN_A:${a.record_id}`,
        reason: 'VOIDED_IN_A',
        record_id: a.record_id,
        entry_ids: entryIds,
        location: a.location_id,
        location_name: a.location_name,
        a_value: formatCents(a.total_value_cents),
        b_value: formatCents(bTotalCents),
        difference: bTotalCents !== null ? formatCents(bTotalCents) : null,
        a_value_cents: a.total_value_cents,
        b_value_cents: bTotalCents,
        difference_cents: bTotalCents,
        event_date: a.event_date,
        recorded_on: entries[0].recorded_on,
        state: a.state,
        detail: `Record is VOIDED in System A, but System B still carries active entry ${entryIds.join(', ')}.`,
        cross_org_redacted: false,
      });
      continue;
    }

    if (hasNullValue) {
      disagreements.push({
        id: `VALUE_MISMATCH:${a.record_id}`,
        reason: 'VALUE_MISMATCH',
        record_id: a.record_id,
        entry_ids: entryIds,
        location: a.location_id,
        location_name: a.location_name,
        a_value: formatCents(a.total_value_cents),
        b_value: null,
        difference: null,
        a_value_cents: a.total_value_cents,
        b_value_cents: null,
        difference_cents: null,
        event_date: a.event_date,
        recorded_on: entries[0].recorded_on,
        state: a.state,
        detail: `System B entry ${entryIds.join(', ')} has a blank or unparseable value; blank is unknown, never 0.`,
        cross_org_redacted: false,
      });
      continue;
    }

    if (entries.length > 1) {
      const bSumCents = entries.reduce((sum, e) => sum + (e.value_cents as number), 0);
      if (bSumCents !== a.total_value_cents) {
        const diffCents = bSumCents - a.total_value_cents;
        disagreements.push({
          id: `DUPLICATE_IN_B:${a.record_id}`,
          reason: 'DUPLICATE_IN_B',
          record_id: a.record_id,
          entry_ids: entryIds,
          location: a.location_id,
          location_name: a.location_name,
          a_value: formatCents(a.total_value_cents),
          b_value: formatCents(bSumCents),
          difference: formatCents(diffCents),
          a_value_cents: a.total_value_cents,
          b_value_cents: bSumCents,
          difference_cents: diffCents,
          event_date: a.event_date,
          recorded_on: entries[0].recorded_on,
          state: a.state,
          detail: `${entries.length} System B entries (${entryIds.join(', ')}) sum to ${formatCents(bSumCents)}, exceeding System A total ${formatCents(a.total_value_cents)}.`,
          cross_org_redacted: false,
        });
      }
      for (const e of entries) {
        checkLocationAndDate(a, e, entryIds, bSumCents, disagreements);
      }
      continue;
    }

    const entry = entries[0];
    const bValCents = entry.value_cents as number;

    if (bValCents !== a.total_value_cents) {
      const diffCents = bValCents - a.total_value_cents;
      const matchesBase = bValCents === a.base_value_cents;
      const detail = matchesBase
        ? `System B recorded ${formatCents(bValCents)} (System A base_value without ${formatCents(a.adjustment_cents)} adjustment) instead of total_value ${formatCents(a.total_value_cents)}.`
        : `System B value ${formatCents(bValCents)} differs from System A total_value ${formatCents(a.total_value_cents)}.`;

      disagreements.push({
        id: `VALUE_MISMATCH:${a.record_id}`,
        reason: 'VALUE_MISMATCH',
        record_id: a.record_id,
        entry_ids: entryIds,
        location: a.location_id,
        location_name: a.location_name,
        a_value: formatCents(a.total_value_cents),
        b_value: formatCents(bValCents),
        difference: formatCents(diffCents),
        a_value_cents: a.total_value_cents,
        b_value_cents: bValCents,
        difference_cents: diffCents,
        event_date: a.event_date,
        recorded_on: entry.recorded_on,
        state: a.state,
        detail,
        cross_org_redacted: false,
      });
    }

    checkLocationAndDate(a, entry, entryIds, bValCents, disagreements);
  }

  return disagreements;
}

function checkLocationAndDate(
  a: SystemARow,
  entry: SystemBRow,
  entryIds: string[],
  bDisplayCents: number,
  disagreements: DisagreementItem[],
): void {
  const diffCents = bDisplayCents - a.total_value_cents;

  if (entry.location_id !== a.location_id) {
    const isCrossOrg = entry.org_id !== a.org_id;
    const id = `LOCATION_MISMATCH:${a.record_id}`;
    if (!disagreements.some((d) => d.id === id)) {
      disagreements.push({
        id,
        reason: 'LOCATION_MISMATCH',
        record_id: a.record_id,
        entry_ids: entryIds,
        location: a.location_id,
        location_name: a.location_name,
        a_value: formatCents(a.total_value_cents),
        b_value: formatCents(bDisplayCents),
        difference: formatCents(diffCents),
        a_value_cents: a.total_value_cents,
        b_value_cents: bDisplayCents,
        difference_cents: diffCents,
        event_date: a.event_date,
        recorded_on: entry.recorded_on,
        state: a.state,
        detail: isCrossOrg
          ? `System A is booked at ${a.location_id}; System B recorded a different location (redacted — outside tenant boundary).`
          : `System A is booked at ${a.location_id}, while System B recorded ${entry.location_id}.`,
        cross_org_redacted: isCrossOrg,
      });
    }
  }

  if (entry.recorded_on !== a.event_date) {
    const id = `DATE_MISMATCH:${a.record_id}`;
    if (!disagreements.some((d) => d.id === id)) {
      disagreements.push({
        id,
        reason: 'DATE_MISMATCH',
        record_id: a.record_id,
        entry_ids: entryIds,
        location: a.location_id,
        location_name: a.location_name,
        a_value: formatCents(a.total_value_cents),
        b_value: formatCents(bDisplayCents),
        difference: formatCents(diffCents),
        a_value_cents: a.total_value_cents,
        b_value_cents: bDisplayCents,
        difference_cents: diffCents,
        event_date: a.event_date,
        recorded_on: entry.recorded_on,
        state: a.state,
        detail: `System A event_date (${a.event_date}) differs from System B recorded_on (${entry.recorded_on}).`,
        cross_org_redacted: false,
      });
    }
  }
}

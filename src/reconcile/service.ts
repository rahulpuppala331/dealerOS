import { formatCents } from './cleaning';
import { compareRecords } from './compare';
import type { SqliteDatabase } from './db';
import {
  ALL_DISAGREEMENT_REASONS,
  type DisagreementItem,
  type DisagreementReason,
  type DisagreementsResponse,
  type OrgInfo,
  type OrgSummary,
  type SystemARow,
  type SystemBRow,
} from './types';

export class InvalidOrgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrgError';
  }
}

export class InvalidQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidQueryError';
  }
}

/**
 * Lists all tenant organizations strictly from the `locations` table.
 */
export function listOrgs(db: SqliteDatabase): OrgInfo[] {
  const rows = db
    .prepare(
      `SELECT org_id, location_id, location_name
       FROM locations
       ORDER BY org_id ASC, location_id ASC`,
    )
    .all() as Array<{ org_id: string; location_id: string; location_name: string }>;

  const map = new Map<string, OrgInfo>();
  for (const row of rows) {
    const existing = map.get(row.org_id);
    if (existing) {
      existing.locations.push({
        location_id: row.location_id,
        location_name: row.location_name,
      });
    } else {
      map.set(row.org_id, {
        org_id: row.org_id,
        locations: [{ location_id: row.location_id, location_name: row.location_name }],
      });
    }
  }
  return Array.from(map.values());
}

export function assertValidOrg(db: SqliteDatabase, org: string | undefined): string {
  const normalized = (org ?? '').trim();
  if (!normalized) {
    throw new InvalidOrgError('Missing required query parameter: org (e.g. ?org=ORG-A)');
  }
  const found = db.prepare('SELECT 1 FROM locations WHERE org_id = ? LIMIT 1').get(normalized);
  if (!found) {
    throw new InvalidOrgError(`Unknown organization: "${normalized}"`);
  }
  return normalized;
}

/**
 * Loads ONLY rows belonging to `org`, enforced directly in SQL via JOIN on
 * `locations.org_id`.
 */
function loadTenantRows(
  db: SqliteDatabase,
  org: string,
): { aRows: SystemARow[]; bMatchedRows: SystemBRow[]; bOrphanRows: SystemBRow[] } {
  const aRows = db
    .prepare(
      `SELECT
         a.record_id,
         a.location_id,
         la.org_id,
         la.location_name,
         a.event_date,
         a.category_code,
         a.actor_id,
         a.base_value_cents,
         a.adjustment_cents,
         a.total_value_cents,
         a.state
       FROM system_a_records a
       INNER JOIN locations la ON la.location_id = a.location_id
       WHERE la.org_id = ?
       ORDER BY a.record_id ASC`,
    )
    .all(org) as SystemARow[];

  const bMatchedRows = db
    .prepare(
      `SELECT
         b.entry_id,
         b.record_ref_raw,
         b.record_ref,
         b.location_id,
         lb.org_id,
         lb.location_name,
         b.recorded_on,
         b.value_raw,
         b.value_cents,
         b.label
       FROM system_b_entries b
       INNER JOIN locations lb ON lb.location_id = b.location_id
       INNER JOIN system_a_records a ON a.record_id = b.record_ref
       INNER JOIN locations la ON la.location_id = a.location_id
       WHERE la.org_id = ?
       ORDER BY b.entry_id ASC`,
    )
    .all(org) as SystemBRow[];

  const bOrphanRows = db
    .prepare(
      `SELECT
         b.entry_id,
         b.record_ref_raw,
         b.record_ref,
         b.location_id,
         lb.org_id,
         lb.location_name,
         b.recorded_on,
         b.value_raw,
         b.value_cents,
         b.label
       FROM system_b_entries b
       INNER JOIN locations lb ON lb.location_id = b.location_id
       WHERE lb.org_id = ?
         AND (
           b.record_ref IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM system_a_records a WHERE a.record_id = b.record_ref
           )
         )
       ORDER BY b.entry_id ASC`,
    )
    .all(org) as SystemBRow[];

  return { aRows, bMatchedRows, bOrphanRows };
}

const VALID_SORT_KEYS = new Set([
  'value',
  '-value',
  'a_value',
  '-a_value',
  'b_value',
  '-b_value',
  'diff',
  '-diff',
  'record_id',
  '-record_id',
  'reason',
  '-reason',
  'location',
  '-location',
]);

function sortDisagreements(items: DisagreementItem[], sort: string): DisagreementItem[] {
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  const dir = desc ? -1 : 1;

  const compareNullableNum = (x: number | null, y: number | null): number => {
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dir;
  };

  return [...items].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'value': {
        const valA = a.a_value_cents ?? a.b_value_cents;
        const valB = b.a_value_cents ?? b.b_value_cents;
        cmp = compareNullableNum(valA, valB);
        break;
      }
      case 'a_value':
        cmp = compareNullableNum(a.a_value_cents, b.a_value_cents);
        break;
      case 'b_value':
        cmp = compareNullableNum(a.b_value_cents, b.b_value_cents);
        break;
      case 'diff':
        cmp = compareNullableNum(a.difference_cents, b.difference_cents);
        break;
      case 'reason':
        cmp = a.reason.localeCompare(b.reason) * dir;
        break;
      case 'location':
        cmp = a.location.localeCompare(b.location) * dir;
        break;
      case 'record_id':
      default:
        cmp = a.record_id.localeCompare(b.record_id) * dir;
        break;
    }
    if (cmp !== 0) return cmp;
    return a.record_id.localeCompare(b.record_id);
  });
}

export interface QueryDisagreementsParams {
  org: string | undefined;
  reason?: string | undefined;
  sort?: string | undefined;
}

export function queryDisagreements(
  db: SqliteDatabase,
  params: QueryDisagreementsParams,
): DisagreementsResponse {
  const org = assertValidOrg(db, params.org);

  const rawReason = (params.reason ?? '').trim();
  let reason: DisagreementReason | null = null;
  if (rawReason && rawReason !== 'ALL') {
    if (!ALL_DISAGREEMENT_REASONS.includes(rawReason as DisagreementReason)) {
      throw new InvalidQueryError(`Invalid reason filter: "${rawReason}"`);
    }
    reason = rawReason as DisagreementReason;
  }

  const sort = (params.sort ?? '').trim() || '-value';
  if (!VALID_SORT_KEYS.has(sort)) {
    throw new InvalidQueryError(`Invalid sort parameter: "${sort}"`);
  }

  const { aRows, bMatchedRows, bOrphanRows } = loadTenantRows(db, org);
  const allDisagreements = compareRecords(aRows, [...bMatchedRows, ...bOrphanRows]);

  const filtered = reason
    ? allDisagreements.filter((d) => d.reason === reason)
    : allDisagreements;

  const sorted = sortDisagreements(filtered, sort);

  return {
    org,
    total: allDisagreements.length,
    count: sorted.length,
    reason,
    sort,
    disagreements: sorted,
  };
}

export function getOrgSummary(db: SqliteDatabase, orgInput: string | undefined): OrgSummary {
  const org = assertValidOrg(db, orgInput);
  const { aRows, bMatchedRows, bOrphanRows } = loadTenantRows(db, org);
  const disagreements = compareRecords(aRows, [...bMatchedRows, ...bOrphanRows]);

  const byReason = Object.fromEntries(
    ALL_DISAGREEMENT_REASONS.map((r) => [r, 0]),
  ) as Record<DisagreementReason, number>;

  const flaggedRecordIds = new Set<string>();
  let netVarianceCents = 0;

  for (const d of disagreements) {
    byReason[d.reason]++;
    if (d.reason !== 'ORPHAN_IN_B') {
      flaggedRecordIds.add(d.record_id);
    }
    if (d.difference_cents !== null) {
      netVarianceCents += d.difference_cents;
    } else if (d.reason === 'MISSING_IN_B' && d.a_value_cents !== null) {
      netVarianceCents -= d.a_value_cents;
    } else if (d.reason === 'ORPHAN_IN_B' && d.b_value_cents !== null) {
      netVarianceCents += d.b_value_cents;
    }
  }

  const locationCountRow = db
    .prepare('SELECT COUNT(*) as cnt FROM locations WHERE org_id = ?')
    .get(org) as { cnt: number };

  return {
    org,
    locationCount: locationCountRow.cnt,
    systemACount: aRows.length,
    systemBMatchedCount: bMatchedRows.length,
    systemBOrphanCount: bOrphanRows.length,
    disagreementCount: disagreements.length,
    cleanMatchedCount: aRows.length - flaggedRecordIds.size,
    netVarianceCents,
    netVariance: formatCents(netVarianceCents) ?? '0.00',
    byReason,
  };
}

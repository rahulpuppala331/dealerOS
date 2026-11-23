export type DisagreementReason =
  | 'MISSING_IN_B'
  | 'ORPHAN_IN_B'
  | 'DUPLICATE_IN_B'
  | 'VALUE_MISMATCH'
  | 'LOCATION_MISMATCH'
  | 'DATE_MISMATCH'
  | 'VOIDED_IN_A';

export const ALL_DISAGREEMENT_REASONS: readonly DisagreementReason[] = [
  'VALUE_MISMATCH',
  'MISSING_IN_B',
  'ORPHAN_IN_B',
  'DUPLICATE_IN_B',
  'LOCATION_MISMATCH',
  'DATE_MISMATCH',
  'VOIDED_IN_A',
] as const;

export interface LocationRow {
  location_id: string;
  org_id: string;
  location_name: string;
}

export interface SystemARow {
  record_id: string;
  location_id: string;
  org_id: string;
  location_name: string;
  event_date: string;
  category_code: string;
  actor_id: string | null;
  base_value_cents: number;
  adjustment_cents: number;
  total_value_cents: number;
  state: string;
}

export interface SystemBRow {
  entry_id: string;
  record_ref_raw: string;
  record_ref: string | null;
  location_id: string;
  org_id: string;
  location_name: string;
  recorded_on: string;
  value_raw: string;
  value_cents: number | null;
  label: string;
}

export interface DisagreementItem {
  id: string;
  reason: DisagreementReason;
  record_id: string;
  entry_ids: string[];
  location: string;
  location_name: string;
  /** Exact decimal string (e.g. "183244.16") or null when absent — never 0 for missing. */
  a_value: string | null;
  /** Exact decimal string (e.g. "125400.00") or null when absent/blank — never 0 for blank. */
  b_value: string | null;
  /** Exact signed decimal string (b_value - a_value) or null when either side is absent/blank. */
  difference: string | null;
  a_value_cents: number | null;
  b_value_cents: number | null;
  difference_cents: number | null;
  event_date: string | null;
  recorded_on: string | null;
  state: string | null;
  /** Non-leaking human explanation of the discrepancy. */
  detail: string;
  /** True when B's location belonged to another org and was intentionally redacted. */
  cross_org_redacted: boolean;
}

export interface ImportSummary {
  ranAt: string;
  locations: {
    read: number;
    saved: number;
  };
  systemA: {
    read: number;
    saved: number;
    blankActors: number;
    voidedRecords: number;
  };
  systemB: {
    read: number;
    saved: number;
    refsNormalized: number;
    valuesLeftNull: number;
    formattedValuesCleaned: number;
  };
  warnings: string[];
}

export interface OrgInfo {
  org_id: string;
  locations: Array<{
    location_id: string;
    location_name: string;
  }>;
}

export interface OrgSummary {
  org: string;
  locationCount: number;
  systemACount: number;
  systemBMatchedCount: number;
  systemBOrphanCount: number;
  disagreementCount: number;
  cleanMatchedCount: number;
  netVarianceCents: number;
  netVariance: string;
  byReason: Record<DisagreementReason, number>;
}

export interface DisagreementsResponse {
  org: string;
  total: number;
  count: number;
  reason: DisagreementReason | null;
  sort: string;
  disagreements: DisagreementItem[];
}

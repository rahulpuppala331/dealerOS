import type { DisagreementReason } from '../reconcile/types';

/**
 * Formats an exact decimal string (e.g. "183244.16" or "-17337.91") with
 * grouping commas using pure string operations (never floating-point math).
 *
 * Returns an empty string for `null` so missing or blank values render as an
 * empty cell — never "0" and never "null".
 */
export function formatDecimalDisplay(
  value: string | null,
  options: { signed?: boolean } = {},
): string {
  if (value === null) return '';
  const isNegative = value.startsWith('-');
  const unsigned = isNegative ? value.slice(1) : value;
  const [whole, frac = '00'] = unsigned.split('.');

  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const signPrefix = isNegative
    ? '−'
    : options.signed && unsigned !== '0.00'
      ? '+'
      : '';

  return `${signPrefix}${groupedWhole}.${frac.padEnd(2, '0')}`;
}

export interface ReasonPresentation {
  code: DisagreementReason;
  label: string;
  textClass: string;
  accentRule: string;
}

export const REASON_META: Record<DisagreementReason, ReasonPresentation> = {
  VALUE_MISMATCH: {
    code: 'VALUE_MISMATCH',
    label: 'Value mismatch',
    textClass: 'text-red-700',
    accentRule: 'System B value is blank or differs from System A total_value',
  },
  MISSING_IN_B: {
    code: 'MISSING_IN_B',
    label: 'Missing in B',
    textClass: 'text-amber-700',
    accentRule: 'Confirmed System A record has no matching System B entry',
  },
  ORPHAN_IN_B: {
    code: 'ORPHAN_IN_B',
    label: 'Orphan in B',
    textClass: 'text-amber-700',
    accentRule: 'System B entry references a record not present in System A',
  },
  DUPLICATE_IN_B: {
    code: 'DUPLICATE_IN_B',
    label: 'Duplicate in B',
    textClass: 'text-red-700',
    accentRule: 'Multiple System B entries that do not sum to System A total_value',
  },
  LOCATION_MISMATCH: {
    code: 'LOCATION_MISMATCH',
    label: 'Location mismatch',
    textClass: 'text-slate-900',
    accentRule: 'System A and System B recorded different locations (cross-org redacted)',
  },
  DATE_MISMATCH: {
    code: 'DATE_MISMATCH',
    label: 'Date mismatch',
    textClass: 'text-slate-700',
    accentRule: 'System A event_date differs from System B recorded_on',
  },
  VOIDED_IN_A: {
    code: 'VOIDED_IN_A',
    label: 'Voided in A',
    textClass: 'text-red-700',
    accentRule: 'Record is VOIDED in System A while System B still holds an active entry',
  },
};

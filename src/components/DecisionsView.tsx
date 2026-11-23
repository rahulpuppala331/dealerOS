interface DecisionEntry {
  title: string;
  rejected: string;
  why: string;
}

const DECISIONS: DecisionEntry[] = [
  {
    title: "Compare System B's value against System A's total_value",
    rejected: 'Compare against System A base_value',
    why: 'On clean matched rows across both organizations, System B matches A.total_value (base_value + adjustment). Rows where B equals base_value (REC-1003, REC-1027, REC-1088) are genuine discrepancies missing the adjustment.',
  },
  {
    title: 'Store monetary figures as exact integer cents (minor units)',
    rejected: 'Store money as JavaScript Number / SQLite REAL (IEEE-754 float)',
    why: 'Floating-point arithmetic fails exact equality checks (0.1 + 0.2 !== 0.3). Integer cents preserve exact 2-decimal precision for sums like split entries (71,950.93 + 107,926.39 = 179,877.32) with zero drift.',
  },
  {
    title: 'Preserve blank or unparseable values as NULL, never 0',
    rejected: 'Coerce empty cells to 0.00 or drop dirty CSV rows during import',
    why: 'ENT/2026/4050 has a blank value and REC-1050 has a blank actor_id. Blank means unknown, not zero. Storing NULL alongside raw text ensures zero row loss and flags blank B values as VALUE_MISMATCH with an empty UI cell.',
  },
  {
    title: 'Normalize messy record references while retaining record_ref_raw',
    rejected: 'Exact string join on raw record_ref',
    why: 'System B contains "rec1034", " REC - 1070 ", and "1112". Extracting digits into canonical "REC-<digits>" matches those rows cleanly without false positives while keeping the original text auditable.',
  },
  {
    title: 'Treat multi-entry records whose sum equals A.total_value as valid splits',
    rejected: 'Flag every record with >1 System B entry as DUPLICATE_IN_B',
    why: 'REC-1055 is split across ENT/2026/4055 (71,950.93) and ENT/2026/4903 (107,926.39, "Entry part 2 of 2"), summing exactly to 179,877.32. REC-1042 enters 112,837.06 twice (225,674.12 total) and is correctly flagged as DUPLICATE_IN_B.',
  },
  {
    title: 'Flag VOIDED System A records that still have an active System B entry',
    rejected: 'Ignore VOIDED records or exclude them from comparison',
    why: 'REC-1019 is VOIDED in System A yet ENT/2026/4019 still posts 57,092.35 in System B. Leaving an unreversed entry in System B overstates the ledger, so we surface it explicitly as VOIDED_IN_A.',
  },
  {
    title: 'Include LOCATION_MISMATCH and DATE_MISMATCH alongside the four core reasons',
    rejected: 'Compare only amounts and entry counts',
    why: 'REC-1009 crosses a month boundary (2026-03-31 vs 2026-04-02), affecting period close reporting, and REC-1077 crosses branches/tenants. Both are material accounting discrepancies.',
  },
  {
    title: 'Enforce SQL-level tenant filtering and redact cross-org locations on the trap row',
    rejected: 'Fetch all rows and filter in React, or display both locations on REC-1077',
    why: 'REC-1077 sits at LOC-102 (ORG-A) in System A and LOC-201 (ORG-B) in System B. Returning "LOC-201" to ORG-A leaks ORG-B data; showing REC-1077 to ORG-B leaks ORG-A data. We scope SQL queries strictly via locations.org_id, surface REC-1077 only to ORG-A (System A owner), and redact System B’s foreign location identifier.',
  },
];

export function DecisionsView() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
          Architecture & Reconciliation Decisions
        </h1>
        <p className="mt-1 text-sm text-slate-600 max-w-2xl">
          Key engineering choices documented in <span className="font-mono text-xs">DECISIONS.md</span>{' '}
          covering data hygiene, comparison semantics, and multi-tenant boundary enforcement.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
        {DECISIONS.map((item, idx) => (
          <article key={idx} className="p-5 sm:p-6">
            <h2 className="text-base font-semibold text-slate-900">
              {String(idx + 1).padStart(2, '0')}. {item.title}
            </h2>
            <dl className="mt-3 grid grid-cols-1 md:grid-cols-12 gap-3 text-sm">
              <div className="md:col-span-4">
                <dt className="text-xs font-medium text-slate-500">Rejected alternative</dt>
                <dd className="mt-1 text-slate-700">{item.rejected}</dd>
              </div>
              <div className="md:col-span-8">
                <dt className="text-xs font-medium text-slate-500">Rationale</dt>
                <dd className="mt-1 text-slate-700 leading-relaxed">{item.why}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}

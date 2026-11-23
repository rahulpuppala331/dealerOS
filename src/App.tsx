import { Download, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALL_DISAGREEMENT_REASONS,
  type DisagreementItem,
  type DisagreementReason,
  type DisagreementsResponse,
  type ImportSummary,
  type OrgInfo,
  type OrgSummary,
} from './reconcile/types';
import { DecisionsView } from './components/DecisionsView';
import { DisagreementsTable } from './components/DisagreementsTable';
import { ImportAuditView } from './components/ImportAuditView';
import { formatDecimalDisplay, REASON_META } from './lib/format';

type ActiveTab = 'disagreements' | 'import' | 'decisions';

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('disagreements');

  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>('ORG-A');
  const [selectedReason, setSelectedReason] = useState<string>('ALL');
  const [sort, setSort] = useState<string>('-value');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [disagreements, setDisagreements] = useState<DisagreementItem[]>([]);
  const [totalForOrg, setTotalForOrg] = useState<number>(0);
  const [summary, setSummary] = useState<OrgSummary | null>(null);
  const [importReport, setImportReport] = useState<ImportSummary | null>(null);

  const [loadingTable, setLoadingTable] = useState<boolean>(true);
  const [loadingReport, setLoadingReport] = useState<boolean>(false);
  const [reimporting, setReimporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/orgs')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load organizations');
        return res.json();
      })
      .then((data: { orgs: OrgInfo[] }) => {
        if (cancelled) return;
        setOrgs(data.orgs);
        if (data.orgs.length > 0 && !data.orgs.some((o) => o.org_id === selectedOrg)) {
          setSelectedOrg(data.orgs[0].org_id);
        }
      })
      .catch((err) => {
        if (!cancelled) setErrorMessage(err instanceof Error ? err.message : 'Unable to load orgs');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchDisagreementsAndSummary = useCallback(async () => {
    if (!selectedOrg) return;
    setLoadingTable(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({ org: selectedOrg, sort });
      if (selectedReason && selectedReason !== 'ALL') {
        params.set('reason', selectedReason);
      }

      const [disRes, sumRes] = await Promise.all([
        fetch(`/api/disagreements?${params.toString()}`),
        fetch(`/api/summary?org=${encodeURIComponent(selectedOrg)}`),
      ]);

      if (!disRes.ok) {
        const body = (await disRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to load disagreements');
      }
      if (!sumRes.ok) {
        const body = (await sumRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to load tenant summary');
      }

      const disData = (await disRes.json()) as DisagreementsResponse;
      const sumData = (await sumRes.json()) as OrgSummary;

      setDisagreements(disData.disagreements);
      setTotalForOrg(disData.total);
      setSummary(sumData);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unexpected API error');
    } finally {
      setLoadingTable(false);
    }
  }, [selectedOrg, selectedReason, sort]);

  useEffect(() => {
    void fetchDisagreementsAndSummary();
  }, [fetchDisagreementsAndSummary]);

  const fetchImportReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const res = await fetch('/api/import-report');
      if (res.ok) {
        const data = (await res.json()) as ImportSummary;
        setImportReport(data);
      }
    } finally {
      setLoadingReport(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'import' && !importReport) {
      void fetchImportReport();
    }
  }, [activeTab, importReport, fetchImportReport]);

  const handleReimport = async () => {
    setReimporting(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/reimport', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to re-run CSV import');
      const data = (await res.json()) as ImportSummary;
      setImportReport(data);
      await fetchDisagreementsAndSummary();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Re-import failed');
    } finally {
      setReimporting(false);
    }
  };

  const visibleRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return disagreements;
    return disagreements.filter(
      (row) =>
        row.record_id.toLowerCase().includes(q) ||
        row.location.toLowerCase().includes(q) ||
        row.location_name.toLowerCase().includes(q) ||
        row.reason.toLowerCase().includes(q) ||
        row.entry_ids.some((id) => id.toLowerCase().includes(q)),
    );
  }, [disagreements, searchQuery]);

  const activeOrgMeta = useMemo(
    () => orgs.find((o) => o.org_id === selectedOrg) ?? null,
    [orgs, selectedOrg],
  );

  const handleExportCsv = () => {
    const headers = [
      'Reason',
      'Record ID',
      'Entry IDs',
      'Location',
      'Location Name',
      'System A Value',
      'System B Value',
      'Difference',
      'Event Date',
      'Recorded On',
      'Detail',
    ];
    const lines = [
      headers.join(','),
      ...visibleRows.map((row) =>
        [
          row.reason,
          row.record_id,
          row.entry_ids.join('; '),
          row.location,
          row.location_name,
          row.a_value ?? '',
          row.b_value ?? '',
          row.difference ?? '',
          row.event_date ?? '',
          row.recorded_on ?? '',
          row.detail,
        ]
          .map((cell) => escapeCsvCell(String(cell)))
          .join(','),
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dealeros-disagreements-${selectedOrg.toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSelectedReason('ALL');
    setSearchQuery('');
  };

  const handleOrgChange = (nextOrg: string) => {
    setSelectedOrg(nextOrg);
    setSelectedReason('ALL');
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#disagreements"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('disagreements');
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            DealerOS
          </a>

          <nav aria-label="Primary navigation" className="flex items-center gap-6 text-sm font-medium">
            {(
              [
                ['disagreements', 'Disagreements'],
                ['import', 'Import Audit'],
                ['decisions', 'Decisions'],
              ] as const
            ).map(([tabKey, label]) => {
              const active = activeTab === tabKey;
              return (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setActiveTab(tabKey)}
                  className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                    active
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <label htmlFor="org-selector" className="sr-only">
              Active Organization
            </label>
            <select
              id="org-selector"
              value={selectedOrg}
              onChange={(e) => handleOrgChange(e.target.value)}
              className="h-9 pl-3 pr-8 text-sm font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-md hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-900 transition-colors cursor-pointer"
            >
              {(orgs.length > 0
                ? orgs
                : [
                    { org_id: 'ORG-A', locations: [] },
                    { org_id: 'ORG-B', locations: [] },
                  ]
              ).map((org) => (
                <option key={org.org_id} value={org.org_id}>
                  Tenant: {org.org_id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {errorMessage && (
          <div
            role="alert"
            className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 flex items-center justify-between gap-4"
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => void fetchDisagreementsAndSummary()}
              className="text-xs font-medium text-red-900 underline underline-offset-2 whitespace-nowrap shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {activeTab === 'disagreements' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
                  Ledger Reconciliation
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  <span>{selectedOrg}</span>
                  {activeOrgMeta && activeOrgMeta.locations.length > 0 && (
                    <>
                      <span className="mx-2 text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {activeOrgMeta.locations.map((l) => l.location_id).join(', ')}
                      </span>
                    </>
                  )}
                  <span className="mx-2 text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <span>Strict SQL tenant scope</span>
                </p>
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={visibleRows.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                <Download className="h-4 w-4 text-slate-500" aria-hidden="true" />
                <span>Export CSV</span>
              </button>
            </div>

            <section
              aria-label="Organization reconciliation summary"
              className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200"
            >
              <div className="p-5">
                <p className="text-xs font-medium text-slate-500">System A Records</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                  {summary ? summary.systemACount : '—'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Across {summary ? summary.locationCount : '—'} locations in {selectedOrg}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-medium text-slate-500">Clean Matches</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
                  {summary ? summary.cleanMatchedCount : '—'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {summary
                    ? `${Math.round((summary.cleanMatchedCount / Math.max(summary.systemACount, 1)) * 100)}% exact match rate`
                    : 'Loading rate'}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-medium text-slate-500">Flagged Disagreements</p>
                <p className="mt-2 font-mono text-2xl font-semibold text-red-700 tabular-nums">
                  {summary ? summary.disagreementCount : '—'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {summary && summary.systemBOrphanCount > 0
                    ? `Includes ${summary.systemBOrphanCount} orphan System B entry`
                    : 'Matched & missing ledger lines'}
                </p>
              </div>

              <div className="p-5">
                <p className="text-xs font-medium text-slate-500">Net Value Variance (B − A)</p>
                <p
                  className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                    summary && summary.netVarianceCents < 0
                      ? 'text-red-700'
                      : summary && summary.netVarianceCents > 0
                        ? 'text-amber-700'
                        : 'text-slate-900'
                  }`}
                >
                  {summary ? formatDecimalDisplay(summary.netVariance, { signed: true }) : '—'}
                </p>
                <p className="mt-1 text-xs text-slate-500">Excludes unknown blank amounts</p>
              </div>
            </section>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor="reason-filter" className="text-xs font-medium text-slate-500">
                    Reason
                  </label>
                  <select
                    id="reason-filter"
                    value={selectedReason}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    className="h-9 pl-3 pr-8 text-sm text-slate-900 bg-white border border-slate-300 rounded-md hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-900 cursor-pointer"
                  >
                    <option value="ALL">All reasons ({totalForOrg})</option>
                    {ALL_DISAGREEMENT_REASONS.map((reasonKey: DisagreementReason) => {
                      const count = summary?.byReason[reasonKey] ?? 0;
                      return (
                        <option key={reasonKey} value={reasonKey}>
                          {REASON_META[reasonKey].label} ({count})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="sort-select" className="text-xs font-medium text-slate-500">
                    Sort
                  </label>
                  <select
                    id="sort-select"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="h-9 pl-3 pr-8 text-sm text-slate-900 bg-white border border-slate-300 rounded-md hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-900 cursor-pointer"
                  >
                    <option value="-value">Value: High to Low</option>
                    <option value="value">Value: Low to High</option>
                    <option value="-a_value">System A: High to Low</option>
                    <option value="a_value">System A: Low to High</option>
                    <option value="-b_value">System B: High to Low</option>
                    <option value="b_value">System B: Low to High</option>
                    <option value="-diff">Difference: High to Low</option>
                    <option value="diff">Difference: Low to High</option>
                    <option value="record_id">Record ID: A to Z</option>
                    <option value="reason">Reason: A to Z</option>
                  </select>
                </div>
              </div>

              <div className="relative w-full md:w-72">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by record, entry, or location..."
                  aria-label="Filter disagreements by record, entry, or location"
                  className="h-9 w-full pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-md placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/15 focus:border-slate-900"
                />
              </div>
            </div>

            <DisagreementsTable
              items={visibleRows}
              loading={loadingTable}
              sort={sort}
              onSortChange={setSort}
              hasActiveFilter={selectedReason !== 'ALL' || searchQuery.trim().length > 0}
              onResetFilters={resetFilters}
            />

            <p className="text-xs text-slate-500">
              Showing{' '}
              <span className="font-mono tabular-nums text-slate-700">{visibleRows.length}</span> of{' '}
              <span className="font-mono tabular-nums text-slate-700">{totalForOrg}</span>{' '}
              disagreements for {selectedOrg}. Click any row to inspect dates, entry IDs, and
              reconciliation notes.
            </p>
          </div>
        )}

        {activeTab === 'import' && (
          <ImportAuditView
            report={importReport}
            loading={loadingReport}
            reimporting={reimporting}
            onReimport={() => void handleReimport()}
          />
        )}

        {activeTab === 'decisions' && <DecisionsView />}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>DealerOS Ledger Reconciliation</span>
          <span>Exact integer-cent arithmetic · Strict SQL tenant isolation</span>
        </div>
      </footer>
    </div>
  );
}

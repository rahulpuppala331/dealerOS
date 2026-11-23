import { RefreshCw } from 'lucide-react';
import type { ImportSummary } from '../reconcile/types';

interface ImportAuditViewProps {
  report: ImportSummary | null;
  loading: boolean;
  reimporting: boolean;
  onReimport: () => void;
}

export function ImportAuditView({
  report,
  loading,
  reimporting,
  onReimport,
}: ImportAuditViewProps) {
  if (loading || !report) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="mt-4 space-y-3">
          <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
          <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const allMatched =
    report.locations.read === report.locations.saved &&
    report.systemA.read === report.systemA.saved &&
    report.systemB.read === report.systemB.saved;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
            CSV Ingestion Audit
          </h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Zero-loss idempotent ingestion report verifying every source row was persisted into
            SQLite using UPSERT keys while preserving raw uncleaned fields.
          </p>
        </div>

        <button
          type="button"
          onClick={onReimport}
          disabled={reimporting}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          <RefreshCw
            className={`h-4 w-4 ${reimporting ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <span>{reimporting ? 'Running import...' : 'Re-run idempotent import'}</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">Table Row Reconciliation</h2>
          <span
            className={`text-xs font-medium ${allMatched ? 'text-emerald-700' : 'text-red-700'}`}
          >
            {allMatched ? 'Verified — zero rows dropped' : 'Mismatch detected'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-5">Source Dataset</th>
                <th className="py-3 px-4 text-right">CSV Rows Read</th>
                <th className="py-3 px-4 text-right">Database Rows Saved</th>
                <th className="py-3 px-5">Data Hygiene Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="h-12">
                <td className="py-3 px-5 font-medium text-slate-900">Locations</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                  {report.locations.read}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                  {report.locations.saved}
                </td>
                <td className="py-3 px-5 text-slate-600">
                  Authoritative location-to-organization tenant map
                </td>
              </tr>

              <tr className="h-12">
                <td className="py-3 px-5 font-medium text-slate-900">System A Records</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                  {report.systemA.read}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                  {report.systemA.saved}
                </td>
                <td className="py-3 px-5 text-slate-600">
                  {report.systemA.blankActors} blank actor_id stored as NULL ·{' '}
                  {report.systemA.voidedRecords} VOIDED record retained
                </td>
              </tr>

              <tr className="h-12">
                <td className="py-3 px-5 font-medium text-slate-900">System B Entries</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                  {report.systemB.read}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                  {report.systemB.saved}
                </td>
                <td className="py-3 px-5 text-slate-600">
                  {report.systemB.refsNormalized} references normalized ·{' '}
                  {report.systemB.formattedValuesCleaned} grouped value cleaned ·{' '}
                  {report.systemB.valuesLeftNull} blank value kept NULL
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-slate-900">Logged Ingestion Normalizations</h2>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            Last run: {new Date(report.ranAt).toLocaleString()}
          </span>
        </div>

        <ul className="divide-y divide-slate-100">
          {report.warnings.map((warning, idx) => (
            <li key={idx} className="px-5 py-3 text-sm font-mono text-slate-700">
              {warning}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

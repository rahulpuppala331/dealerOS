import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { Fragment, useState } from 'react';
import type { DisagreementItem } from '../reconcile/types';
import { formatDecimalDisplay, REASON_META } from '../lib/format';

interface DisagreementsTableProps {
  items: DisagreementItem[];
  loading: boolean;
  sort: string;
  onSortChange: (nextSort: string) => void;
  hasActiveFilter: boolean;
  onResetFilters: () => void;
}

type SortableColumn = 'value' | 'a_value' | 'b_value' | 'diff' | 'record_id' | 'reason' | 'location';

export function DisagreementsTable({
  items,
  loading,
  sort,
  onSortChange,
  hasActiveFilter,
  onResetFilters,
}: DisagreementsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleSort = (col: SortableColumn) => {
    const descKey = `-${col}`;
    if (sort === descKey) {
      onSortChange(col);
    } else {
      onSortChange(descKey);
    }
  };

  const renderSortIcon = (col: SortableColumn) => {
    if (sort === `-${col}`) {
      return <ArrowDown className="h-3.5 w-3.5 text-slate-900 shrink-0" aria-hidden="true" />;
    }
    if (sort === col) {
      return <ArrowUp className="h-3.5 w-3.5 text-slate-900 shrink-0" aria-hidden="true" />;
    }
    return <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />;
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 pl-4 pr-3 w-8" />
                <th className="py-3 px-3">Reason</th>
                <th className="py-3 px-3">Record ID</th>
                <th className="py-3 px-3">Location</th>
                <th className="py-3 px-3 text-right">System A Value</th>
                <th className="py-3 px-3 text-right">System B Value</th>
                <th className="py-3 pl-3 pr-5 text-right">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from({ length: 6 }).map((_, idx) => (
                <tr key={idx} className="h-11">
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg px-6 py-16 text-center">
        <p className="text-base font-medium text-slate-900">
          {hasActiveFilter
            ? 'No disagreements match the current filter.'
            : 'All records reconciled cleanly for this organization.'}
        </p>
        <p className="mt-1.5 text-sm text-slate-500">
          {hasActiveFilter
            ? 'Try switching the reason filter or clearing the search query to inspect all tenant discrepancies.'
            : 'Every System A record matches its System B entries in value, location, date, and state.'}
        </p>
        {hasActiveFilter && (
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-5 inline-flex items-center px-4 py-2 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Reset filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500">
              <th className="py-3 pl-4 pr-2 w-9" aria-label="Expand details" />
              <th className="py-3 px-3 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('reason')}
                  className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors whitespace-nowrap"
                >
                  <span>Reason</span>
                  {renderSortIcon('reason')}
                </button>
              </th>
              <th className="py-3 px-3 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('record_id')}
                  className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors whitespace-nowrap"
                >
                  <span>Record ID</span>
                  {renderSortIcon('record_id')}
                </button>
              </th>
              <th className="py-3 px-3 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('location')}
                  className="inline-flex items-center gap-1.5 hover:text-slate-900 transition-colors whitespace-nowrap"
                >
                  <span>Location</span>
                  {renderSortIcon('location')}
                </button>
              </th>
              <th className="py-3 px-3 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('a_value')}
                  className="inline-flex items-center justify-end gap-1.5 hover:text-slate-900 transition-colors whitespace-nowrap ml-auto"
                >
                  <span>System A Value</span>
                  {renderSortIcon('a_value')}
                </button>
              </th>
              <th className="py-3 px-3 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('b_value')}
                  className="inline-flex items-center justify-end gap-1.5 hover:text-slate-900 transition-colors whitespace-nowrap ml-auto"
                >
                  <span>System B Value</span>
                  {renderSortIcon('b_value')}
                </button>
              </th>
              <th className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('diff')}
                  className="inline-flex items-center justify-end gap-1.5 hover:text-slate-900 transition-colors whitespace-nowrap ml-auto"
                >
                  <span>Difference</span>
                  {renderSortIcon('diff')}
                </button>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-sm">
            {items.map((row) => {
              const meta = REASON_META[row.reason];
              const isExpanded = expandedId === row.id;
              const diffNegative = row.difference_cents !== null && row.difference_cents < 0;
              const diffPositive = row.difference_cents !== null && row.difference_cents > 0;

              return (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    className={`h-11 cursor-pointer transition-colors ${
                      isExpanded ? 'bg-slate-50/90' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-2.5 pl-4 pr-2 text-slate-400">
                      <button
                        type="button"
                        aria-label={isExpanded ? 'Collapse row details' : 'Expand row details'}
                        aria-expanded={isExpanded}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(isExpanded ? null : row.id);
                        }}
                        className="p-0.5 text-slate-400 hover:text-slate-700"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-baseline gap-2">
                        <span className={`font-medium ${meta.textClass}`}>{meta.label}</span>
                        <span className="font-mono text-xs text-slate-400">{row.reason}</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-mono font-medium text-slate-900 tabular-nums">
                        {row.record_id}
                      </span>
                      {row.entry_ids.length > 1 && (
                        <span className="ml-2 text-xs text-slate-500">
                          · {row.entry_ids.length} entries
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-slate-800">{row.location}</span>
                      <span className="mx-1.5 text-slate-300" aria-hidden="true">
                        /
                      </span>
                      <span className="text-slate-600">{row.location_name}</span>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {formatDecimalDisplay(row.a_value)}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {formatDecimalDisplay(row.b_value)}
                    </td>

                    <td
                      className={`py-2.5 pl-3 pr-5 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                        diffNegative
                          ? 'text-red-700'
                          : diffPositive
                            ? 'text-amber-700'
                            : 'text-slate-500'
                      }`}
                    >
                      {formatDecimalDisplay(row.difference, { signed: true })}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="bg-slate-50/60">
                      <td />
                      <td colSpan={6} className="py-4 px-3 pr-5">
                        <div className="space-y-3">
                          <p className="text-sm text-slate-700 leading-relaxed">{row.detail}</p>

                          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600">
                            <div>
                              <span className="text-slate-400">System B entries: </span>
                              <span className="font-mono text-slate-800">
                                {row.entry_ids.length > 0 ? row.entry_ids.join(', ') : 'None'}
                              </span>
                            </div>
                            {row.event_date && (
                              <div>
                                <span className="text-slate-400">System A event date: </span>
                                <span className="font-mono text-slate-800 tabular-nums">
                                  {row.event_date}
                                </span>
                              </div>
                            )}
                            {row.recorded_on && (
                              <div>
                                <span className="text-slate-400">System B recorded on: </span>
                                <span className="font-mono text-slate-800 tabular-nums">
                                  {row.recorded_on}
                                </span>
                              </div>
                            )}
                            {row.state && (
                              <div>
                                <span className="text-slate-400">System A state: </span>
                                <span className="font-mono text-slate-800">{row.state}</span>
                              </div>
                            )}
                          </div>

                          {row.cross_org_redacted && (
                            <div className="flex items-start gap-2 pt-2 border-t border-slate-200 text-xs text-slate-600">
                              <ShieldAlert
                                className="h-4 w-4 text-slate-700 shrink-0 mt-0.5"
                                aria-hidden="true"
                              />
                              <span>
                                Tenant boundary protection active: System B recorded this transaction
                                under a location owned by another organization. That foreign location
                                identifier is omitted from the API response so cross-tenant metadata
                                is never exposed.
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import React, { useMemo } from 'react';
import {
  Calendar,
  Car,
  Copy,
  Download,
  Edit3,
  LayoutGrid,
  LayoutList,
  MapPin,
  Phone,
  Plus,
  Search,
  Table2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { TableRecord } from '../db/db';
import type { Language, Translations } from '../i18n/translations';
import { exportToCsv, exportToJson, exportToXlsx } from '../utils/export';
import { calculateAccuracyScore } from '../utils/parser';
import { getAccuracyBadgeClasses, getValidityStatus } from './RecordFieldsEditor';

export interface RecordsTableTabProps {
  records: TableRecord[];
  searchQuery: string;
  onSearchChange: (query: string) => void;
  viewMode: 'table' | 'cards';
  onViewModeChange: (mode: 'table' | 'cards') => void;
  onNewRecord: () => void;
  onNavigateToImport: () => void;
  onEditRecord: (rec: TableRecord) => void;
  onDuplicateRecord: (rec: TableRecord) => void;
  onDeleteRecord: (id?: number) => void;
  lang: Language;
  t: Translations;
}

export const RecordsTableTab: React.FC<RecordsTableTabProps> = ({
  records,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  onNewRecord,
  onNavigateToImport,
  onEditRecord,
  onDuplicateRecord,
  onDeleteRecord,
  lang,
  t,
}) => {
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      [
        r.imageName || '',
        r.fullName,
        r.address,
        r.phone,
        r.licensePlate,
        r.carModel,
        r.validPeriod,
        r.personalCode,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [records, searchQuery]);

  return (
    <div className="space-y-3">
      {/* Compact Top Action Bar fitted for 393px iPhone 16 Pro width */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-2xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onNewRecord}
              className="touch-press inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.actions.addNew}</span>
            </button>

            <button
              type="button"
              onClick={onNavigateToImport}
              className="touch-press inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-300 text-xs font-semibold"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{t.actions.importPhoto}</span>
            </button>
          </div>

          {/* Export & View Switcher */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => exportToCsv(filteredRecords, lang)}
              aria-label="Export CSV"
              className="touch-press inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              <Download className="w-3 h-3" />
              <span>{t.actions.exportCsv}</span>
            </button>
            <button
              type="button"
              onClick={() => exportToXlsx(filteredRecords, lang)}
              aria-label="Export XLSX"
              className="touch-press inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              <Download className="w-3 h-3" />
              <span>{t.actions.exportXlsx}</span>
            </button>
            <button
              type="button"
              onClick={() => exportToJson(filteredRecords, lang)}
              aria-label="Export JSON"
              className="touch-press inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              <Download className="w-3 h-3" />
              <span>{t.actions.exportJson}</span>
            </button>
          </div>
        </div>

        {/* Search + View Toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t.placeholders.search}
              aria-label={t.placeholders.search}
              className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => onViewModeChange('table')}
              aria-label={t.actions.viewTable}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.actions.viewTable}</span>
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('cards')}
              aria-label={t.actions.viewCards}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-500 dark:text-zinc-400'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.actions.viewCards}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Records Counter */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
          {t.labels.recordsCount} ({filteredRecords.length})
        </h2>
      </div>

      {filteredRecords.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
          <Table2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold">{t.labels.noRecordsTitle}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            {t.labels.noRecordsDesc}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        /* Full CRUD Table inside smooth horizontal container */
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950/60 text-[11px] font-semibold text-slate-600 dark:text-zinc-400 whitespace-nowrap">
                  <th className="py-2.5 px-2.5 w-12 text-center">{t.columns.rowNumber}</th>
                  <th className="py-2.5 px-3">{t.columns.fullName}</th>
                  <th className="py-2.5 px-3">{t.columns.address}</th>
                  <th className="py-2.5 px-3">{t.columns.phone}</th>
                  <th className="py-2.5 px-3">{t.columns.licensePlate}</th>
                  <th className="py-2.5 px-3">{t.columns.carModel}</th>
                  <th className="py-2.5 px-3">{t.columns.validPeriod}</th>
                  <th className="py-2.5 px-3">{t.columns.personalCode}</th>
                  <th className="py-2.5 px-3 text-center">{t.columns.accuracyScore}</th>
                  <th className="py-2.5 px-2.5 text-right">{t.columns.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/70">
                {filteredRecords.map((rec, index) => {
                  const status = getValidityStatus(rec.validPeriod);
                  const score = rec.accuracyScore ?? calculateAccuracyScore(rec);
                  return (
                    <tr
                      key={rec.id ?? index}
                      className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-2.5 text-center font-mono font-semibold text-slate-500 dark:text-zinc-400">
                        {index + 1}
                      </td>
                      <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                        {rec.fullName || '—'}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate" title={rec.address}>
                        {rec.address || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        {rec.phone || '—'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {rec.licensePlate ? (
                          <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 font-mono font-semibold text-[11px]">
                            {rec.licensePlate}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                        {rec.carModel || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            status === 'expired'
                              ? 'text-red-600 dark:text-red-400 font-semibold'
                              : status === 'expiring'
                                ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                : ''
                          }`}
                        >
                          {rec.validPeriod || '—'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                        {rec.personalCode || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          data-testid={`accuracy-badge-${index + 1}`}
                          className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold ${getAccuracyBadgeClasses(
                            score
                          )}`}
                        >
                          {score}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => onEditRecord(rec)}
                            aria-label={`${t.actions.edit} ${rec.fullName || index + 1}`}
                            className="touch-press p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateRecord(rec)}
                            aria-label={`${t.actions.duplicate} ${rec.fullName || index + 1}`}
                            className="touch-press p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteRecord(rec.id)}
                            aria-label={`${t.actions.delete} ${rec.fullName || index + 1}`}
                            className="touch-press p-1.5 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* iPhone 16 Pro Compact Card Grid View (zero horizontal scrolling) */
        <div className="space-y-2.5">
          {filteredRecords.map((rec, index) => {
            const score = rec.accuracyScore ?? calculateAccuracyScore(rec);
            return (
              <div
                key={rec.id ?? index}
                className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 shadow-2xs space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 shrink-0 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono text-xs font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold truncate">
                        {rec.fullName || '—'}
                      </h3>
                      {rec.personalCode && (
                        <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                          {t.columns.personalCode}: {rec.personalCode}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold ${getAccuracyBadgeClasses(
                        score
                      )}`}
                    >
                      {score}%
                    </span>
                    <button
                      type="button"
                      onClick={() => onEditRecord(rec)}
                      aria-label={`${t.actions.edit} ${rec.fullName || index + 1}`}
                      className="touch-press p-1.5 rounded-lg text-slate-500 hover:text-indigo-600"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRecord(rec.id)}
                      aria-label={`${t.actions.delete} ${rec.fullName || index + 1}`}
                      className="touch-press p-1.5 rounded-lg text-slate-500 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-xs pt-1 border-t border-slate-100 dark:border-zinc-800/80">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Car className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="font-mono font-semibold truncate">
                      {rec.licensePlate || '—'}
                    </span>
                    {rec.carModel && (
                      <span className="text-slate-500 dark:text-zinc-400 truncate">
                        · {rec.carModel}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 justify-end min-w-0">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="font-mono truncate">{rec.phone || '—'}</span>
                  </div>

                  {rec.address && (
                    <div className="col-span-2 flex items-center gap-1.5 text-slate-600 dark:text-zinc-300 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{rec.address}</span>
                    </div>
                  )}

                  {rec.validPeriod && (
                    <div className="col-span-2 flex items-center gap-1.5 font-mono text-[11px] text-slate-600 dark:text-zinc-300">
                      <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{rec.validPeriod}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RecordsTableTab;

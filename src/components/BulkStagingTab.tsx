import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  FileImage,
  Layers,
  ShieldCheck,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { db, type StagingRecord } from '../db/db';
import type { Translations } from '../i18n/translations';
import {
  extractTextAndConfidenceFromImageFile,
  terminateWarmWorker,
} from '../utils/ocr';
import {
  calculateAccuracyScore,
  parseDocumentCandidates,
  parseDocumentText,
  type ParsedDocumentCandidates,
  type ParsedDocumentFields,
} from '../utils/parser';
import {
  EMPTY_CANDIDATES,
  EMPTY_FORM,
  getAccuracyBadgeClasses,
  normalizeRecordFields,
  RecordFieldsEditor,
} from './RecordFieldsEditor';

export interface BulkStagingTabProps {
  stagingRecords: StagingRecord[];
  onReloadStaging: () => Promise<void>;
  onApproveCurrentStaging: (
    record: StagingRecord,
    fields: ParsedDocumentFields
  ) => Promise<void>;
  onApproveStagingRow: (
    item: StagingRecord,
    liveFields?: ParsedDocumentFields
  ) => Promise<void>;
  onRejectStagingRow: (id?: number) => Promise<void>;
  onAddOneYear?: (target: 'modal' | 'import' | 'staging', currentPeriod: string) => void;
  t: Translations;
}

export const BulkStagingTab: React.FC<BulkStagingTabProps> = ({
  stagingRecords,
  onReloadStaging,
  onApproveCurrentStaging,
  onApproveStagingRow,
  onRejectStagingRow,
  onAddOneYear,
  t,
}) => {
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchCurrentIndex, setBatchCurrentIndex] = useState(0);
  const [batchTotalCount, setBatchTotalCount] = useState(0);
  const [batchCurrentFileName, setBatchCurrentFileName] = useState('');
  const [batchFileProgress, setBatchFileProgress] = useState(0);
  const stopBatchRef = useRef(false);

  const [stagingSortLowestFirst, setStagingSortLowestFirst] = useState(false);
  const [activeStagingId, setActiveStagingId] = useState<number | null>(null);
  const [stagingEditFields, setStagingEditFields] = useState<ParsedDocumentFields>(EMPTY_FORM);
  const [stagingEditCandidates, setStagingEditCandidates] =
    useState<ParsedDocumentCandidates>(EMPTY_CANDIDATES);
  const [stagingEditRawText, setStagingEditRawText] = useState('');

  const sortedStagingRecords = useMemo(() => {
    const copy = [...stagingRecords];
    if (stagingSortLowestFirst) {
      copy.sort((a, b) => a.accuracyScore - b.accuracyScore || (a.id ?? 0) - (b.id ?? 0));
    }
    return copy;
  }, [stagingRecords, stagingSortLowestFirst]);

  const currentStagingRecord: StagingRecord | undefined = useMemo(() => {
    if (sortedStagingRecords.length === 0) return undefined;
    if (activeStagingId !== null) {
      const match = sortedStagingRecords.find((r) => r.id === activeStagingId);
      if (match) return match;
    }
    return sortedStagingRecords[0];
  }, [sortedStagingRecords, activeStagingId]);

  const clampedStagingIndex = useMemo(() => {
    if (!currentStagingRecord) return 0;
    const idx = sortedStagingRecords.findIndex((r) => r.id === currentStagingRecord.id);
    return idx === -1 ? 0 : idx;
  }, [sortedStagingRecords, currentStagingRecord]);

  useEffect(() => {
    if (!currentStagingRecord) {
      setStagingEditFields(EMPTY_FORM);
      setStagingEditCandidates(EMPTY_CANDIDATES);
      setStagingEditRawText('');
      return;
    }
    setStagingEditFields({
      fullName: currentStagingRecord.fullName,
      address: currentStagingRecord.address,
      phone: currentStagingRecord.phone,
      licensePlate: currentStagingRecord.licensePlate,
      carModel: currentStagingRecord.carModel,
      validPeriod: currentStagingRecord.validPeriod,
      personalCode: currentStagingRecord.personalCode,
    });
    setStagingEditCandidates(currentStagingRecord.candidates ?? EMPTY_CANDIDATES);
    setStagingEditRawText(currentStagingRecord.rawText ?? '');
  }, [currentStagingRecord?.id]);

  const advanceStagingIdAfterRemoval = (removedId: number) => {
    const currentIndex = sortedStagingRecords.findIndex((r) => r.id === removedId);
    if (currentIndex !== -1) {
      const nextRecord =
        sortedStagingRecords[currentIndex + 1] || sortedStagingRecords[currentIndex - 1];
      setActiveStagingId(nextRecord?.id ?? null);
    }
  };

  const handleBulkPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (fileList.length === 0) return;

    stopBatchRef.current = false;
    setIsBatchProcessing(true);
    setBatchTotalCount(fileList.length);

    try {
      for (let i = 0; i < fileList.length; i++) {
        if (stopBatchRef.current) break;
        const file = fileList[i];
        setBatchCurrentIndex(i + 1);
        setBatchCurrentFileName(file.name);
        setBatchFileProgress(5);

        try {
          const { text } = await extractTextAndConfidenceFromImageFile(file, (p) =>
            setBatchFileProgress(p)
          );
          const candidates = parseDocumentCandidates(text);
          const parsed = parseDocumentText(text);
          const normalized = normalizeRecordFields(parsed);
          const accuracyScore = calculateAccuracyScore(normalized);
          const now = new Date().toISOString();

          await db.stagingRecords.add({
            imageName: file.name,
            ...normalized,
            accuracyScore,
            rawText: text,
            candidates,
            createdAt: now,
            updatedAt: now,
          });
        } catch {
          const now = new Date().toISOString();
          await db.stagingRecords.add({
            imageName: file.name,
            ...EMPTY_FORM,
            accuracyScore: 0,
            rawText: '',
            candidates: EMPTY_CANDIDATES,
            createdAt: now,
            updatedAt: now,
          });
        }

        await onReloadStaging();
      }
    } finally {
      try {
        await terminateWarmWorker();
      } catch {
        // Ignore worker termination errors during cleanup
      }
      setIsBatchProcessing(false);
      setBatchCurrentIndex(0);
      setBatchTotalCount(0);
      setBatchCurrentFileName('');
      setBatchFileProgress(0);
      stopBatchRef.current = false;
    }
  };

  const handleStagingFieldsChange: React.Dispatch<React.SetStateAction<ParsedDocumentFields>> = (
    updater
  ) => {
    setStagingEditFields((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (currentStagingRecord?.id !== undefined) {
        const normalized = normalizeRecordFields(next);
        const nextScore = calculateAccuracyScore(normalized);
        const now = new Date().toISOString();
        void db.stagingRecords
          .update(currentStagingRecord.id, {
            ...next,
            accuracyScore: nextScore,
            updatedAt: now,
          })
          .then(() => onReloadStaging());
      }
      return next;
    });
  };

  const handleStagingRawTextChange = (text: string) => {
    setStagingEditRawText(text);
    const candidates = parseDocumentCandidates(text);
    const parsed = parseDocumentText(text);
    setStagingEditCandidates(candidates);
    setStagingEditFields(parsed);
    if (currentStagingRecord?.id !== undefined) {
      const normalized = normalizeRecordFields(parsed);
      const nextScore = calculateAccuracyScore(normalized);
      const now = new Date().toISOString();
      void db.stagingRecords
        .update(currentStagingRecord.id, {
          ...parsed,
          rawText: text,
          candidates,
          accuracyScore: nextScore,
          updatedAt: now,
        })
        .then(() => onReloadStaging());
    }
  };

  const liveStagingScore = calculateAccuracyScore(normalizeRecordFields(stagingEditFields));

  return (
    <div className="space-y-4">
      {/* A. Multi-File Upload & Batch Progress Header */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xs space-y-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{t.labels.bulkTitle}</h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              {t.labels.bulkSubtitle}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-semibold">
            <Layers className="w-3.5 h-3.5" />
            <span>
              {t.labels.pendingVerificationCount.replace(
                '{count}',
                String(stagingRecords.length)
              )}
            </span>
          </span>
        </div>

        {/* Strict Privacy Banner */}
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>{t.labels.privacyBadge}</span>
        </div>

        {/* Multi-File Dropzone */}
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-xl p-5 cursor-pointer hover:border-indigo-500/60 transition-colors bg-slate-50/60 dark:bg-zinc-950/40 text-center">
          <Upload className="w-6 h-6 text-indigo-500 mb-1.5" />
          <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200">
            {t.actions.selectMultiplePhotos}
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            data-testid="bulk-file-input"
            onChange={handleBulkPhotoUpload}
            className="hidden"
          />
        </label>

        {/* Sequential Batch Progress Bar */}
        {isBatchProcessing && (
          <div
            data-testid="batch-progress-banner"
            className="rounded-xl border border-indigo-500/30 bg-indigo-50/5 p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300">
              <span className="truncate">
                {t.labels.processingBatchItem
                  .replace('{current}', String(batchCurrentIndex))
                  .replace('{total}', String(batchTotalCount))
                  .replace('{fileName}', batchCurrentFileName)}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono">{batchFileProgress}%</span>
                <button
                  type="button"
                  onClick={() => {
                    stopBatchRef.current = true;
                  }}
                  className="touch-press inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/15 text-red-700 dark:text-red-300 text-[11px] font-semibold"
                >
                  <Square className="w-3 h-3" />
                  <span>{t.actions.stopBatch}</span>
                </button>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-200"
                style={{ width: `${batchFileProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {sortedStagingRecords.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
          <Layers className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold">{t.labels.noStagingTitle}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            {t.labels.noStagingDesc}
          </p>
        </div>
      ) : (
        <>
          {/* B. Mode 1: Step-by-Step "One-by-One" Verification Wizard */}
          {currentStagingRecord && (
            <div
              data-testid="one-by-one-wizard"
              className="rounded-2xl border border-indigo-500/30 bg-white dark:bg-zinc-900 p-4 shadow-sm space-y-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    {t.labels.verifyOneByOneTitle
                      .replace('{current}', String(clampedStagingIndex + 1))
                      .replace('{total}', String(sortedStagingRecords.length))}
                  </span>
                </div>

                {/* 1. Prominent Image Filename Banner + Live Accuracy Badge */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    data-testid="wizard-image-name"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 font-mono text-xs font-bold text-slate-800 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700"
                  >
                    <FileImage className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span>{currentStagingRecord.imageName}</span>
                  </span>

                  <span
                    data-testid="staging-wizard-accuracy-badge"
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-xs font-semibold ${getAccuracyBadgeClasses(
                      liveStagingScore
                    )}`}
                  >
                    <span>{t.columns.accuracyScore}:</span>
                    <span>{liveStagingScore}%</span>
                  </span>
                </div>
              </div>

              {/* 2. Interactive Field Editor with Multi-Candidate Chips */}
              <RecordFieldsEditor
                values={stagingEditFields}
                onChange={handleStagingFieldsChange}
                target="staging"
                idPrefix="staging"
                candidates={stagingEditCandidates}
                onAddOneYear={onAddOneYear}
                t={t}
              />

              {/* Collapsible Raw OCR Text Drawer */}
              <details className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/50 p-2.5">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-zinc-400 select-none">
                  {t.labels.ocrRawText}
                </summary>
                <div className="mt-2 space-y-1.5">
                  <textarea
                    rows={3}
                    aria-label={t.labels.ocrRawText}
                    value={stagingEditRawText}
                    onChange={(e) => handleStagingRawTextChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </details>

              {/* 3. One-Tap Verification Controls (Thumb-Friendly) */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={clampedStagingIndex <= 0}
                    onClick={() => {
                      const prevItem = sortedStagingRecords[clampedStagingIndex - 1];
                      if (prevItem?.id !== undefined) setActiveStagingId(prevItem.id);
                    }}
                    aria-label="Previous staged item"
                    className="touch-press p-2 rounded-xl border border-slate-200 dark:border-zinc-800 disabled:opacity-40 text-xs font-semibold"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={clampedStagingIndex >= sortedStagingRecords.length - 1}
                    onClick={() => {
                      const nextItem = sortedStagingRecords[clampedStagingIndex + 1];
                      if (nextItem?.id !== undefined) setActiveStagingId(nextItem.id);
                    }}
                    className="touch-press inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 disabled:opacity-40 text-xs font-semibold"
                  >
                    <span>{t.actions.skip}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      if (currentStagingRecord?.id !== undefined) {
                        advanceStagingIdAfterRemoval(currentStagingRecord.id);
                        await onRejectStagingRow(currentStagingRecord.id);
                      }
                    }}
                    className="touch-press inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{t.actions.rejectDelete}</span>
                  </button>

                  <button
                    type="button"
                    data-testid="approve-and-next-btn"
                    onClick={async () => {
                      if (currentStagingRecord?.id !== undefined) {
                        advanceStagingIdAfterRemoval(currentStagingRecord.id);
                        await onApproveCurrentStaging(currentStagingRecord, stagingEditFields);
                      }
                    }}
                    className="touch-press inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{t.actions.approveAndNext}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* C. Mode 2: Staging Table Overview (Laikina patikros lentelė) */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-zinc-400">
                {t.labels.stagingTableTitle} (
                {t.labels.pendingVerificationCount.replace(
                  '{count}',
                  String(sortedStagingRecords.length)
                )}
                )
              </h3>

              <button
                type="button"
                onClick={() => {
                  setStagingSortLowestFirst((prev) => !prev);
                  setActiveStagingId(null);
                }}
                className="touch-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[11px] font-semibold text-slate-700 dark:text-zinc-300"
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500" />
                <span>
                  {stagingSortLowestFirst
                    ? t.actions.sortLowestAccuracy
                    : t.actions.sortInsertionOrder}
                </span>
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table
                  data-testid="staging-queue-table"
                  className="w-full text-left border-collapse text-xs"
                >
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950/60 text-[11px] font-semibold text-slate-600 dark:text-zinc-400 whitespace-nowrap">
                      <th className="py-2.5 px-2.5 w-12 text-center">
                        {t.columns.rowNumber}
                      </th>
                      <th className="py-2.5 px-3">{t.columns.imageName}</th>
                      <th className="py-2.5 px-3 text-center">
                        {t.columns.accuracyScore}
                      </th>
                      <th className="py-2.5 px-3">{t.columns.fullName}</th>
                      <th className="py-2.5 px-3">{t.columns.address}</th>
                      <th className="py-2.5 px-3">{t.columns.phone}</th>
                      <th className="py-2.5 px-3">{t.columns.licensePlate}</th>
                      <th className="py-2.5 px-3">{t.columns.carModel}</th>
                      <th className="py-2.5 px-3">{t.columns.validPeriod}</th>
                      <th className="py-2.5 px-3">{t.columns.personalCode}</th>
                      <th className="py-2.5 px-2.5 text-right">{t.columns.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/70">
                    {sortedStagingRecords.map((item, idx) => {
                      const isSelected = currentStagingRecord?.id === item.id;
                      return (
                        <tr
                          key={item.id ?? idx}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-indigo-500/5 dark:bg-indigo-500/10'
                              : 'hover:bg-slate-50/80 dark:hover:bg-zinc-800/40'
                          }`}
                        >
                          <td className="py-2.5 px-2.5 text-center font-mono font-semibold text-slate-500 dark:text-zinc-400">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 font-mono font-bold text-[11px]">
                              <FileImage className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span>{item.imageName}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span
                              data-testid={`staging-accuracy-badge-${idx + 1}`}
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold ${getAccuracyBadgeClasses(
                                item.accuracyScore
                              )}`}
                            >
                              {item.accuracyScore}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                            {item.fullName || '—'}
                          </td>
                          <td
                            className="py-2.5 px-3 max-w-[180px] truncate"
                            title={item.address}
                          >
                            {item.address || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                            {item.phone || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                            {item.licensePlate || '—'}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {item.carModel || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                            {item.validPeriod || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                            {item.personalCode || '—'}
                          </td>
                          <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.id !== undefined) setActiveStagingId(item.id);
                                }}
                                className="touch-press px-2 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 text-[11px] font-semibold hover:bg-slate-100 dark:hover:bg-zinc-800"
                              >
                                {t.actions.verifyItem}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (item.id !== undefined) {
                                    advanceStagingIdAfterRemoval(item.id);
                                    await onApproveStagingRow(
                                      item,
                                      currentStagingRecord?.id === item.id
                                        ? stagingEditFields
                                        : undefined
                                    );
                                  }
                                }}
                                aria-label={`${t.actions.approve} ${item.imageName}`}
                                className="touch-press px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold"
                              >
                                {t.actions.approve}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (item.id !== undefined) {
                                    advanceStagingIdAfterRemoval(item.id);
                                    await onRejectStagingRow(item.id);
                                  }
                                }}
                                aria-label={`${t.actions.delete} ${item.imageName}`}
                                className="touch-press p-1.5 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400"
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
          </div>
        </>
      )}
    </div>
  );
};

export default BulkStagingTab;

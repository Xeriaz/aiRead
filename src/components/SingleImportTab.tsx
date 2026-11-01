import React, { useState } from 'react';
import { AlertCircle, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { Translations } from '../i18n/translations';
import { extractTextAndConfidenceFromImageFile } from '../utils/ocr';
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

export interface SingleImportTabProps {
  onSaveRecord: (
    fields: ParsedDocumentFields,
    confidence?: number,
    imageName?: string
  ) => Promise<void>;
  onAddOneYear?: (target: 'modal' | 'import' | 'staging', currentPeriod: string) => void;
  t: Translations;
}

export const SingleImportTab: React.FC<SingleImportTabProps> = ({
  onSaveRecord,
  onAddOneYear,
  t,
}) => {
  const [rawOcrText, setRawOcrText] = useState('');
  const [importFields, setImportFields] = useState<ParsedDocumentFields>(EMPTY_FORM);
  const [importCandidates, setImportCandidates] =
    useState<ParsedDocumentCandidates>(EMPTY_CANDIDATES);
  const [importOcrConfidence, setImportOcrConfidence] = useState<number | undefined>(undefined);
  const [ocrErrorMessage, setOcrErrorMessage] = useState<string | null>(null);
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [lastScannedFileName, setLastScannedFileName] = useState('');

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLastScannedFileName(file.name);
    setOcrErrorMessage(null);
    setIsProcessingOcr(true);
    setOcrProgress(5);

    try {
      const { text, confidence } = await extractTextAndConfidenceFromImageFile(file, (p) =>
        setOcrProgress(p)
      );
      setRawOcrText(text);
      setImportOcrConfidence(confidence);
      const candidates = parseDocumentCandidates(text);
      setImportCandidates(candidates);
      const parsed = parseDocumentText(text);
      setImportFields(parsed);
    } catch {
      setOcrErrorMessage(t.labels.ocrErrorNotice);
    } finally {
      setIsProcessingOcr(false);
      setOcrProgress(0);
    }
  };

  const handleRawTextChange = (text: string) => {
    setRawOcrText(text);
    setImportOcrConfidence(undefined);
    const candidates = parseDocumentCandidates(text);
    setImportCandidates(candidates);
    const parsed = parseDocumentText(text);
    setImportFields(parsed);
  };

  const setImportFieldsFromRaw = () => {
    const candidates = parseDocumentCandidates(rawOcrText);
    setImportCandidates(candidates);
    const parsed = parseDocumentText(rawOcrText);
    setImportFields(parsed);
  };

  const handleSaveImportedRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRecordFields(importFields);
    const hasAnyValue = Object.values(normalized).some((v) => v.length > 0);
    if (!hasAnyValue) return;

    await onSaveRecord(normalized, importOcrConfidence, lastScannedFileName || undefined);

    setRawOcrText('');
    setImportFields(EMPTY_FORM);
    setImportCandidates(EMPTY_CANDIDATES);
    setImportOcrConfidence(undefined);
    setOcrErrorMessage(null);
    setLastScannedFileName('');
  };

  const liveImportScore = calculateAccuracyScore(
    normalizeRecordFields(importFields),
    importOcrConfidence
  );

  return (
    <div className="space-y-3.5 max-w-5xl mx-auto">
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 shadow-2xs space-y-4">
        <div>
          <h2 className="text-sm font-semibold">{t.labels.importTitle}</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            {t.labels.importSubtitle}
          </p>
        </div>

        {/* Dismissible OCR Error Banner */}
        {ocrErrorMessage && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{ocrErrorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setOcrErrorMessage(null)}
              aria-label="Dismiss error"
              className="p-1 text-rose-500 hover:text-rose-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Strict Privacy Banner: Zero photo saving */}
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500" />
          <span>{t.labels.privacyBadge}</span>
        </div>

        {/* Responsive Grid: side-by-side on desktop (>=lg) or stacked on phone */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1">
          {/* Left Column: Dropzone & Raw Text OCR */}
          <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Camera / Photo Upload Dropzone with Social-Style Center + Button */}
              <label
                data-testid="single-image-import-dropzone"
                className="group flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 cursor-pointer hover:border-indigo-500/70 transition-all bg-slate-50/60 dark:bg-zinc-950/40 text-center"
              >
                <div
                  data-testid="single-image-plus-icon"
                  className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform"
                >
                  <Plus className="w-7 h-7 stroke-[2.75]" />
                </div>
                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-200">
                  {t.labels.uploadOrTakePhoto}
                </span>
                {lastScannedFileName && !isProcessingOcr && (
                  <span className="text-[11px] text-indigo-500 mt-1 truncate max-w-xs">
                    {lastScannedFileName}
                  </span>
                )}
                <input
                  type="file"
                  accept="image/*,application/pdf,.pdf"
                  data-testid="single-image-file-input"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>

              {isProcessingOcr && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    <span>{t.labels.processingOcr}</span>
                    <span>{ocrProgress}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-200"
                      style={{ width: `${ocrProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Raw OCR / Paste Text Box */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="ocr-raw-text"
                    className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
                  >
                    {t.labels.ocrRawText}
                  </label>
                  <button
                    type="button"
                    onClick={setImportFieldsFromRaw}
                    className="touch-press inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{t.actions.parseText}</span>
                  </button>
                </div>
                <textarea
                  id="ocr-raw-text"
                  rows={5}
                  value={rawOcrText}
                  onChange={(e) => handleRawTextChange(e.target.value)}
                  placeholder={t.placeholders.rawText}
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Right Column: Extracted & Editable Fields Form */}
          <div className="lg:col-span-7 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-zinc-800 pt-4 lg:pt-0 lg:pl-6">
            <form
              onSubmit={handleSaveImportedRecord}
              className="space-y-3.5"
            >
              <div className="flex items-center justify-between gap-2 pb-1">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  {t.labels.verifiedFields}
                </h3>
                <span
                  data-testid="import-accuracy-badge"
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[11px] font-semibold ${getAccuracyBadgeClasses(
                    liveImportScore
                  )}`}
                >
                  <span>{t.columns.accuracyScore}:</span>
                  <span>{liveImportScore}%</span>
                </span>
              </div>

              <RecordFieldsEditor
                values={importFields}
                onChange={setImportFields}
                target="import"
                idPrefix="import"
                candidates={importCandidates}
                onAddOneYear={onAddOneYear}
                t={t}
              />

              <div className="pt-2">
                <button
                  type="submit"
                  className="touch-press w-full py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.actions.save}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SingleImportTab;

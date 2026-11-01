import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileCheck,
  FolderUp,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { db, type TableRecord } from '../db/db';
import type { Translations } from '../i18n/translations';
import {
  decryptRecords,
  exportEncryptedBackupToFile,
  inspectBackupContent,
  sanitizeRecordForBackup,
  type BackupInspectionResult,
} from '../utils/crypto';

export interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'export' | 'import';
  records: TableRecord[];
  onRecordsImported: () => Promise<void>;
  t: Translations;
}

export const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'export',
  records,
  onRecordsImported,
  t,
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(initialMode);

  // Export State
  const [exportPassword, setExportPassword] = useState('');
  const [exportConfirmPassword, setExportConfirmPassword] = useState('');
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [fileRawContent, setFileRawContent] = useState('');
  const [inspection, setInspection] = useState<BackupInspectionResult | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decryptedRecords, setDecryptedRecords] = useState<Omit<TableRecord, 'id'>[] | null>(null);
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const [importSuccessCount, setImportSuccessCount] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialMode);
      setExportError(null);
      setExportSuccess(false);
      setExportPassword('');
      setExportConfirmPassword('');
      setSelectedFileName('');
      setFileRawContent('');
      setInspection(null);
      setImportPassword('');
      setDecryptError(null);
      setDecryptedRecords(null);
      setImportSuccessCount(null);
    }
  }, [isOpen, initialMode]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleExportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setExportError(null);
    setExportSuccess(false);

    if (exportPassword.length < 8) {
      setExportError(t.labels.backupPasswordMinLength);
      return;
    }
    if (exportPassword !== exportConfirmPassword) {
      setExportError(t.labels.backupPasswordMismatch);
      return;
    }

    try {
      setIsExporting(true);
      await exportEncryptedBackupToFile(records, exportPassword);
      setExportSuccess(true);
      setExportPassword('');
      setExportConfirmPassword('');
    } catch (err) {
      setExportError((err as Error).message || 'Failed to export encrypted backup');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSelectedFileName(file.name);
    setDecryptError(null);
    setDecryptedRecords(null);
    setImportSuccessCount(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setFileRawContent(text);
      const res = inspectBackupContent(text);
      setInspection(res);

      // If unencrypted plain JSON array, load directly
      if (!res.isEncrypted && res.isValid) {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            setDecryptedRecords(parsed.map(sanitizeRecordForBackup));
          }
        } catch {
          setDecryptError(t.labels.backupInvalidFile);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleDecryptFile = async (e: React.FormEvent) => {
    e.preventDefault();
    setDecryptError(null);
    if (!fileRawContent) return;

    if (!importPassword) {
      setDecryptError(t.labels.backupPasswordMinLength);
      return;
    }

    try {
      setIsDecrypting(true);
      const parsed = JSON.parse(fileRawContent);
      const result = await decryptRecords(parsed, importPassword);
      setDecryptedRecords(result.records);
    } catch {
      setDecryptError(t.labels.backupWrongPassword);
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleCommitImport = async (mode: 'merge' | 'replace') => {
    if (!decryptedRecords || decryptedRecords.length === 0) return;

    try {
      setIsSavingToDb(true);
      const now = new Date().toISOString();
      const recordsToInsert = decryptedRecords.map((r) => ({
        ...r,
        updatedAt: now,
      }));

      await db.transaction('rw', db.records, async () => {
        if (mode === 'replace') {
          await db.records.clear();
        }
        await db.records.bulkAdd(recordsToInsert as TableRecord[]);
      });

      await onRecordsImported();
      setImportSuccessCount(recordsToInsert.length);
      setDecryptedRecords(null);
      setFileRawContent('');
      setSelectedFileName('');
      setInspection(null);
      setImportPassword('');
    } catch (err) {
      setDecryptError((err as Error).message || 'Database import failed');
    } finally {
      setIsSavingToDb(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xl overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 id="backup-modal-title" className="text-sm font-bold tracking-tight">
                {t.labels.backupModalTitle}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {t.labels.backupEncryptionNotice}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="touch-press p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="p-3 bg-slate-50/80 dark:bg-zinc-950/60 border-b border-slate-100 dark:border-zinc-800 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'export'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-zinc-700'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-zinc-800/60'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t.labels.backupExportTab}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'import'
                ? 'bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-zinc-700'
                : 'text-slate-600 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-zinc-800/60'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{t.labels.backupImportTab}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Phone-to-PC Workflow Tip */}
          <div className="p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 flex items-start gap-2.5">
            <ArrowRightLeft className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-indigo-900 dark:text-indigo-200">
              {t.labels.backupPhoneToPcNotice}
            </p>
          </div>

          {activeTab === 'export' ? (
            /* EXPORT FORM */
            <form onSubmit={handleExportSubmit} className="space-y-4">
              <p className="text-slate-600 dark:text-zinc-300 leading-relaxed">
                {t.labels.backupExportDesc}
              </p>

              <div className="p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950/50 flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-zinc-300">
                  {t.labels.recordsCount}:
                </span>
                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                  {records.length}
                </span>
              </div>

              {exportError && (
                <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{exportError}</span>
                </div>
              )}

              {exportSuccess && (
                <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{t.actions.exportProtected} - OK</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    {t.labels.backupPassword}
                  </label>
                  <div className="relative">
                    <input
                      type={showExportPassword ? 'text' : 'password'}
                      value={exportPassword}
                      onChange={(e) => setExportPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 pr-9 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowExportPassword((p) => !p)}
                      aria-label="Toggle password visibility"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                    >
                      {showExportPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    {t.labels.backupPasswordConfirm}
                  </label>
                  <input
                    type={showExportPassword ? 'text' : 'password'}
                    value={exportConfirmPassword}
                    onChange={(e) => setExportConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isExporting || records.length === 0}
                className="touch-press w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Apdorojama...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>{t.labels.backupExportAction}</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* IMPORT FORM */
            <div className="space-y-4">
              <p className="text-slate-600 dark:text-zinc-300 leading-relaxed">
                {t.labels.backupImportDesc}
              </p>

              {/* File Dropzone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl p-5 text-center cursor-pointer hover:border-indigo-500 transition-colors bg-slate-50/50 dark:bg-zinc-950/30"
              >
                <FolderUp className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
                <span className="font-semibold text-slate-700 dark:text-zinc-200 block">
                  {selectedFileName ? selectedFileName : t.labels.backupSelectFile}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400 block mt-0.5">
                  {t.labels.backupDropNotice}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".airead,.json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {decryptError && (
                <div className="p-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{decryptError}</span>
                </div>
              )}

              {importSuccessCount !== null && (
                <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    {t.labels.backupSuccessImport.replace('{count}', String(importSuccessCount))}
                  </span>
                </div>
              )}

              {/* Password Prompt if Encrypted and not yet decrypted */}
              {inspection?.isEncrypted && !decryptedRecords && (
                <form onSubmit={handleDecryptFile} className="space-y-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold">
                    <KeyRound className="w-4 h-4" />
                    <span>{t.labels.backupPassword}</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showImportPassword ? 'text' : 'password'}
                      value={importPassword}
                      onChange={(e) => setImportPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 pr-9 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowImportPassword((p) => !p)}
                      aria-label="Toggle password visibility"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                    >
                      {showImportPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isDecrypting || !importPassword}
                    className="touch-press w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    {isDecrypting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Tikrinama...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-4 h-4" />
                        <span>{t.labels.backupDecryptAction}</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Ready to Import Actions */}
              {decryptedRecords && (
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-zinc-800">
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-semibold text-emerald-800 dark:text-emerald-200">
                        {t.labels.recordsCount}: {decryptedRecords.length}
                      </span>
                    </div>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      SHA-256 ✓ OK
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={isSavingToDb}
                      onClick={() => handleCommitImport('merge')}
                      className="touch-press py-2.5 px-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      <span>{t.labels.backupMergeAction}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSavingToDb}
                      onClick={() => {
                        if (window.confirm(t.labels.confirmDeleteAll)) {
                          void handleCommitImport('replace');
                        }
                      }}
                      className="touch-press py-2.5 px-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/30 hover:bg-red-100 text-red-600 dark:text-red-400 font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>{t.labels.backupReplaceAction}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BackupModal;

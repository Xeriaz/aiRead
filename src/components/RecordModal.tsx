import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import type { Translations } from '../i18n/translations';
import { calculateAccuracyScore, type ParsedDocumentFields } from '../utils/parser';
import {
  getAccuracyBadgeClasses,
  normalizeRecordFields,
  RecordFieldsEditor,
} from './RecordFieldsEditor';

export interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingId: number | null;
  formFields: ParsedDocumentFields;
  setFormFields: React.Dispatch<React.SetStateAction<ParsedDocumentFields>>;
  onSave: (e: React.FormEvent) => void;
  onAddOneYear?: (target: 'modal' | 'import' | 'staging', currentPeriod: string) => void;
  t: Translations;
}

export const RecordModal: React.FC<RecordModalProps> = ({
  isOpen,
  onClose,
  editingId,
  formFields,
  setFormFields,
  onSave,
  onAddOneYear,
  t,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const liveModalScore = calculateAccuracyScore(normalizeRecordFields(formFields));

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editingId !== null ? t.labels.editRecordTitle : t.labels.newRecordTitle}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 pb-safe shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">
              {editingId !== null ? t.labels.editRecordTitle : t.labels.newRecordTitle}
            </h2>
            <span
              data-testid="modal-accuracy-badge"
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold ${getAccuracyBadgeClasses(
                liveModalScore
              )}`}
            >
              <span>{t.columns.accuracyScore}:</span>
              <span>{liveModalScore}%</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.actions.cancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSave} className="space-y-3">
          <RecordFieldsEditor
            values={formFields}
            onChange={setFormFields}
            target="modal"
            idPrefix="modal"
            onAddOneYear={onAddOneYear}
            t={t}
          />

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              className="touch-press flex-1 py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs shadow-xs"
            >
              {editingId !== null ? t.actions.update : t.actions.save}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="touch-press py-2.5 px-4 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-medium"
            >
              {t.actions.cancel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RecordModal;

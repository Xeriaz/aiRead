import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { translations, type Translations } from '../i18n/translations';
import {
  addOneYearToDate,
  formatPhoneNumber,
  formatValidPeriod,
  splitValidPeriod,
  type ParsedDocumentCandidates,
  type ParsedDocumentFields,
} from '../utils/parser';

export const EMPTY_FORM: ParsedDocumentFields = {
  fullName: '',
  address: '',
  phone: '',
  licensePlate: '',
  carModel: '',
  validPeriod: '',
  personalCode: '',
};

export const EMPTY_CANDIDATES: ParsedDocumentCandidates = {
  fullName: [],
  address: [],
  phone: [],
  licensePlate: [],
  carModel: [],
  validPeriod: [],
  personalCode: [],
};

export const FORM_FIELD_KEYS: Array<keyof ParsedDocumentFields> = [
  'fullName',
  'personalCode',
  'phone',
  'address',
  'licensePlate',
  'carModel',
  'validPeriod',
];

export function normalizeRecordFields(fields: ParsedDocumentFields): ParsedDocumentFields {
  return {
    fullName: fields.fullName.trim(),
    address: fields.address.trim(),
    phone: formatPhoneNumber(fields.phone),
    licensePlate: fields.licensePlate.trim().toUpperCase(),
    carModel: fields.carModel.trim().toUpperCase(),
    validPeriod: formatValidPeriod(fields.validPeriod),
    personalCode: fields.personalCode.trim(),
  };
}

export function getValidityStatus(validPeriod: string): 'active' | 'expiring' | 'expired' | 'none' {
  const [, end] = splitValidPeriod(validPeriod);
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return 'none';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(endDate.getTime())) return 'none';
  const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring';
  return 'active';
}

export function getAccuracyBadgeClasses(score: number): string {
  if (score >= 80) {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30';
  }
  if (score >= 50) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30';
  }
  return 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30';
}

export interface CandidateChipsProps {
  fieldKey: keyof ParsedDocumentFields;
  currentValue: string;
  candidates?: ParsedDocumentCandidates;
  onSelect: (val: string) => void;
}

export const CandidateChips: React.FC<CandidateChipsProps> = ({
  fieldKey,
  currentValue,
  candidates,
  onSelect,
}) => {
  if (!candidates) return null;
  const fieldCandidates = candidates[fieldKey] || [];
  const alternatives = fieldCandidates.filter(
    (c) => c.trim().toLowerCase() !== currentValue.trim().toLowerCase()
  );
  if (alternatives.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 mt-1.5"
      data-testid={`candidates-${fieldKey}`}
    >
      {alternatives.map((candidate) => (
        <button
          key={candidate}
          type="button"
          onClick={() => onSelect(candidate)}
          className="touch-press inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25 transition-colors"
        >
          <span>{candidate}</span>
        </button>
      ))}
    </div>
  );
};

export const renderCandidateChips = (
  fieldKey: keyof ParsedDocumentFields,
  currentValue: string,
  candidates: ParsedDocumentCandidates | undefined,
  onSelect: (val: string) => void
) => (
  <CandidateChips
    fieldKey={fieldKey}
    currentValue={currentValue}
    candidates={candidates}
    onSelect={onSelect}
  />
);

export interface RecordFieldsEditorProps {
  values: ParsedDocumentFields;
  onChange: React.Dispatch<React.SetStateAction<ParsedDocumentFields>>;
  target: 'modal' | 'import' | 'staging';
  idPrefix: string;
  candidates?: ParsedDocumentCandidates;
  onAddOneYear?: (target: 'modal' | 'import' | 'staging', currentPeriod: string) => void;
  t?: Translations;
}

export const RecordFieldsEditor: React.FC<RecordFieldsEditorProps> = ({
  values,
  onChange,
  target,
  idPrefix,
  candidates,
  onAddOneYear,
  t,
}) => {
  const activeT = t || translations.lt;
  const [startDate, endDate] = splitValidPeriod(values.validPeriod);

  const updateDatePart = (part: 'start' | 'end', newIso: string) => {
    const nextStart = part === 'start' ? newIso : startDate;
    const nextEnd =
      part === 'end'
        ? newIso
        : endDate || (newIso ? addOneYearToDate(newIso) : '');
    const combined = [nextStart, nextEnd].filter(Boolean).join(' ');
    onChange((prev) => ({ ...prev, validPeriod: combined }));
  };

  const handleAddYear = () => {
    if (onAddOneYear) {
      onAddOneYear(target, values.validPeriod);
    } else {
      const [start] = splitValidPeriod(values.validPeriod);
      const baseStart =
        start && /^\d{4}-\d{2}-\d{2}$/.test(start)
          ? start
          : new Date().toISOString().slice(0, 10);
      const nextYear = addOneYearToDate(baseStart);
      const updated = `${baseStart} ${nextYear}`;
      onChange((prev) => ({ ...prev, validPeriod: updated }));
    }
  };

  const emptyFieldKeys = FORM_FIELD_KEYS.filter((k) => values[k].trim().length === 0);

  const getInputBorderClasses = (val: string) =>
    val.trim().length === 0
      ? 'border-rose-400/80 dark:border-rose-500/60 bg-rose-50/40 dark:bg-rose-950/20 focus:ring-rose-500'
      : 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 focus:ring-indigo-500';

  const renderFieldStatusBadge = (fieldKey: keyof ParsedDocumentFields, val: string) =>
    val.trim().length === 0 ? (
      <span
        data-testid={`${idPrefix}-empty-badge-${fieldKey}`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
        <span>{activeT.labels.emptyFieldBadge}</span>
      </span>
    ) : (
      <CheckCircle2
        aria-hidden="true"
        className="w-3.5 h-3.5 text-emerald-500 shrink-0"
      />
    );

  return (
    <div className="space-y-3">
      {/* Interactive Empty Columns Notice Banner */}
      {emptyFieldKeys.length > 0 ? (
        <div
          data-testid={`${idPrefix}-empty-columns-notice`}
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 space-y-1.5"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>
              {activeT.labels.emptyFieldsSummary.replace('{count}', String(emptyFieldKeys.length))}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {emptyFieldKeys.map((key) => (
              <button
                key={key}
                type="button"
                data-testid={`${idPrefix}-jump-empty-${key}`}
                onClick={() => {
                  const el = document.getElementById(`${idPrefix}-${key}`);
                  el?.focus();
                }}
                className="touch-press inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-white/90 dark:bg-zinc-900/90 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 transition-colors"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <span>{activeT.columns[key]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div
          data-testid={`${idPrefix}-all-columns-filled`}
          className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>{activeT.labels.allFieldsFilled}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Vardas Pavardė */}
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <label
              htmlFor={`${idPrefix}-fullName`}
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              {activeT.columns.fullName}
            </label>
            {renderFieldStatusBadge('fullName', values.fullName)}
          </div>
          <input
            id={`${idPrefix}-fullName`}
            type="text"
            value={values.fullName}
            onChange={(e) => onChange((prev) => ({ ...prev, fullName: e.target.value }))}
            placeholder={activeT.placeholders.fullName}
            className={`w-full rounded-xl border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
              values.fullName
            )}`}
          />
          <CandidateChips
            fieldKey="fullName"
            currentValue={values.fullName}
            candidates={candidates}
            onSelect={(val) => onChange((prev) => ({ ...prev, fullName: val }))}
          />
        </div>

        {/* Asmens kodas */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label
              htmlFor={`${idPrefix}-personalCode`}
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              {activeT.columns.personalCode}
            </label>
            {renderFieldStatusBadge('personalCode', values.personalCode)}
          </div>
          <input
            id={`${idPrefix}-personalCode`}
            type="text"
            inputMode="numeric"
            maxLength={11}
            value={values.personalCode}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                personalCode: e.target.value.replace(/\D/g, '').slice(0, 11),
              }))
            }
            placeholder={activeT.placeholders.personalCode}
            className={`w-full rounded-xl border px-3 py-2 text-sm font-mono transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
              values.personalCode
            )}`}
          />
          <CandidateChips
            fieldKey="personalCode"
            currentValue={values.personalCode}
            candidates={candidates}
            onSelect={(val) => onChange((prev) => ({ ...prev, personalCode: val }))}
          />
        </div>

        {/* Telefonas */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label
              htmlFor={`${idPrefix}-phone`}
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              {activeT.columns.phone}{' '}
              <span className="text-[11px] text-slate-400">(0-6XX-XXXXX)</span>
            </label>
            {renderFieldStatusBadge('phone', values.phone)}
          </div>
          <input
            id={`${idPrefix}-phone`}
            type="tel"
            value={values.phone}
            onChange={(e) => onChange((prev) => ({ ...prev, phone: e.target.value }))}
            onBlur={(e) =>
              onChange((prev) => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))
            }
            placeholder={activeT.placeholders.phone}
            className={`w-full rounded-xl border px-3 py-2 text-sm font-mono transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
              values.phone
            )}`}
          />
          <CandidateChips
            fieldKey="phone"
            currentValue={values.phone}
            candidates={candidates}
            onSelect={(val) => onChange((prev) => ({ ...prev, phone: formatPhoneNumber(val) }))}
          />
        </div>

        {/* Adresas */}
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between gap-2 mb-1">
            <label
              htmlFor={`${idPrefix}-address`}
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              {activeT.columns.address}
            </label>
            {renderFieldStatusBadge('address', values.address)}
          </div>
          <input
            id={`${idPrefix}-address`}
            type="text"
            value={values.address}
            onChange={(e) => onChange((prev) => ({ ...prev, address: e.target.value }))}
            placeholder={activeT.placeholders.address}
            className={`w-full rounded-xl border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
              values.address
            )}`}
          />
          <CandidateChips
            fieldKey="address"
            currentValue={values.address}
            candidates={candidates}
            onSelect={(val) => onChange((prev) => ({ ...prev, address: val }))}
          />
        </div>

        {/* Valst. Nr. */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label
              htmlFor={`${idPrefix}-licensePlate`}
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              {activeT.columns.licensePlate}
            </label>
            {renderFieldStatusBadge('licensePlate', values.licensePlate)}
          </div>
          <input
            id={`${idPrefix}-licensePlate`}
            type="text"
            value={values.licensePlate}
            onChange={(e) =>
              onChange((prev) => ({ ...prev, licensePlate: e.target.value.toUpperCase() }))
            }
            placeholder={activeT.placeholders.licensePlate}
            className={`w-full rounded-xl border px-3 py-2 text-sm font-mono uppercase transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
              values.licensePlate
            )}`}
          />
          <CandidateChips
            fieldKey="licensePlate"
            currentValue={values.licensePlate}
            candidates={candidates}
            onSelect={(val) => onChange((prev) => ({ ...prev, licensePlate: val.toUpperCase() }))}
          />
        </div>

        {/* Modelis */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <label
              htmlFor={`${idPrefix}-carModel`}
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              {activeT.columns.carModel}
            </label>
            {renderFieldStatusBadge('carModel', values.carModel)}
          </div>
          <input
            id={`${idPrefix}-carModel`}
            type="text"
            value={values.carModel}
            onChange={(e) =>
              onChange((prev) => ({ ...prev, carModel: e.target.value.toUpperCase() }))
            }
            placeholder={activeT.placeholders.carModel}
            className={`w-full rounded-xl border px-3 py-2 text-sm uppercase transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
              values.carModel
            )}`}
          />
          <CandidateChips
            fieldKey="carModel"
            currentValue={values.carModel}
            candidates={candidates}
            onSelect={(val) => onChange((prev) => ({ ...prev, carModel: val.toUpperCase() }))}
          />
        </div>

        {/* Galiojimas (YYYY-MM-DD YYYY-MM-DD) */}
        <div className="sm:col-span-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label
                htmlFor={`${idPrefix}-validPeriod`}
                className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
              >
                {activeT.columns.validPeriod}{' '}
                <span className="text-[11px] text-slate-400">(YYYY-MM-DD YYYY-MM-DD)</span>
              </label>
              {renderFieldStatusBadge('validPeriod', values.validPeriod)}
            </div>
            <button
              type="button"
              onClick={handleAddYear}
              className="touch-press text-[11px] font-medium px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20"
            >
              {activeT.actions.addOneYear}
            </button>
          </div>
          <input
            id={`${idPrefix}-validPeriod`}
            type="text"
            value={values.validPeriod}
            onChange={(e) => onChange((prev) => ({ ...prev, validPeriod: e.target.value }))}
            onBlur={(e) =>
              onChange((prev) => ({
                ...prev,
                validPeriod: formatValidPeriod(e.target.value),
              }))
            }
            placeholder={activeT.placeholders.validPeriod}
            className={`w-full rounded-xl border px-3 py-2 text-sm font-mono transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
              values.validPeriod
            )}`}
          />
          <CandidateChips
            fieldKey="validPeriod"
            currentValue={values.validPeriod}
            candidates={candidates}
            onSelect={(val) => onChange((prev) => ({ ...prev, validPeriod: formatValidPeriod(val) }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[10px] text-slate-400 mb-0.5">
                {activeT.labels.startDate}
              </span>
              <input
                type="date"
                aria-label={activeT.labels.startDate}
                value={/^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : ''}
                onChange={(e) => updateDatePart('start', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 mb-0.5">{activeT.labels.endDate}</span>
              <input
                type="date"
                aria-label={activeT.labels.endDate}
                value={/^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : ''}
                onChange={(e) => updateDatePart('end', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const renderRecordFieldsEditor = (
  values: ParsedDocumentFields,
  onChange: React.Dispatch<React.SetStateAction<ParsedDocumentFields>>,
  target: 'modal' | 'import' | 'staging',
  idPrefix: string,
  candidates?: ParsedDocumentCandidates,
  onAddOneYear?: (target: 'modal' | 'import' | 'staging', currentPeriod: string) => void,
  t?: Translations
) => (
  <RecordFieldsEditor
    values={values}
    onChange={onChange}
    target={target}
    idPrefix={idPrefix}
    candidates={candidates}
    onAddOneYear={onAddOneYear}
    t={t}
  />
);

export default RecordFieldsEditor;

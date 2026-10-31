import React, { useEffect, useMemo, useState } from 'react';
import {
  ScanText,
  Table2,
  Settings,
  Sun,
  Moon,
  Upload,
  Trash2,
  Edit3,
  Plus,
  Search,
  Download,
  ShieldCheck,
  Sparkles,
  Copy,
  X,
  Calendar,
  Car,
  Phone,
  MapPin,
  LayoutGrid,
  LayoutList,
} from 'lucide-react';
import { db, type TableRecord } from './db/db';
import { translations, type Language } from './i18n/translations';
import {
  addOneYearToDate,
  formatPhoneNumber,
  formatValidPeriod,
  parseDocumentText,
  splitValidPeriod,
  type ParsedDocumentFields,
} from './utils/parser';
import { extractTextFromImageFile } from './utils/ocr';
import { exportToCsv, exportToJson, exportToXlsx } from './utils/export';

type Tab = 'table' | 'import' | 'settings';
type ViewMode = 'table' | 'cards';

const EMPTY_FORM: ParsedDocumentFields = {
  fullName: '',
  address: '',
  phone: '',
  licensePlate: '',
  carModel: '',
  validPeriod: '',
  personalCode: '',
};

function getValidityStatus(validPeriod: string): 'active' | 'expiring' | 'expired' | 'none' {
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

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('table');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('aiRead_lang');
    return saved === 'en' ? 'en' : 'lt';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('aiRead_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [records, setRecords] = useState<TableRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state for manual Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formFields, setFormFields] = useState<ParsedDocumentFields>(EMPTY_FORM);

  // Import / OCR tab state (Zero image persistence)
  const [rawOcrText, setRawOcrText] = useState('');
  const [importFields, setImportFields] = useState<ParsedDocumentFields>(EMPTY_FORM);
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [lastScannedFileName, setLastScannedFileName] = useState('');

  const t = translations[lang];

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('aiRead_theme', theme);
    const meta = document.getElementById('theme-color-meta');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#09090b' : '#f8fafc');
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem('aiRead_lang', lang);
  }, [lang]);

  const loadRecords = async () => {
    const items = await db.records.orderBy('id').toArray();
    setRecords(items);
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const toggleLanguage = () => {
    setLang((prev) => (prev === 'lt' ? 'en' : 'lt'));
  };

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) =>
      [
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

  const openNewRecordModal = () => {
    setEditingId(null);
    setFormFields(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEditRecordModal = (rec: TableRecord) => {
    setEditingId(rec.id ?? null);
    setFormFields({
      fullName: rec.fullName,
      address: rec.address,
      phone: rec.phone,
      licensePlate: rec.licensePlate,
      carModel: rec.carModel,
      validPeriod: rec.validPeriod,
      personalCode: rec.personalCode,
    });
    setIsModalOpen(true);
  };

  const normalizeRecordFields = (fields: ParsedDocumentFields): ParsedDocumentFields => ({
    fullName: fields.fullName.trim(),
    address: fields.address.trim(),
    phone: formatPhoneNumber(fields.phone),
    licensePlate: fields.licensePlate.trim().toUpperCase(),
    carModel: fields.carModel.trim().toUpperCase(),
    validPeriod: formatValidPeriod(fields.validPeriod),
    personalCode: fields.personalCode.trim(),
  });

  const handleSaveModalForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRecordFields(formFields);
    const hasAnyValue = Object.values(normalized).some((v) => v.length > 0);
    if (!hasAnyValue) return;

    const now = new Date().toISOString();
    if (editingId !== null) {
      await db.records.update(editingId, {
        ...normalized,
        updatedAt: now,
      });
    } else {
      await db.records.add({
        ...normalized,
        createdAt: now,
        updatedAt: now,
      });
    }

    setIsModalOpen(false);
    setEditingId(null);
    setFormFields(EMPTY_FORM);
    await loadRecords();
  };

  const handleDuplicateRecord = async (rec: TableRecord) => {
    const now = new Date().toISOString();
    await db.records.add({
      fullName: rec.fullName,
      address: rec.address,
      phone: rec.phone,
      licensePlate: rec.licensePlate,
      carModel: rec.carModel,
      validPeriod: rec.validPeriod,
      personalCode: rec.personalCode,
      createdAt: now,
      updatedAt: now,
    });
    await loadRecords();
  };

  const handleDeleteRecord = async (id?: number) => {
    if (id === undefined) return;
    await db.records.delete(id);
    await loadRecords();
  };

  const handleDeleteAllRecords = async () => {
    if (!window.confirm(t.labels.confirmDeleteAll)) return;
    await db.records.clear();
    await loadRecords();
  };

  // Image upload for local OCR (transient memory only, never stored)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset file input immediately so the File reference is not retained on the DOM element
    e.target.value = '';
    if (!file) return;

    setLastScannedFileName(file.name);
    setIsProcessingOcr(true);
    setOcrProgress(5);

    try {
      const text = await extractTextFromImageFile(file, (p) => setOcrProgress(p));
      setRawOcrText(text);
      const parsed = parseDocumentText(text);
      setImportFields(parsed);
    } finally {
      setIsProcessingOcr(false);
      setOcrProgress(0);
    }
  };

  const handleRawTextChange = (text: string) => {
    setRawOcrText(text);
    const parsed = parseDocumentText(text);
    setImportFields(parsed);
  };

  const handleSaveImportedRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRecordFields(importFields);
    const hasAnyValue = Object.values(normalized).some((v) => v.length > 0);
    if (!hasAnyValue) return;

    const now = new Date().toISOString();
    await db.records.add({
      ...normalized,
      createdAt: now,
      updatedAt: now,
    });

    // Clear all transient OCR text and fields
    setRawOcrText('');
    setImportFields(EMPTY_FORM);
    setLastScannedFileName('');
    await loadRecords();
    setActiveTab('table');
  };

  const handleAddOneYear = (target: 'modal' | 'import', currentPeriod: string) => {
    const [start] = splitValidPeriod(currentPeriod);
    const baseStart =
      start && /^\d{4}-\d{2}-\d{2}$/.test(start)
        ? start
        : new Date().toISOString().slice(0, 10);
    const nextYear = addOneYearToDate(baseStart);
    const updated = `${baseStart} ${nextYear}`;
    if (target === 'modal') {
      setFormFields((prev) => ({ ...prev, validPeriod: updated }));
    } else {
      setImportFields((prev) => ({ ...prev, validPeriod: updated }));
    }
  };

  const setImportFieldsFromRaw = () => {
    const parsed = parseDocumentText(rawOcrText);
    setImportFields(parsed);
  };

  const renderRecordFieldsEditor = (
    values: ParsedDocumentFields,
    onChange: React.Dispatch<React.SetStateAction<ParsedDocumentFields>>,
    target: 'modal' | 'import',
    idPrefix: string
  ) => {
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

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Vardas Pavardė */}
        <div className="sm:col-span-2">
          <label
            htmlFor={`${idPrefix}-fullName`}
            className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1"
          >
            {t.columns.fullName}
          </label>
          <input
            id={`${idPrefix}-fullName`}
            type="text"
            value={values.fullName}
            onChange={(e) => onChange((prev) => ({ ...prev, fullName: e.target.value }))}
            placeholder={t.placeholders.fullName}
            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Asmens kodas */}
        <div>
          <label
            htmlFor={`${idPrefix}-personalCode`}
            className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1"
          >
            {t.columns.personalCode}
          </label>
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
            placeholder={t.placeholders.personalCode}
            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Telefonas */}
        <div>
          <label
            htmlFor={`${idPrefix}-phone`}
            className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1"
          >
            {t.columns.phone} <span className="text-[11px] text-slate-400">(0-6XX-XXXXX)</span>
          </label>
          <input
            id={`${idPrefix}-phone`}
            type="tel"
            value={values.phone}
            onChange={(e) => onChange((prev) => ({ ...prev, phone: e.target.value }))}
            onBlur={(e) =>
              onChange((prev) => ({ ...prev, phone: formatPhoneNumber(e.target.value) }))
            }
            placeholder={t.placeholders.phone}
            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Adresas */}
        <div className="sm:col-span-2">
          <label
            htmlFor={`${idPrefix}-address`}
            className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1"
          >
            {t.columns.address}
          </label>
          <input
            id={`${idPrefix}-address`}
            type="text"
            value={values.address}
            onChange={(e) => onChange((prev) => ({ ...prev, address: e.target.value }))}
            placeholder={t.placeholders.address}
            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Valst. Nr. */}
        <div>
          <label
            htmlFor={`${idPrefix}-licensePlate`}
            className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1"
          >
            {t.columns.licensePlate}
          </label>
          <input
            id={`${idPrefix}-licensePlate`}
            type="text"
            value={values.licensePlate}
            onChange={(e) =>
              onChange((prev) => ({ ...prev, licensePlate: e.target.value.toUpperCase() }))
            }
            placeholder={t.placeholders.licensePlate}
            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Modelis */}
        <div>
          <label
            htmlFor={`${idPrefix}-carModel`}
            className="block text-xs font-medium text-slate-700 dark:text-zinc-300 mb-1"
          >
            {t.columns.carModel}
          </label>
          <input
            id={`${idPrefix}-carModel`}
            type="text"
            value={values.carModel}
            onChange={(e) =>
              onChange((prev) => ({ ...prev, carModel: e.target.value.toUpperCase() }))
            }
            placeholder={t.placeholders.carModel}
            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Galiojimas (YYYY-MM-DD YYYY-MM-DD) */}
        <div className="sm:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor={`${idPrefix}-validPeriod`}
              className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
            >
              {t.columns.validPeriod}{' '}
              <span className="text-[11px] text-slate-400">(YYYY-MM-DD YYYY-MM-DD)</span>
            </label>
            <button
              type="button"
              onClick={() => handleAddOneYear(target, values.validPeriod)}
              className="touch-press text-[11px] font-medium px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20"
            >
              {t.actions.addOneYear}
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
            placeholder={t.placeholders.validPeriod}
            className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[10px] text-slate-400 mb-0.5">
                {t.labels.startDate}
              </span>
              <input
                type="date"
                aria-label={t.labels.startDate}
                value={/^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : ''}
                onChange={(e) => updateDatePart('start', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 mb-0.5">{t.labels.endDate}</span>
              <input
                type="date"
                aria-label={t.labels.endDate}
                value={/^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : ''}
                onChange={(e) => updateDatePart('end', e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-dvh w-full max-w-full flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-50 transition-colors overflow-x-hidden">
      {/* Top Sticky Header (iPhone 16 Pro Dynamic Island safe-area aware) */}
      <header className="sticky top-0 z-30 pt-safe pl-safe pr-safe glass-panel border-b border-slate-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto px-3.5 h-13 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-xl bg-indigo-500 flex items-center justify-center text-white shadow-xs">
              <ScanText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold tracking-tight leading-none truncate">
                {t.appName}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                {t.appSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label="Toggle language"
              className="touch-press px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              {lang.toUpperCase()}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="touch-press p-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 py-3.5 bottom-bar-padding pl-safe pr-safe">
        {activeTab === 'table' && (
          <div className="space-y-3">
            {/* Compact Top Action Bar fitted for 393px iPhone 16 Pro width */}
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-2xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={openNewRecordModal}
                    className="touch-press inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t.actions.addNew}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('import')}
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
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.placeholders.search}
                    aria-label={t.placeholders.search}
                    className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
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
                    onClick={() => setViewMode('table')}
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
                    onClick={() => setViewMode('cards')}
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
              /* Full 8-Column CRUD Table inside smooth horizontal container */
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
                        <th className="py-2.5 px-2.5 text-right">{t.columns.actions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/70">
                      {filteredRecords.map((rec, index) => {
                        const status = getValidityStatus(rec.validPeriod);
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
                            <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditRecordModal(rec)}
                                  aria-label={`${t.actions.edit} ${rec.fullName || index + 1}`}
                                  className="touch-press p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateRecord(rec)}
                                  aria-label={`${t.actions.duplicate} ${rec.fullName || index + 1}`}
                                  className="touch-press p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRecord(rec.id)}
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
                {filteredRecords.map((rec, index) => (
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
                        <button
                          type="button"
                          onClick={() => openEditRecordModal(rec)}
                          aria-label={`${t.actions.edit} ${rec.fullName || index + 1}`}
                          className="touch-press p-1.5 rounded-lg text-slate-500 hover:text-indigo-600"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(rec.id)}
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
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'import' && (
          <div className="space-y-3.5 max-w-2xl mx-auto">
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xs space-y-3.5">
              <div>
                <h2 className="text-sm font-semibold">{t.labels.importTitle}</h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  {t.labels.importSubtitle}
                </p>
              </div>

              {/* Strict Privacy Banner: Zero photo saving */}
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500" />
                <span>{t.labels.privacyBadge}</span>
              </div>

              {/* Camera / Photo Upload Dropzone */}
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-xl p-5 cursor-pointer hover:border-indigo-500/60 transition-colors bg-slate-50/60 dark:bg-zinc-950/40 text-center">
                <Upload className="w-6 h-6 text-indigo-500 mb-1.5" />
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
                  accept="image/*"
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
                  rows={4}
                  value={rawOcrText}
                  onChange={(e) => handleRawTextChange(e.target.value)}
                  placeholder={t.placeholders.rawText}
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Extracted & Editable Fields Form */}
              <form
                onSubmit={handleSaveImportedRecord}
                className="space-y-3 pt-2 border-t border-slate-100 dark:border-zinc-800"
              >
                <h3 className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  {t.labels.verifiedFields}
                </h3>

                {renderRecordFieldsEditor(importFields, setImportFields, 'import', 'import')}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    className="touch-press flex-1 py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs shadow-xs"
                  >
                    {t.actions.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRawOcrText('');
                      setImportFields(EMPTY_FORM);
                      setLastScannedFileName('');
                    }}
                    className="touch-press py-2.5 px-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-medium"
                  >
                    {t.actions.clear}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-3.5 max-w-xl mx-auto">
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{t.labels.language}</span>
                <div className="inline-flex rounded-xl border border-slate-200 dark:border-zinc-800 p-0.5 bg-slate-50 dark:bg-zinc-950">
                  <button
                    type="button"
                    onClick={() => setLang('lt')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      lang === 'lt'
                        ? 'bg-indigo-500 text-white'
                        : 'text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    Lietuvių (LT)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('en')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      lang === 'en'
                        ? 'bg-indigo-500 text-white'
                        : 'text-slate-600 dark:text-zinc-400'
                    }`}
                  >
                    English (EN)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-zinc-800">
                <span className="text-xs font-medium">{t.labels.appearance}</span>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="touch-press px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs font-medium"
                >
                  {theme === 'light' ? t.labels.lightMode : t.labels.darkMode}
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 space-y-2">
                <h3 className="text-xs font-semibold">{t.labels.exportData}</h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                  {t.labels.exportSubtitle}
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => exportToCsv(records, lang)}
                    className="touch-press py-2 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportToXlsx(records, lang)}
                    className="touch-press py-2 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>XLSX</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => exportToJson(records, lang)}
                    className="touch-press py-2 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-medium">{t.labels.dataManagement}</span>
                <button
                  type="button"
                  onClick={handleDeleteAllRecords}
                  className="touch-press px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  {t.actions.deleteAll}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Add / Edit Record Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingId !== null ? t.labels.editRecordTitle : t.labels.newRecordTitle}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
        >
          <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 pb-safe shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-2.5">
              <h2 className="text-sm font-semibold">
                {editingId !== null ? t.labels.editRecordTitle : t.labels.newRecordTitle}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label={t.actions.cancel}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModalForm} className="space-y-3">
              {renderRecordFieldsEditor(formFields, setFormFields, 'modal', 'modal')}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  className="touch-press flex-1 py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs shadow-xs"
                >
                  {editingId !== null ? t.actions.update : t.actions.save}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="touch-press py-2.5 px-4 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-medium"
                >
                  {t.actions.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar (iPhone 16 Pro Home Indicator safe-area aware) */}
      <nav
        aria-label="Bottom Navigation"
        className="fixed bottom-0 inset-x-0 z-30 glass-panel border-t border-slate-200 dark:border-zinc-800 pb-safe pl-safe pr-safe"
      >
        <div className="max-w-xl mx-auto px-4 h-15 flex items-center justify-around">
          <button
            type="button"
            onClick={() => setActiveTab('table')}
            className={`touch-press flex flex-col items-center gap-1 text-[11px] font-semibold ${
              activeTab === 'table'
                ? 'text-indigo-500'
                : 'text-slate-500 dark:text-zinc-400'
            }`}
          >
            <Table2 className="w-5 h-5" />
            <span>{t.navTable}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`touch-press flex flex-col items-center gap-1 text-[11px] font-semibold ${
              activeTab === 'import'
                ? 'text-indigo-500'
                : 'text-slate-500 dark:text-zinc-400'
            }`}
          >
            <ScanText className="w-5 h-5" />
            <span>{t.navImport}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`touch-press flex flex-col items-center gap-1 text-[11px] font-semibold ${
              activeTab === 'settings'
                ? 'text-indigo-500'
                : 'text-slate-500 dark:text-zinc-400'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>{t.navSettings}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

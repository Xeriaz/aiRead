import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Layers,
  FileImage,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Square,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { db, type StagingRecord, type TableRecord } from './db/db';
import { translations, type Language } from './i18n/translations';
import {
  addOneYearToDate,
  calculateAccuracyScore,
  formatPhoneNumber,
  formatValidPeriod,
  parseDocumentCandidates,
  parseDocumentText,
  splitValidPeriod,
  type ParsedDocumentCandidates,
  type ParsedDocumentFields,
} from './utils/parser';
import { extractTextAndConfidenceFromImageFile } from './utils/ocr';
import { exportToCsv, exportToJson, exportToXlsx } from './utils/export';

type Tab = 'table' | 'import' | 'bulk' | 'settings';
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

const EMPTY_CANDIDATES: ParsedDocumentCandidates = {
  fullName: [],
  address: [],
  phone: [],
  licensePlate: [],
  carModel: [],
  validPeriod: [],
  personalCode: [],
};

const FORM_FIELD_KEYS: Array<keyof ParsedDocumentFields> = [
  'fullName',
  'personalCode',
  'phone',
  'address',
  'licensePlate',
  'carModel',
  'validPeriod',
];

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

function getAccuracyBadgeClasses(score: number): string {
  if (score >= 80) {
    return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30';
  }
  if (score >= 50) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30';
  }
  return 'bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30';
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
  const [stagingRecords, setStagingRecords] = useState<StagingRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state for manual Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formFields, setFormFields] = useState<ParsedDocumentFields>(EMPTY_FORM);

  // Import / OCR tab state (Zero image persistence)
  const [rawOcrText, setRawOcrText] = useState('');
  const [importFields, setImportFields] = useState<ParsedDocumentFields>(EMPTY_FORM);
  const [importCandidates, setImportCandidates] =
    useState<ParsedDocumentCandidates>(EMPTY_CANDIDATES);
  const [importOcrConfidence, setImportOcrConfidence] = useState<number | undefined>(undefined);
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [lastScannedFileName, setLastScannedFileName] = useState('');
  const [ocrErrorMessage, setOcrErrorMessage] = useState<string | null>(null);

  // Bulk Import & Sequential Staging Verification state (Zero image persistence)
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

  // Modal Escape key listener
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const loadRecords = async () => {
    const items = await db.records.orderBy('id').toArray();
    setRecords(items);
  };

  const loadStagingRecords = async () => {
    const items = await db.stagingRecords.orderBy('id').toArray();
    setStagingRecords(items);
  };

  useEffect(() => {
    void loadRecords();
    void loadStagingRecords();
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

    const accuracyScore = calculateAccuracyScore(normalized);
    const now = new Date().toISOString();
    if (editingId !== null) {
      await db.records.update(editingId, {
        ...normalized,
        accuracyScore,
        updatedAt: now,
      });
    } else {
      await db.records.add({
        ...normalized,
        accuracyScore,
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
    const accuracyScore = rec.accuracyScore ?? calculateAccuracyScore(rec);
    await db.records.add({
      imageName: rec.imageName,
      fullName: rec.fullName,
      address: rec.address,
      phone: rec.phone,
      licensePlate: rec.licensePlate,
      carModel: rec.carModel,
      validPeriod: rec.validPeriod,
      personalCode: rec.personalCode,
      accuracyScore,
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

  // Single image upload for local OCR (transient memory only, never stored)
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

  // Sequential Bulk Photo Upload -> Staging Queue (Zero photo persistence)
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

        await loadStagingRecords();
      }
    } finally {
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
    const next = typeof updater === 'function' ? updater(stagingEditFields) : updater;
    setStagingEditFields(next);
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
        .then(() => loadStagingRecords());
    }
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
        .then(() => loadStagingRecords());
    }
  };

  const advanceStagingIdAfterRemoval = (removedId: number) => {
    const currentIndex = sortedStagingRecords.findIndex((r) => r.id === removedId);
    if (currentIndex !== -1) {
      const nextRecord =
        sortedStagingRecords[currentIndex + 1] || sortedStagingRecords[currentIndex - 1];
      setActiveStagingId(nextRecord?.id ?? null);
    }
  };

  const handleApproveStagingId = async (
    targetId: number,
    fieldsToUse: ParsedDocumentFields,
    targetItem?: StagingRecord
  ) => {
    advanceStagingIdAfterRemoval(targetId);

    await db.transaction('rw', db.records, db.stagingRecords, async () => {
      const existing = await db.stagingRecords.get(targetId);
      if (!existing) return;

      const normalized = normalizeRecordFields(fieldsToUse);
      const accuracyScore = calculateAccuracyScore(normalized);
      const now = new Date().toISOString();

      await db.records.add({
        imageName: targetItem?.imageName ?? existing.imageName,
        ...normalized,
        accuracyScore,
        createdAt: now,
        updatedAt: now,
      });
      await db.stagingRecords.delete(targetId);
    });

    await Promise.all([loadRecords(), loadStagingRecords()]);
  };

  const handleApproveCurrentStaging = async () => {
    if (!currentStagingRecord || currentStagingRecord.id === undefined) return;
    await handleApproveStagingId(
      currentStagingRecord.id,
      stagingEditFields,
      currentStagingRecord
    );
  };

  const handleApproveStagingRow = async (item: StagingRecord) => {
    if (item.id === undefined) return;
    const sourceFields: ParsedDocumentFields =
      currentStagingRecord?.id === item.id
        ? stagingEditFields
        : {
            fullName: item.fullName,
            address: item.address,
            phone: item.phone,
            licensePlate: item.licensePlate,
            carModel: item.carModel,
            validPeriod: item.validPeriod,
            personalCode: item.personalCode,
          };
    await handleApproveStagingId(item.id, sourceFields, item);
  };

  const handleRejectStagingRow = async (id?: number) => {
    if (id === undefined) return;
    advanceStagingIdAfterRemoval(id);
    await db.stagingRecords.delete(id);
    await loadStagingRecords();
  };

  const handleRawTextChange = (text: string) => {
    setRawOcrText(text);
    setImportOcrConfidence(undefined);
    const candidates = parseDocumentCandidates(text);
    setImportCandidates(candidates);
    const parsed = parseDocumentText(text);
    setImportFields(parsed);
  };

  const handleSaveImportedRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRecordFields(importFields);
    const hasAnyValue = Object.values(normalized).some((v) => v.length > 0);
    if (!hasAnyValue) return;

    const accuracyScore = calculateAccuracyScore(normalized, importOcrConfidence);
    const now = new Date().toISOString();
    await db.records.add({
      imageName: lastScannedFileName || undefined,
      ...normalized,
      accuracyScore,
      createdAt: now,
      updatedAt: now,
    });

    setRawOcrText('');
    setImportFields(EMPTY_FORM);
    setImportCandidates(EMPTY_CANDIDATES);
    setImportOcrConfidence(undefined);
    setLastScannedFileName('');
    await loadRecords();
    setActiveTab('table');
  };

  const handleAddOneYear = (target: 'modal' | 'import' | 'staging', currentPeriod: string) => {
    const [start] = splitValidPeriod(currentPeriod);
    const baseStart =
      start && /^\d{4}-\d{2}-\d{2}$/.test(start)
        ? start
        : new Date().toISOString().slice(0, 10);
    const nextYear = addOneYearToDate(baseStart);
    const updated = `${baseStart} ${nextYear}`;
    if (target === 'modal') {
      setFormFields((prev) => ({ ...prev, validPeriod: updated }));
    } else if (target === 'staging') {
      handleStagingFieldsChange((prev) => ({ ...prev, validPeriod: updated }));
    } else {
      setImportFields((prev) => ({ ...prev, validPeriod: updated }));
    }
  };

  const setImportFieldsFromRaw = () => {
    const candidates = parseDocumentCandidates(rawOcrText);
    setImportCandidates(candidates);
    const parsed = parseDocumentText(rawOcrText);
    setImportFields(parsed);
  };

  const renderCandidateChips = (
    fieldKey: keyof ParsedDocumentFields,
    currentValue: string,
    candidates: ParsedDocumentCandidates | undefined,
    onSelect: (val: string) => void
  ) => {
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

  const renderRecordFieldsEditor = (
    values: ParsedDocumentFields,
    onChange: React.Dispatch<React.SetStateAction<ParsedDocumentFields>>,
    target: 'modal' | 'import' | 'staging',
    idPrefix: string,
    candidates?: ParsedDocumentCandidates
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

    const emptyFieldKeys = FORM_FIELD_KEYS.filter((k) => values[k].trim().length === 0);
    const isUntouchedBlankForm = target !== 'staging' && emptyFieldKeys.length === 7;

    const getInputBorderClasses = (val: string) => {
      if (val.trim().length === 0) {
        if (isUntouchedBlankForm) {
          return 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 focus:ring-indigo-500';
        }
        return 'border-rose-400/80 dark:border-rose-500/60 bg-rose-50/40 dark:bg-rose-950/20 focus:ring-rose-500';
      }
      return 'border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 focus:ring-indigo-500';
    };

    const renderFieldStatusBadge = (fieldKey: keyof ParsedDocumentFields, val: string) =>
      val.trim().length === 0 ? (
        <span
          data-testid={`${idPrefix}-empty-badge-${fieldKey}`}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
            isUntouchedBlankForm
              ? 'bg-slate-500/10 text-slate-600 dark:text-zinc-400 border border-slate-500/20'
              : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isUntouchedBlankForm ? 'bg-slate-400' : 'bg-rose-500'
            }`}
          />
          <span>{t.labels.emptyFieldBadge}</span>
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
            className={`rounded-xl border px-3 py-2 space-y-1.5 ${
              isUntouchedBlankForm
                ? 'border-slate-200 dark:border-zinc-800 bg-slate-100/70 dark:bg-zinc-900/60'
                : 'border-rose-500/30 bg-rose-500/10'
            }`}
          >
            <div
              className={`flex items-center gap-1.5 text-[11px] font-semibold ${
                isUntouchedBlankForm
                  ? 'text-slate-600 dark:text-zinc-400'
                  : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              <AlertCircle
                className={`w-3.5 h-3.5 shrink-0 ${
                  isUntouchedBlankForm ? 'text-slate-400' : 'text-rose-500'
                }`}
              />
              <span>
                {t.labels.emptyFieldsSummary.replace('{count}', String(emptyFieldKeys.length))}
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
                  className={`touch-press inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-medium border transition-colors ${
                    isUntouchedBlankForm
                      ? 'bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-300 dark:border-zinc-700 hover:bg-slate-50'
                      : 'bg-white/90 dark:bg-zinc-900/90 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isUntouchedBlankForm ? 'bg-slate-400' : 'bg-rose-500'
                    }`}
                  />
                  <span>{t.columns[key]}</span>
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
            <span>{t.labels.allFieldsFilled}</span>
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
                {t.columns.fullName}
              </label>
              {renderFieldStatusBadge('fullName', values.fullName)}
            </div>
            <input
              id={`${idPrefix}-fullName`}
              type="text"
              value={values.fullName}
              onChange={(e) => onChange((prev) => ({ ...prev, fullName: e.target.value }))}
              placeholder={t.placeholders.fullName}
              className={`w-full rounded-xl border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
                values.fullName
              )}`}
            />
            {renderCandidateChips('fullName', values.fullName, candidates, (val) =>
              onChange((prev) => ({ ...prev, fullName: val }))
            )}
          </div>

          {/* Asmens kodas */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label
                htmlFor={`${idPrefix}-personalCode`}
                className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
              >
                {t.columns.personalCode}
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
              placeholder={t.placeholders.personalCode}
              className={`w-full rounded-xl border px-3 py-2 text-sm font-mono transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
                values.personalCode
              )}`}
            />
            {renderCandidateChips('personalCode', values.personalCode, candidates, (val) =>
              onChange((prev) => ({ ...prev, personalCode: val }))
            )}
          </div>

          {/* Telefonas */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label
                htmlFor={`${idPrefix}-phone`}
                className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
              >
                {t.columns.phone}{' '}
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
              placeholder={t.placeholders.phone}
              className={`w-full rounded-xl border px-3 py-2 text-sm font-mono transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
                values.phone
              )}`}
            />
            {renderCandidateChips('phone', values.phone, candidates, (val) =>
              onChange((prev) => ({ ...prev, phone: formatPhoneNumber(val) }))
            )}
          </div>

          {/* Adresas */}
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <label
                htmlFor={`${idPrefix}-address`}
                className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
              >
                {t.columns.address}
              </label>
              {renderFieldStatusBadge('address', values.address)}
            </div>
            <input
              id={`${idPrefix}-address`}
              type="text"
              value={values.address}
              onChange={(e) => onChange((prev) => ({ ...prev, address: e.target.value }))}
              placeholder={t.placeholders.address}
              className={`w-full rounded-xl border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
                values.address
              )}`}
            />
            {renderCandidateChips('address', values.address, candidates, (val) =>
              onChange((prev) => ({ ...prev, address: val }))
            )}
          </div>

          {/* Valst. Nr. */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label
                htmlFor={`${idPrefix}-licensePlate`}
                className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
              >
                {t.columns.licensePlate}
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
              placeholder={t.placeholders.licensePlate}
              className={`w-full rounded-xl border px-3 py-2 text-sm font-mono uppercase transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
                values.licensePlate
              )}`}
            />
            {renderCandidateChips('licensePlate', values.licensePlate, candidates, (val) =>
              onChange((prev) => ({ ...prev, licensePlate: val.toUpperCase() }))
            )}
          </div>

          {/* Modelis */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label
                htmlFor={`${idPrefix}-carModel`}
                className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
              >
                {t.columns.carModel}
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
              placeholder={t.placeholders.carModel}
              className={`w-full rounded-xl border px-3 py-2 text-sm uppercase transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
                values.carModel
              )}`}
            />
            {renderCandidateChips('carModel', values.carModel, candidates, (val) =>
              onChange((prev) => ({ ...prev, carModel: val.toUpperCase() }))
            )}
          </div>

          {/* Galiojimas (YYYY-MM-DD YYYY-MM-DD) */}
          <div className="sm:col-span-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label
                  htmlFor={`${idPrefix}-validPeriod`}
                  className="block text-xs font-medium text-slate-700 dark:text-zinc-300"
                >
                  {t.columns.validPeriod}{' '}
                  <span className="text-[11px] text-slate-400">(YYYY-MM-DD YYYY-MM-DD)</span>
                </label>
                {renderFieldStatusBadge('validPeriod', values.validPeriod)}
              </div>
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
              className={`w-full rounded-xl border px-3 py-2 text-sm font-mono transition-colors focus:outline-none focus:ring-2 ${getInputBorderClasses(
                values.validPeriod
              )}`}
            />
            {renderCandidateChips('validPeriod', values.validPeriod, candidates, (val) =>
              onChange((prev) => ({ ...prev, validPeriod: formatValidPeriod(val) }))
            )}
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
      </div>
    );
  };

  const liveImportScore = calculateAccuracyScore(
    normalizeRecordFields(importFields),
    importOcrConfidence
  );
  const liveModalScore = calculateAccuracyScore(normalizeRecordFields(formFields));
  const liveStagingScore = calculateAccuracyScore(normalizeRecordFields(stagingEditFields));

  const isModalSubmitDisabled = !Object.values(normalizeRecordFields(formFields)).some(
    (v) => v.length > 0
  );
  const isImportSubmitDisabled = !Object.values(normalizeRecordFields(importFields)).some(
    (v) => v.length > 0
  );

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
                    disabled={filteredRecords.length === 0}
                    onClick={() => exportToCsv(filteredRecords, lang)}
                    aria-label="Export CSV"
                    className="touch-press inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3 h-3" />
                    <span>{t.actions.exportCsv}</span>
                  </button>
                  <button
                    type="button"
                    disabled={filteredRecords.length === 0}
                    onClick={() => exportToXlsx(filteredRecords, lang)}
                    aria-label="Export XLSX"
                    className="touch-press inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3 h-3" />
                    <span>{t.actions.exportXlsx}</span>
                  </button>
                  <button
                    type="button"
                    disabled={filteredRecords.length === 0}
                    onClick={() => exportToJson(filteredRecords, lang)}
                    aria-label="Export JSON"
                    className="touch-press inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-[11px] font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
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
              /* Full CRUD Table inside smooth horizontal container */
              <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs table-auto">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-950/60 text-[11px] font-semibold text-slate-600 dark:text-zinc-400 whitespace-nowrap">
                        <th className="py-2.5 px-2.5 w-12 text-center">{t.columns.rowNumber}</th>
                        <th className="py-2.5 px-3 min-w-[140px] max-w-[200px]">{t.columns.fullName}</th>
                        <th className="py-2.5 px-3 min-w-[180px] max-w-[240px]">{t.columns.address}</th>
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
                            <td className="py-2.5 px-3 font-medium min-w-[140px] max-w-[200px]">
                              <div className="flex flex-col gap-0.5">
                                <span className="truncate" title={rec.fullName || ''}>
                                  {rec.fullName || '—'}
                                </span>
                                {rec.imageName && (
                                  <span
                                    title={rec.imageName}
                                    className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500 truncate max-w-[160px]"
                                  >
                                    <FileImage className="w-3 h-3 text-indigo-400 shrink-0" />
                                    <span className="truncate">{rec.imageName}</span>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 min-w-[180px] max-w-[240px] truncate" title={rec.address}>
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
                              <div className="inline-flex items-center justify-end gap-1.5">
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
                {filteredRecords.map((rec, index) => {
                  const score = rec.accuracyScore ?? calculateAccuracyScore(rec);
                  const status = getValidityStatus(rec.validPeriod);
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
                            <div className="flex flex-wrap items-center gap-1.5">
                              {rec.personalCode && (
                                <p className="text-[11px] font-mono text-slate-500 dark:text-zinc-400">
                                  {t.columns.personalCode}: {rec.personalCode}
                                </p>
                              )}
                              {rec.imageName && (
                                <span
                                  title={rec.imageName}
                                  className="inline-flex items-center gap-1 text-[10px] text-slate-400 dark:text-zinc-500 truncate max-w-[160px]"
                                >
                                  <FileImage className="w-3 h-3 text-indigo-400 shrink-0" />
                                  <span className="truncate">{rec.imageName}</span>
                                </span>
                              )}
                            </div>
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
                            onClick={() => openEditRecordModal(rec)}
                            aria-label={`${t.actions.edit} ${rec.fullName || index + 1}`}
                            className="touch-press p-1.5 rounded-lg text-slate-500 hover:text-indigo-600"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateRecord(rec)}
                            aria-label={`${t.actions.duplicate} ${rec.fullName || index + 1}`}
                            className="touch-press p-1.5 rounded-lg text-slate-500 hover:text-indigo-600"
                          >
                            <Copy className="w-4 h-4" />
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
                            <span
                              className={
                                status === 'expired'
                                  ? 'text-red-600 dark:text-red-400 font-semibold'
                                  : status === 'expiring'
                                    ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                    : ''
                              }
                            >
                              {rec.validPeriod}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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

              {/* Camera / Photo Upload Dropzone with Social-Style Center + Button */}
              <label
                data-testid="single-image-import-dropzone"
                className="group flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl p-6 cursor-pointer hover:border-indigo-500/70 transition-all bg-slate-50/60 dark:bg-zinc-950/40 text-center"
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
                  accept="image/*"
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
                <div className="flex items-center justify-between gap-2">
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

                {renderRecordFieldsEditor(
                  importFields,
                  setImportFields,
                  'import',
                  'import',
                  importCandidates
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isImportSubmitDisabled}
                    className="touch-press flex-1 py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t.actions.save}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRawOcrText('');
                      setImportFields(EMPTY_FORM);
                      setImportCandidates(EMPTY_CANDIDATES);
                      setImportOcrConfidence(undefined);
                      setLastScannedFileName('');
                      setOcrErrorMessage(null);
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

        {activeTab === 'bulk' && (
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
                  className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2"
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
                    {renderRecordFieldsEditor(
                      stagingEditFields,
                      handleStagingFieldsChange,
                      'staging',
                      'staging',
                      stagingEditCandidates
                    )}

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
                          onClick={() => handleRejectStagingRow(currentStagingRecord.id)}
                          className="touch-press inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-semibold"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t.actions.rejectDelete}</span>
                        </button>

                        <button
                          type="button"
                          data-testid="approve-and-next-btn"
                          onClick={handleApproveCurrentStaging}
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
                                      onClick={() => handleApproveStagingRow(item)}
                                      aria-label={`${t.actions.approve} ${item.imageName}`}
                                      className="touch-press px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold"
                                    >
                                      {t.actions.approve}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRejectStagingRow(item.id)}
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
                    Lietuvių
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
                    English
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
                    disabled={records.length === 0}
                    onClick={() => exportToCsv(records, lang)}
                    className="touch-press py-2 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    disabled={records.length === 0}
                    onClick={() => exportToXlsx(records, lang)}
                    className="touch-press py-2 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>XLSX</span>
                  </button>
                  <button
                    type="button"
                    disabled={records.length === 0}
                    onClick={() => exportToJson(records, lang)}
                    className="touch-press py-2 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
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
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsModalOpen(false);
            }
          }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 pb-safe shadow-xl space-y-3"
          >
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
                  disabled={isModalSubmitDisabled}
                  className="touch-press flex-1 py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
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

          {/* Instagram / Social Media style Center + Button for Single Image Import */}
          <button
            type="button"
            data-testid="center-plus-import-btn"
            onClick={() => setActiveTab('import')}
            className={`touch-press -mt-3 flex flex-col items-center gap-1 text-[11px] font-semibold ${
              activeTab === 'import'
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-slate-600 dark:text-zinc-300'
            }`}
          >
            <span
              className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform ${
                activeTab === 'import'
                  ? 'bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 ring-4 ring-indigo-500/25 shadow-indigo-500/40 scale-105'
                  : 'bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 shadow-indigo-500/30 hover:scale-105'
              }`}
            >
              <Plus className="w-6 h-6 stroke-[2.75]" />
            </span>
            <span>{t.navImport}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('bulk')}
            className={`touch-press flex flex-col items-center gap-1 text-[11px] font-semibold ${
              activeTab === 'bulk'
                ? 'text-indigo-500'
                : 'text-slate-500 dark:text-zinc-400'
            }`}
          >
            <Layers className="w-5 h-5" />
            <span>
              {stagingRecords.length > 0
                ? `${t.navBulk} (${stagingRecords.length})`
                : t.navBulk}
            </span>
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

import React, { useEffect, useState } from 'react';
import {
  Download,
  Layers,
  Moon,
  Plus,
  ScanText,
  Settings,
  Sun,
  Table2,
} from 'lucide-react';
import { db, type StagingRecord, type TableRecord } from './db/db';
import { translations, type Language } from './i18n/translations';
import { exportToCsv, exportToJson, exportToXlsx } from './utils/export';
import {
  addOneYearToDate,
  calculateAccuracyScore,
  splitValidPeriod,
  type ParsedDocumentFields,
} from './utils/parser';
import {
  EMPTY_FORM,
  normalizeRecordFields,
} from './components/RecordFieldsEditor';
import RecordsTableTab from './components/RecordsTableTab';
import SingleImportTab from './components/SingleImportTab';
import BulkStagingTab from './components/BulkStagingTab';
import RecordModal from './components/RecordModal';

type Tab = 'table' | 'import' | 'bulk' | 'settings';
type ViewMode = 'table' | 'cards';

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

  const handleSaveImportedRecord = async (
    fields: ParsedDocumentFields,
    confidence?: number,
    imageName?: string
  ) => {
    const accuracyScore = calculateAccuracyScore(fields, confidence);
    const now = new Date().toISOString();
    await db.records.add({
      imageName,
      ...fields,
      accuracyScore,
      createdAt: now,
      updatedAt: now,
    });
    await loadRecords();
    setActiveTab('table');
  };

  const handleApproveStagingId = async (
    targetId: number,
    fieldsToUse: ParsedDocumentFields,
    targetItem?: StagingRecord
  ) => {
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

  const handleApproveCurrentStaging = async (
    record: StagingRecord,
    fields: ParsedDocumentFields
  ) => {
    if (record.id === undefined) return;
    await handleApproveStagingId(record.id, fields, record);
  };

  const handleApproveStagingRow = async (
    item: StagingRecord,
    liveFields?: ParsedDocumentFields
  ) => {
    if (item.id === undefined) return;
    const sourceFields: ParsedDocumentFields = liveFields ?? {
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
    await db.stagingRecords.delete(id);
    await loadStagingRecords();
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
    }
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
              onClick={() => setActiveTab((prev) => (prev === 'settings' ? 'table' : 'settings'))}
              aria-label={t.navSettings}
              title={t.navSettings}
              className={`touch-press p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                activeTab === 'settings'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-600 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-400'
                  : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 py-3.5 bottom-bar-padding pl-safe pr-safe">
        {activeTab === 'table' && (
          <RecordsTableTab
            records={records}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onNewRecord={openNewRecordModal}
            onNavigateToImport={() => setActiveTab('import')}
            onEditRecord={openEditRecordModal}
            onDuplicateRecord={handleDuplicateRecord}
            onDeleteRecord={handleDeleteRecord}
            lang={lang}
            t={t}
          />
        )}

        {activeTab === 'import' && (
          <SingleImportTab
            onSaveRecord={handleSaveImportedRecord}
            onAddOneYear={handleAddOneYear}
            t={t}
          />
        )}

        {activeTab === 'bulk' && (
          <BulkStagingTab
            stagingRecords={stagingRecords}
            onReloadStaging={loadStagingRecords}
            onApproveCurrentStaging={handleApproveCurrentStaging}
            onApproveStagingRow={handleApproveStagingRow}
            onRejectStagingRow={handleRejectStagingRow}
            onAddOneYear={handleAddOneYear}
            t={t}
          />
        )}

        {activeTab === 'settings' && (
          <div className="space-y-3.5 max-w-xl mx-auto">
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-indigo-500" />
                  <h2 className="text-sm font-bold">{t.navSettings}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('table')}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {t.navTable}
                </button>
              </div>

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
                  aria-label="Toggle theme"
                  className="touch-press px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-zinc-800"
                >
                  {theme === 'light' ? (
                    <>
                      <Moon className="w-3.5 h-3.5" />
                      <span>{t.labels.lightMode}</span>
                    </>
                  ) : (
                    <>
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t.labels.darkMode}</span>
                    </>
                  )}
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
      <RecordModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        editingId={editingId}
        formFields={formFields}
        setFormFields={setFormFields}
        onSave={handleSaveModalForm}
        onAddOneYear={handleAddOneYear}
        t={t}
      />

      {/* Bottom Navigation Bar (iPhone 16 Pro Home Indicator safe-area aware) */}
      <nav
        aria-label="Bottom Navigation"
        className="fixed bottom-0 inset-x-0 z-30 glass-panel border-t border-slate-200 dark:border-zinc-800 pb-safe pl-safe pr-safe"
      >
        <div className="max-w-md mx-auto px-6 h-15 flex items-center justify-around">
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
        </div>
      </nav>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { ScanText, History, Settings, Sun, Moon, Upload, Trash2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { db, type ImageScan } from './db/db';

type Tab = 'scan' | 'history' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('scan');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('aiRead_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [scans, setScans] = useState<ImageScan[]>([]);
  const [titleInput, setTitleInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

  const loadScans = async () => {
    const items = await db.scans.orderBy('createdAt').reverse().toArray();
    setScans(items);
  };

  useEffect(() => {
    void loadScans();
  }, []);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPreviewUrl(reader.result);
        if (!titleInput) {
          setTitleInput(file.name.replace(/\.[^/.]+$/, ''));
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleInput.trim() && !notesInput.trim() && !previewUrl) return;

    const newScan: ImageScan = {
      title: titleInput.trim() || 'Untitled Image',
      imageDataUrl: previewUrl || '',
      extractedText: notesInput.trim() || 'No text extracted yet.',
      extractedData: {},
      createdAt: new Date().toISOString(),
    };

    await db.scans.add(newScan);
    setTitleInput('');
    setNotesInput('');
    setPreviewUrl(null);
    await loadScans();
    setActiveTab('history');
  };

  const handleDeleteScan = async (id?: number) => {
    if (id === undefined) return;
    await db.scans.delete(id);
    await loadScans();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-50 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-20 pt-safe glass-panel border-b border-slate-200 dark:border-zinc-800">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center text-white shadow-xs">
              <ScanText className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight leading-none">aiRead</h1>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Read images &amp; gather data
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="touch-press p-2 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-5 bottom-bar-padding">
        {activeTab === 'scan' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-2xs">
              <h2 className="text-sm font-semibold mb-1">Read Image Data</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">
                Select or capture an image to extract and store structured information offline.
              </p>

              <form onSubmit={handleSaveScan} className="space-y-3">
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-xl p-6 cursor-pointer hover:border-indigo-500/60 transition-colors bg-slate-50/60 dark:bg-zinc-950/40">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Selected preview"
                      className="max-h-44 rounded-lg object-contain mb-2"
                    />
                  ) : (
                    <Upload className="w-7 h-7 text-indigo-500 mb-2" />
                  )}
                  <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                    {previewUrl ? 'Tap to change image' : 'Choose or drop an image'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>

                <div>
                  <label htmlFor="scan-title" className="block text-xs font-medium mb-1">
                    Document / Image Title
                  </label>
                  <input
                    id="scan-title"
                    type="text"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    placeholder="e.g., Receipt, Label, Note..."
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="scan-notes" className="block text-xs font-medium mb-1">
                    Gathered Data / Extracted Text
                  </label>
                  <textarea
                    id="scan-notes"
                    rows={3}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Extracted text or key-value notes..."
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  className="touch-press w-full py-2.5 px-4 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium text-sm shadow-xs"
                >
                  Save Entry
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Saved Readings ({scans.length})</h2>
            </div>

            {scans.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
                <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium">No images read yet</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Captured images and gathered data will appear here.
                </p>
              </div>
            ) : (
              scans.map((scan) => (
                <div
                  key={scan.id}
                  className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate">{scan.title}</h3>
                    <p className="text-xs text-slate-600 dark:text-zinc-300 whitespace-pre-wrap break-words">
                      {scan.extractedText}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {format(new Date(scan.createdAt), 'MMM d, yyyy HH:mm')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteScan(scan.id)}
                    aria-label={`Delete ${scan.title}`}
                    className="touch-press p-2 text-slate-400 hover:text-red-500 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4">
            <div>
              <h2 className="text-sm font-semibold">App Settings</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Offline-first local storage powered by IndexedDB (Dexie).
              </p>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800">
              <span className="text-xs font-medium">Appearance</span>
              <button
                type="button"
                onClick={toggleTheme}
                className="touch-press px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-xs font-medium"
              >
                {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav
        aria-label="Bottom Navigation"
        className="fixed bottom-0 inset-x-0 z-20 glass-panel border-t border-slate-200 dark:border-zinc-800 pb-safe"
      >
        <div className="max-w-xl mx-auto px-6 h-16 flex items-center justify-around">
          <button
            type="button"
            onClick={() => setActiveTab('scan')}
            className={`touch-press flex flex-col items-center gap-1 text-xs font-medium ${
              activeTab === 'scan'
                ? 'text-indigo-500'
                : 'text-slate-500 dark:text-zinc-400'
            }`}
          >
            <ScanText className="w-5 h-5" />
            <span>Read</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`touch-press flex flex-col items-center gap-1 text-xs font-medium ${
              activeTab === 'history'
                ? 'text-indigo-500'
                : 'text-slate-500 dark:text-zinc-400'
            }`}
          >
            <History className="w-5 h-5" />
            <span>History</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`touch-press flex flex-col items-center gap-1 text-xs font-medium ${
              activeTab === 'settings'
                ? 'text-indigo-500'
                : 'text-slate-500 dark:text-zinc-400'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

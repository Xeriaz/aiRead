# aiRead

**aiRead** is an offline-first Progressive Web App (PWA) for scanning documents from photos, extracting structured fields locally on your device, managing records in a CRUD table, and safely exporting/syncing data via password-protected encrypted backups.

---

## 🔒 100% Local & Private (Zero External Storage)

- **No External Servers or Cloud Storage:** All extracted records and settings stay strictly inside your browser's local storage (`IndexedDB` via Dexie) on your own device. Nothing is ever uploaded or synced to any external server.
- **100% Offline & Self-Hosted OCR:** Text recognition runs entirely in your browser using local OCR (`tesseract.js` for Lithuanian and English). The WebAssembly core and trained language models are self-hosted and precached by the PWA Service Worker—no internet connection or external CDN required.
- **Photos Are Never Saved Anywhere:** Uploaded or captured images are processed strictly in temporary RAM (`blob:` URL + offscreen `<canvas>`) only for the few seconds needed to read the text. They are **never** saved to `IndexedDB`, `localStorage`, or any server, and a hard **30-second TTL watchdog** guarantees temporary image memory is forcibly cleared.

---

## ✨ Key Features

- **Full CRUD Data Table:** Create, view, edit, delete, and search structured records with automatic formatting and validation.
- **Read Accuracy Scoring:** Automatically evaluates extraction and validation quality (`0–100%`) for every entry with color-coded status badges (Green, Amber, Red).
- **Smart Local Photo Import & Multi-Candidate Selection:** Scan a photo or paste raw text to populate fields automatically. When multiple potential matches for a field are detected in a scan, the primary match fills the input and alternative matches appear as clickable chips below it.
- **Bilingual UI:** Supports **Lithuanian (`LT`)** as the primary default language and **English (`EN`)** as the secondary language in Settings.
- **Mobile & iPhone 16 Pro Ready PWA:** Safe-area aware layout (Dynamic Island & Home Indicator), light/dark theme support, and instant switching between a full Table view and a compact Mobile Card view.
- **Password-Protected Phone-to-PC Sync:** Export and import encrypted backups (`.airead` / `.json`) protected by authenticated **AES-256-GCM**, **PBKDF2** key derivation, and **SHA-256** tamper-proof checksums.

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Run tests
npm run test:run

# Build for production
npm run build
```

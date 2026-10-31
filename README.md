# aiRead

**aiRead** is an offline-first Progressive Web App (PWA) for scanning documents from photos, extracting structured fields locally on your device, managing records in a CRUD table, and exporting data to **CSV**, **XLSX**, or **JSON**.

---

## 🔒 100% Local & Private (Zero External Storage)

- **No External Servers or Cloud Storage:** All extracted records and settings stay strictly inside your browser's local storage (`IndexedDB` via Dexie) on your own device. Nothing is ever uploaded or synced to any external server.
- **No External AI or Paid APIs:** Text recognition runs entirely in your browser using open-source local OCR (`tesseract.js` for Lithuanian and English) combined with deterministic RegExp and heuristic parsers.
- **Photos Are Never Saved Anywhere:** Uploaded or captured images are processed strictly in temporary RAM (`blob:` URL + offscreen `<canvas>`) only for the few seconds needed to read the text. They are **never** saved to `IndexedDB`, `localStorage`, or any server, and a hard **30-second TTL watchdog** (`IMAGE_MEMORY_TTL_MS`) guarantees temporary image memory is forcibly cleared.

---

## ✨ Key Features

- **Structured CRUD Table:**
  - **Eil. Nr.** (Auto-numbered sequence)
  - **Vardas Pavardė** (Full Name)
  - **Adresas** (Address)
  - **Telefonas** (Phone — automatically normalized to `0-6XX-XXXXX`, e.g., `0-612-34567`)
  - **Valst. Nr.** (Vehicle License Plate)
  - **Modelis** (Vehicle Make & Model)
  - **Galiojimas** (Validity Period — `YYYY-MM-DD YYYY-MM-DD`, e.g., `2026-09-04 2027-09-04`, with a `+1 Year` quick action)
  - **Asmens kodas** (11-digit Lithuanian Personal Code with checksum validation)
  - **Tikslumas** (Read Accuracy Score `0–100%` with Red / Amber / Green badges)
- **Smart Local Photo Import & Multi-Candidate Chips:**
  - Scan a photo or paste text to auto-fill all fields.
  - When multiple values for a field (e.g., several addresses, phone numbers, names, or dates) are detected in a scan, the first match fills the input and the remaining matches appear as clickable selection chips right below that input.
- **Bilingual UI:**
  - **Lithuanian (`LT`)** as primary default language and **English (`EN`)** as secondary language.
- **Mobile & iPhone 16 Pro Ready PWA:**
  - Safe-area aware layout (Dynamic Island & Home Indicator), dark/light theme support, and instant switching between full Table view and compact Mobile Card view.
- **Data Export:**
  - Export your table anytime to **CSV** (UTF-8 with BOM for Excel compatibility), **XLSX** (native Excel workbook), or **JSON**.

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

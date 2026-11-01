import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import App from '../App';
import { db } from '../db/db';
import {
  calculateAccuracyScore,
  extractFullNameCandidates,
  extractLicensePlateCandidates,
  extractPhoneCandidates,
  formatPhoneNumber,
  formatValidPeriod,
  isValidCalendarDate,
  isValidLithuanianPersonalCode,
  normalizeSingleDate,
  parseDocumentCandidates,
  parseDocumentText,
  toLithuanianTitleCase,
} from '../utils/parser';
import * as ocrModule from '../utils/ocr';
import {
  cleanupAllEphemeralResources,
  getActiveEphemeralResourceCount,
  IMAGE_MEMORY_TTL_MS,
  registerEphemeralResource,
} from '../utils/ocr';
import {
  generateCsvContent,
  generateJsonContent,
  generateXlsxBuffer,
} from '../utils/export';

describe('Parser, Accuracy Scoring & Multi-Candidate Utilities', () => {
  it('normalizes Lithuanian phone numbers without forcing output format', () => {
    expect(formatPhoneNumber('+370 612 34567')).toBe('+37061234567');
    expect(formatPhoneNumber('8 612 34567')).toBe('861234567');
    expect(formatPhoneNumber('869911223')).toBe('869911223');
    expect(formatPhoneNumber('061234567')).toBe('061234567');
    expect(formatPhoneNumber('+3705249226')).toBe('+3705249226');
  });

  it('normalizes validity period start and end dates into YYYY-MM-DD YYYY-MM-DD', () => {
    expect(formatValidPeriod('2026.09.04 - 2027.09.04')).toBe('2026-09-04 2027-09-04');
    expect(formatValidPeriod('Galioja nuo 04/09/2026 iki 04/09/2027')).toBe(
      '2026-09-04 2027-09-04'
    );
    expect(formatValidPeriod('2026-09-04', true)).toBe('2026-09-04 2027-09-04');
  });

  it('validates Lithuanian 11-digit personal code modulo-11 checksum and calculates accuracy score', () => {
    // 38504121234 has a valid modulo-11 checksum (4)
    expect(isValidLithuanianPersonalCode('38504121234')).toBe(true);
    // 38504121230 has valid date pattern but invalid checksum
    expect(isValidLithuanianPersonalCode('38504121230')).toBe(false);
    expect(isValidLithuanianPersonalCode('12345')).toBe(false);

    const perfectFields = {
      fullName: 'Jonas Jonaitis',
      address: 'Gedimino pr. 15-4, LT-01103 Vilnius',
      phone: '0-612-34567',
      licensePlate: 'ABC 123',
      carModel: 'TOYOTA COROLLA',
      validPeriod: '2026-09-04 2027-09-04',
      personalCode: '38504121234',
    };
    expect(calculateAccuracyScore(perfectFields)).toBe(100);
    // Blended with 80% fieldScore (100) + 20% ocrConfidence (50) => 90
    expect(calculateAccuracyScore(perfectFields, 50)).toBe(90);

    const lowFields = {
      fullName: 'Jonas',
      address: '',
      phone: '',
      licensePlate: '',
      carModel: '',
      validPeriod: '',
      personalCode: '',
    };
    expect(calculateAccuracyScore(lowFields)).toBe(5);
  });

  it('rejects impossible calendar dates and extracts correct EV license plates', () => {
    expect(isValidCalendarDate(2026, 2, 31)).toBe(false);
    expect(isValidCalendarDate(2026, 4, 31)).toBe(false);
    expect(isValidCalendarDate(2024, 2, 29)).toBe(true);
    expect(isValidCalendarDate(2025, 2, 29)).toBe(false);

    expect(normalizeSingleDate('2026-02-31')).toBeNull();
    expect(normalizeSingleDate('2026-04-31')).toBeNull();
    expect(normalizeSingleDate('2026-05-15')).toBe('2026-05-15');

    // EV License plate must not produce truncated 'EA123'
    const plateCandidates = extractLicensePlateCandidates('Valst. nr. EA1234');
    expect(plateCandidates).toEqual(['EA1234']);
    expect(plateCandidates).not.toContain('EA123');
  });

  it('extracts all 7 fields and multi-candidate suggestions from Lithuanian document OCR text', () => {
    const sampleOcr = `
      Vardas, pavardė: Jonas Jonaitis
      Valdytojas: Petras Petraitis
      Asmens kodas: 38504121234
      Adresas: Žirgų g. 12
      Deklaruota gyv. vieta: Kauno g. 15
      Ryto g. 13
      Tel.: +370 612 34567
      Mob.: +370 699 11223
      Valst. nr.: ABC 123
      Markė, modelis: TOYOTA COROLLA
      Galioja nuo 2026-09-04 iki 2027-09-04
    `;

    const parsed = parseDocumentText(sampleOcr);
    expect(parsed.fullName).toBe('Jonas Jonaitis');
    expect(parsed.personalCode).toBe('38504121234');
    expect(parsed.address).toBe('Žirgų g. 12');
    expect(parsed.phone).toBe('+37061234567');
    expect(parsed.licensePlate).toBe('ABC 123');
    expect(parsed.carModel).toBe('TOYOTA COROLLA');
    expect(parsed.validPeriod).toBe('2026-09-04 2027-09-04');

    const candidates = parseDocumentCandidates(sampleOcr);
    expect(candidates.address).toEqual(['Žirgų g. 12', 'Kauno g. 15', 'Ryto g. 13']);
    expect(candidates.fullName).toEqual(['Jonas Jonaitis', 'Petras Petraitis']);
    expect(candidates.phone).toEqual(['+37061234567', '+37069911223']);
  });

  it('normalizes ALL-CAPS, mixed-case, and hyphenated names into Lithuanian Title Case', () => {
    expect(toLithuanianTitleCase('IRENA POCEVIČIENĖ')).toBe('Irena Pocevičienė');
    expect(toLithuanianTitleCase('REMIGIJUS VYŠNIAUSKAS')).toBe('Remigijus Vyšniauskas');
    expect(toLithuanianTitleCase('VAIDA MULERSKAITĖ-VACZYNSKA')).toBe(
      'Vaida Mulerskaitė-Vaczynska'
    );
    expect(toLithuanianTitleCase('vaida mulerskaitė-vaczynska')).toBe(
      'Vaida Mulerskaitė-Vaczynska'
    );
    expect(toLithuanianTitleCase('JONAS-VYTAUTAS JONAITIS')).toBe('Jonas-Vytautas Jonaitis');
    expect(toLithuanianTitleCase('ĄŽUOLAS ŪSAS')).toBe('Ąžuolas Ūsas');
  });

  it('extracts full name from multi-line / stacked column layouts (header on line N, value on line N+1)', () => {
    // Layout like "If" policy: stacked header with English translation, value on next line
    const ifDoc = `
      Vardas, pavardė arba įmonės pavadinimas / Name or Company Name
      VAIDA MULERSKAITĖ-VACZYNSKA
      Asmens kodas / Registration number
      49012120000
    `;
    const ifParsed = parseDocumentText(ifDoc);
    expect(ifParsed.fullName).toBe('Vaida Mulerskaitė-Vaczynska');

    // Layout like "Balcia" policy
    const balciaDoc = `
      Draudėjas
      IRENA POCEVIČIENĖ
      Asmens kodas: 46711181234
    `;
    const balciaParsed = parseDocumentText(balciaDoc);
    expect(balciaParsed.fullName).toBe('Irena Pocevičienė');

    // Layout like "BTA" policy with colon on header line
    const btaDoc = `
      Draudėjas:
      REMIGIJUS VYŠNIAUSKAS
      Poliso Nr.: BTA-12345
    `;
    const btaParsed = parseDocumentText(btaDoc);
    expect(btaParsed.fullName).toBe('Remigijus Vyšniauskas');
  });

  it('combines separate Vardas and Pavardė fields in single-row and column formats into standard Vardas Pavardė order', () => {
    // Single row: Vardas then Pavardė
    const singleRow1 = 'Vardas: Jonas Pavardė: Jonaitis';
    expect(parseDocumentText(singleRow1).fullName).toBe('Jonas Jonaitis');

    // Single row: Pavardė then Vardas
    const singleRow2 = 'Pavardė: Jonaitis Vardas: Jonas';
    expect(parseDocumentText(singleRow2).fullName).toBe('Jonas Jonaitis');

    // Single row multilingual
    const singleRow3 = 'Vardas / Given name: Jonas Pavardė / Surname: Jonaitis';
    expect(parseDocumentText(singleRow3).fullName).toBe('Jonas Jonaitis');

    // Multi-line column layout
    const multiLine = `
      1. Pavardė: Jonaitis
      2. Vardas: Jonas
    `;
    expect(parseDocumentText(multiLine).fullName).toBe('Jonas Jonaitis');

    // Multi-line reversed column layout
    const multiLineReversed = `
      Vardas: Jonas
      Pavardė: Jonaitis
    `;
    expect(parseDocumentText(multiLineReversed).fullName).toBe('Jonas Jonaitis');
  });

  it('extracts and formats names from Regitra certificates and driving license numbering', () => {
    // Regitra vehicle registration certificate (C.1.1 Surname, C.1.2 Given name)
    const regitraDoc = `
      C.1.1 Jonaitis
      C.1.2 Jonas
      C.1.3 Vilniaus g. 10
    `;
    expect(parseDocumentText(regitraDoc).fullName).toBe('Jonas Jonaitis');

    // Regitra certificate on single row with ALL CAPS
    const regitraSingleRow = 'C.1.1 JONAITIS C.1.2 JONAS';
    expect(parseDocumentText(regitraSingleRow).fullName).toBe('Jonas Jonaitis');

    // Driving license EU standard numbering (1. Surname, 2. Given name)
    const licenseDoc = `
      1. Pavardė / Surname
      JONAITIS
      2. Vardas / Given name
      JONAS
      3. 1980.01.01 Vilnius
    `;
    expect(parseDocumentText(licenseDoc).fullName).toBe('Jonas Jonaitis');

    // Driving license compact numbering without labels
    const compactLicense = `
      1. JONAITIS
      2. JONAS
      3. 1985-05-15
    `;
    expect(parseDocumentText(compactLicense).fullName).toBe('Jonas Jonaitis');
  });

  it('handles compound headers with multiple fields and extracts cleanly', () => {
    const compoundDoc = 'Vardas, Pavardė, Gimimo data: IRENA POCEVIČIENĖ, 1967-11-18';
    expect(parseDocumentText(compoundDoc).fullName).toBe('Irena Pocevičienė');
  });

  it('rejects document boilerplate and false-positive phrases from name extraction', () => {
    const boilerplateDocs = [
      'Vardas, pavardė arba įmonės pavadinimas / Name or Company Name',
      'Būsto draudimas',
      'Butas Apsauga',
      'sumoka visą',
      'mokėtina suma',
      'Swedbank lizingas',
      'Civilinė atsakomybė',
      'UAB Švarus Pasaulis',
    ];

    for (const doc of boilerplateDocs) {
      const candidates = extractFullNameCandidates(doc);
      expect(candidates).toEqual([]);
    }
  });
});

describe('Ephemeral Image Memory Hard TTL Watchdog', () => {
  it('automatically revokes blob URLs, zeroes canvases, and terminates workers after 30s TTL or manual cleanup', async () => {
    vi.useFakeTimers();
    try {
      expect(IMAGE_MEMORY_TTL_MS).toBe(30_000);
      const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 800;
      const terminateMock = vi.fn().mockResolvedValue(undefined);

      registerEphemeralResource({
        objectUrl: 'blob:test-ephemeral-1',
        canvas,
        worker: { terminate: terminateMock },
      });

      expect(getActiveEphemeralResourceCount()).toBe(1);

      // Advance past 30-second TTL watchdog
      vi.advanceTimersByTime(IMAGE_MEMORY_TTL_MS + 10);
      await Promise.resolve();

      expect(getActiveEphemeralResourceCount()).toBe(0);
      expect(revokeSpy).toHaveBeenCalledWith('blob:test-ephemeral-1');
      expect(canvas.width).toBe(0);
      expect(canvas.height).toBe(0);
      expect(terminateMock).toHaveBeenCalledTimes(1);

      // Also verify immediate cleanupAllEphemeralResources()
      const canvas2 = document.createElement('canvas');
      canvas2.width = 500;
      canvas2.height = 500;
      registerEphemeralResource({
        objectUrl: 'blob:test-ephemeral-2',
        canvas: canvas2,
      });
      expect(getActiveEphemeralResourceCount()).toBe(1);

      cleanupAllEphemeralResources();
      expect(getActiveEphemeralResourceCount()).toBe(0);
      expect(revokeSpy).toHaveBeenCalledWith('blob:test-ephemeral-2');
      expect(canvas2.width).toBe(0);
      expect(canvas2.height).toBe(0);

      revokeSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Export Utilities (CSV, XLSX, JSON)', () => {
  const sampleRecords = [
    {
      id: 1,
      fullName: 'Jonas Jonaitis',
      address: 'Gedimino pr. 15-4, Vilnius',
      phone: '0-612-34567',
      licensePlate: 'ABC 123',
      carModel: 'VOLKSWAGEN PASSAT',
      validPeriod: '2026-09-04 2027-09-04',
      personalCode: '38504121234',
      accuracyScore: 100,
      createdAt: '2026-09-04T10:00:00.000Z',
      updatedAt: '2026-09-04T10:00:00.000Z',
    },
  ];

  it('generates UTF-8 BOM CSV with Lithuanian headers, Eil. Nr., and Tikslumas', () => {
    const csv = generateCsvContent(sampleRecords, 'lt');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(
      'Eil. Nr.,Vardas Pavardė,Adresas,Telefonas,Valst. Nr.,Modelis,Galiojimas,Asmens kodas,Tikslumas'
    );
    expect(csv).toContain(
      '1,Jonas Jonaitis,"Gedimino pr. 15-4, Vilnius",0-612-34567,ABC 123,VOLKSWAGEN PASSAT,2026-09-04 2027-09-04,38504121234,100%'
    );
  });

  it('escapes CSV cells with formula injection characters (=, +, -, @, \\t, \\r)', () => {
    const injectionRecords = [
      {
        id: 1,
        fullName: '=SUM(A1:A10)',
        address: '+370 Vilnius',
        phone: '-123456',
        licensePlate: '@MALICIOUS',
        carModel: '\tAUDI',
        validPeriod: '\r2026-09-04',
        personalCode: '38504121234',
        accuracyScore: 100,
        createdAt: '2026-09-04T10:00:00.000Z',
        updatedAt: '2026-09-04T10:00:00.000Z',
      },
    ];
    const csv = generateCsvContent(injectionRecords, 'lt');
    expect(csv).toContain("'=SUM(A1:A10)");
    expect(csv).toContain("'+370 Vilnius");
    expect(csv).toContain("'-123456");
    expect(csv).toContain("'@MALICIOUS");
  });

  it('generates JSON and XLSX buffer with localized columns including Tikslumas / Accuracy', () => {
    const json = generateJsonContent(sampleRecords, 'lt');
    const parsed = JSON.parse(json);
    expect(parsed[0]['Eil. Nr.']).toBe(1);
    expect(parsed[0]['Vardas Pavardė']).toBe('Jonas Jonaitis');
    expect(parsed[0]['Modelis']).toBe('VOLKSWAGEN PASSAT');
    expect(parsed[0]['Tikslumas']).toBe('100%');

    const xlsxBuf = generateXlsxBuffer(sampleRecords, 'lt');
    expect(xlsxBuf.byteLength).toBeGreaterThan(100);
    const workbook = XLSX.read(xlsxBuf, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(firstSheet);
    expect(rows[0]['Tikslumas']).toBe('100%');
  });
});

describe('aiRead CRUD, Accuracy Badges, Multi-Candidate Import & Bulk Staging Queue', () => {
  it('renders green (>=80%) and red (<50%) accuracy badges in the table and supports CRUD without saving images', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('aiRead')).toBeInTheDocument();
    expect(screen.getByText('Naujas įrašas')).toBeInTheDocument();

    // 1. Create a high-accuracy record (>= 80% -> green badge)
    await user.click(screen.getByRole('button', { name: /Naujas įrašas/i }));
    const dialog = screen.getByRole('dialog');

    // Empty columns notice banner and badges are initially visible for all 7 empty fields
    expect(within(dialog).getByTestId('modal-empty-columns-notice')).toBeInTheDocument();
    expect(within(dialog).getByTestId('modal-empty-badge-fullName')).toBeInTheDocument();

    // Clicking an empty column chip in the summary banner focuses that input
    await user.click(within(dialog).getByTestId('modal-jump-empty-fullName'));
    expect(within(dialog).getByLabelText(/Vardas Pavardė/i)).toHaveFocus();

    await user.type(within(dialog).getByLabelText(/Vardas Pavardė/i), 'Petras Petraitis');
    expect(within(dialog).queryByTestId('modal-empty-badge-fullName')).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Asmens kodas/i), '38504121234');
    await user.type(within(dialog).getByLabelText(/Telefonas/i), '+370 612 34567');
    await user.type(within(dialog).getByLabelText(/Adresas/i), 'Laisvės al. 10, Kaunas');
    await user.type(within(dialog).getByLabelText(/Valst\. Nr\./i), 'kmn 456');
    await user.type(within(dialog).getByLabelText(/Modelis/i), 'audi a6');
    await user.type(within(dialog).getByLabelText(/Galiojimas/i), '2026.09.04 - 2027.09.04');

    // All 7 columns are now filled -> green completion banner is shown
    expect(within(dialog).getByTestId('modal-all-columns-filled')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Išsaugoti įrašą/i }));

    // Verify table row renders formatted values and green accuracy badge
    expect(await screen.findByText('Petras Petraitis')).toBeInTheDocument();
    expect(screen.getByText('+37061234567')).toBeInTheDocument();
    expect(screen.getByText('KMN 456')).toBeInTheDocument();
    expect(screen.getByText('AUDI A6')).toBeInTheDocument();
    expect(screen.getByText('2026-09-04 2027-09-04')).toBeInTheDocument();
    expect(screen.getByText('38504121234')).toBeInTheDocument();

    const greenBadge = screen.getByTestId('accuracy-badge-1');
    expect(greenBadge).toHaveTextContent('100%');
    expect(greenBadge.className).toContain('bg-emerald-500/15');

    // 2. Create a low-accuracy record (< 50% -> red badge)
    await user.click(screen.getByRole('button', { name: /Naujas įrašas/i }));
    const dialog2 = screen.getByRole('dialog');
    await user.type(within(dialog2).getByLabelText(/Vardas Pavardė/i), 'Jonas');
    await user.click(within(dialog2).getByRole('button', { name: /Išsaugoti įrašą/i }));

    const redBadge = await screen.findByTestId('accuracy-badge-2');
    expect(redBadge).toHaveTextContent('5%');
    expect(redBadge.className).toContain('bg-red-500/15');

    // Verify database record has zero image fields
    const stored = await db.records.toArray();
    expect(stored).toHaveLength(2);
    expect('imageDataUrl' in stored[0]).toBe(false);

    // Switch language to English in Settings via header Settings button
    await user.click(screen.getByRole('button', { name: /Nustatymai|Settings/i }));
    await user.click(screen.getByRole('button', { name: 'English' }));
    await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: /Table/i }));
    expect(screen.getByText('Add Record')).toBeInTheDocument();
    expect(screen.getByText('Validity Period')).toBeInTheDocument();
    expect(screen.getByText('Accuracy')).toBeInTheDocument();
  });

  it('extracts fields and renders clickable multi-candidate chips and center + icon in Import tab', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Click the Instagram-style center + button in bottom navigation
    const centerPlusBtn = screen.getByTestId('center-plus-import-btn');
    await user.click(centerPlusBtn);

    // Verify single image import dropzone has the prominent center + icon
    expect(screen.getByTestId('single-image-import-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('single-image-plus-icon')).toBeInTheDocument();

    const rawTextarea = screen.getByLabelText(/Nuskaitytas tekstas/i);
    await user.type(
      rawTextarea,
      [
        'Klientas: Onaitytė Rasa',
        'Valdytojas: Jonas Jonaitis',
        'A.k. 38504121234',
        'Tel. 8 655 44332',
        'Mob. +370 612 34567',
        'Adresas: Žirgų g. 12',
        'Kauno g. 15',
        'Ryto g. 13',
        'Valst. nr. XYZ 789',
        'VOLVO XC60',
        'Galioja 2026-09-04 - 2027-09-04',
      ].join('\n')
    );

    const addressInput = screen.getByLabelText(/Adresas/i);
    expect(addressInput).toHaveValue('Žirgų g. 12');

    // Alternative addresses appear as clickable chips below the Adresas input
    const addressChipsContainer = screen.getByTestId('candidates-address');
    const kaunoChip = within(addressChipsContainer).getByRole('button', { name: 'Kauno g. 15' });
    const rytoChip = within(addressChipsContainer).getByRole('button', { name: 'Ryto g. 13' });
    expect(kaunoChip).toBeInTheDocument();
    expect(rytoChip).toBeInTheDocument();

    // Clicking "Kauno g. 15" chip fills the Adresas input with "Kauno g. 15"
    await user.click(kaunoChip);
    expect(addressInput).toHaveValue('Kauno g. 15');
    // And "Žirgų g. 12" is now offered as an alternative chip
    expect(
      within(screen.getByTestId('candidates-address')).getByRole('button', { name: 'Žirgų g. 12' })
    ).toBeInTheDocument();

    // Alternative phone chip works too
    const phoneInput = screen.getByLabelText(/Telefonas/i);
    expect(phoneInput).toHaveValue('865544332');
    const altPhoneChip = within(screen.getByTestId('candidates-phone')).getByRole('button', {
      name: '+37061234567',
    });
    await user.click(altPhoneChip);
    expect(phoneInput).toHaveValue('+37061234567');

    await user.click(screen.getByRole('button', { name: /Išsaugoti įrašą/i }));

    expect(await screen.findByText('XYZ 789')).toBeInTheDocument();
    expect(screen.getByText('Kauno g. 15')).toBeInTheDocument();
    expect(screen.getByText('+37061234567')).toBeInTheDocument();
  });

  it('processes bulk uploaded images sequentially into db.stagingRecords with imageName and zero photo binary persistence, then verifies and approves one-by-one into db.records', async () => {
    const extractSpy = vi
      .spyOn(ocrModule, 'extractTextAndConfidenceFromImageFile')
      .mockImplementation(async (file: File) => {
        if (file.name === 'scan_1.jpg') {
          return {
            text: [
              'Klientas: Jonas Jonaitis',
              'Asmens kodas: 38504121234',
              'Adresas: Žirgų g. 12',
              'Kauno g. 15',
              'Tel.: +370 612 34567',
              'Valst. nr.: ABC 123',
              'TOYOTA COROLLA',
              'Galioja 2026-09-04 - 2027-09-04',
            ].join('\n'),
            confidence: 95,
          };
        }
        return {
          text: ['Klientas: Petras', 'Valst. nr.: KMN 999'].join('\n'),
          confidence: 40,
        };
      });

    try {
      const user = userEvent.setup();
      render(<App />);

      // Navigate to Masinis (Bulk) tab
      await user.click(screen.getByRole('button', { name: /Masinis/i }));
      expect(screen.getByText('Masinis įkėlimas ir patikra')).toBeInTheDocument();

      const fileInput = screen.getByTestId('bulk-file-input');
      const file1 = new File(['dummy-1'], 'scan_1.jpg', { type: 'image/jpeg' });
      const file2 = new File(['dummy-2'], 'scan_2.jpg', { type: 'image/jpeg' });

      await user.upload(fileInput, [file1, file2]);

      // Wait for both items to appear in staging queue
      expect(await screen.findByTestId('one-by-one-wizard')).toBeInTheDocument();
      const stagingTable = screen.getByTestId('staging-queue-table');
      expect(await within(stagingTable).findByText('scan_2.jpg')).toBeInTheDocument();
      expect(within(stagingTable).getByText('scan_1.jpg')).toBeInTheDocument();
      expect(screen.getByTestId('wizard-image-name')).toHaveTextContent('scan_1.jpg');

      // 1. Verify db.stagingRecords has both items with imageName, candidates, rawText, accuracyScore, and ZERO image binary/base64 data
      const stagedInDb = await db.stagingRecords.orderBy('id').toArray();
      expect(stagedInDb).toHaveLength(2);
      expect(stagedInDb[0].imageName).toBe('scan_1.jpg');
      expect(stagedInDb[0].fullName).toBe('Jonas Jonaitis');
      expect(stagedInDb[0].candidates.address).toEqual(['Žirgų g. 12', 'Kauno g. 15']);
      expect('imageDataUrl' in stagedInDb[0]).toBe(false);
      expect('blob' in stagedInDb[0]).toBe(false);
      expect(stagedInDb[1].imageName).toBe('scan_2.jpg');

      // Main records table must still be empty until approved!
      expect(await db.records.count()).toBe(0);

      // 3. In the One-by-One Verification Wizard for scan_1.jpg, click candidate chip "Kauno g. 15"
      const wizard = screen.getByTestId('one-by-one-wizard');
      const kaunoChip = within(wizard).getByRole('button', { name: 'Kauno g. 15' });
      await user.click(kaunoChip);
      expect(within(wizard).getByLabelText(/Adresas/i)).toHaveValue('Kauno g. 15');

      // Click "Patvirtinti ir toliau ->" (Approve & Next)
      await user.click(screen.getByTestId('approve-and-next-btn'));

      // Verify scan_1.jpg moved to db.records and wizard advanced to scan_2.jpg
      expect(await screen.findByTestId('wizard-image-name')).toHaveTextContent('scan_2.jpg');

      // scan_2.jpg only has fullName and licensePlate, so empty columns notice banner is shown in staging wizard
      expect(within(wizard).getByTestId('staging-empty-columns-notice')).toBeInTheDocument();
      expect(within(wizard).getByTestId('staging-empty-badge-address')).toBeInTheDocument();

      const remainingStaged = await db.stagingRecords.toArray();
      expect(remainingStaged).toHaveLength(1);
      expect(remainingStaged[0].imageName).toBe('scan_2.jpg');

      const approvedRecords = await db.records.toArray();
      expect(approvedRecords).toHaveLength(1);
      expect(approvedRecords[0].imageName).toBe('scan_1.jpg');
      expect(approvedRecords[0].fullName).toBe('Jonas Jonaitis');
      expect(approvedRecords[0].address).toBe('Kauno g. 15');
    } finally {
      extractSpy.mockRestore();
    }
  });

  it('keeps active staged record locked by activeStagingId when editing with lowest-first sorting enabled', async () => {
    const user = userEvent.setup();
    // Add two records directly to staging: item 1 (low score) and item 2 (high score)
    await db.stagingRecords.clear();
    await db.stagingRecords.add({
      rawText: "",
      candidates: { fullName: [], address: [], phone: [], licensePlate: [], carModel: [], validPeriod: [], personalCode: [] },
      imageName: 'first.jpg',
      fullName: 'Jonas',
      address: '',
      phone: '',
      licensePlate: '',
      carModel: '',
      validPeriod: '',
      personalCode: '',
      accuracyScore: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.stagingRecords.add({
      rawText: "",
      candidates: { fullName: [], address: [], phone: [], licensePlate: [], carModel: [], validPeriod: [], personalCode: [] },
      imageName: 'second.jpg',
      fullName: 'Petras Petraitis',
      address: 'Gedimino pr. 10',
      phone: '0-612-34567',
      licensePlate: 'ABC 123',
      carModel: 'TOYOTA COROLLA',
      validPeriod: '2026-09-04 2027-09-04',
      personalCode: '38504121234',
      accuracyScore: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    render(<App />);

    // Go to Bulk tab
    await user.click(screen.getByRole('button', { name: /Masinis/i }));
    expect(await screen.findByTestId('one-by-one-wizard')).toBeInTheDocument();

    // Enable lowest-accuracy sort
    const sortBtn = screen.getByRole('button', { name: /Rikiuoti:/i });
    await user.click(sortBtn);

    // Verify first.jpg is active
    expect(screen.getByTestId('wizard-image-name')).toHaveTextContent('first.jpg');

    // Type full name to change accuracy score
    const nameInput = within(screen.getByTestId('one-by-one-wizard')).getByLabelText(/Vardas Pavardė/i);
    await user.type(nameInput, ' Jonaitis');

    // Verify wizard remains locked on first.jpg even though accuracy score changed
    expect(screen.getByTestId('wizard-image-name')).toHaveTextContent('first.jpg');
    expect(nameInput).toHaveValue('Jonas Jonaitis');
  });

  it('recovers from per-file OCR error in bulk upload and continues processing subsequent files', async () => {
    const extractSpy = vi
      .spyOn(ocrModule, 'extractTextAndConfidenceFromImageFile')
      .mockImplementation(async (file: File) => {
        if (file.name === 'corrupted.jpg') {
          throw new Error('Corrupted image data');
        }
        return {
          text: 'Vardas, pavardė: Kazys Kazlauskas\nValst. nr.: CBA 321',
          confidence: 80,
        };
      });

    try {
      const user = userEvent.setup();
      await db.stagingRecords.clear();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /Masinis/i }));
      const fileInput = screen.getByTestId('bulk-file-input');

      const corruptedFile = new File(['bad-data'], 'corrupted.jpg', { type: 'image/jpeg' });
      const validFile = new File(['good-data'], 'valid.jpg', { type: 'image/jpeg' });

      await user.upload(fileInput, [corruptedFile, validFile]);

      // Verify both items were queued into db.stagingRecords, corrupted has accuracyScore 0
      const staged = await db.stagingRecords.orderBy('id').toArray();
      expect(staged).toHaveLength(2);
      expect(staged[0].imageName).toBe('corrupted.jpg');
      expect(staged[0].accuracyScore).toBe(0);
      expect(staged[1].imageName).toBe('valid.jpg');
      expect(staged[1].fullName).toBe('Kazys Kazlauskas');
    } finally {
      extractSpy.mockRestore();
    }
  });

  it('toggles between light and dark theme', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Open Settings from header
    await user.click(screen.getByRole('button', { name: /Nustatymai|Settings/i }));
    const toggleButton = screen.getByRole('button', { name: /Toggle theme/i });
    expect(document.documentElement.classList.contains('light')).toBe(true);

    await user.click(toggleButton);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('aiRead_theme')).toBe('dark');
  });

  it('opens RecordModal and closes on Escape and backdrop-click', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Click Add New button
    await user.click(screen.getByRole('button', { name: /Naujas įrašas/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Press Escape
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Open again
    await user.click(screen.getByRole('button', { name: /Naujas įrašas/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    // Click backdrop
    await user.click(dialog);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('extracts validity period accurately from all 6 insurance policy layouts', () => {
    // 1. Table format with 2-digit years
    const sample1 = `
      GALIOJA / VALID
      Nuo / From Iki / To
      Metų / Year Mėn. / Month Dienos / Day Val., min. / Time Metų / Year Mėn. / Month Dienos / Day Val., min. / Time
      26 11 15 00:00 27 11 14 24:00
    `;
    expect(parseDocumentText(sample1).validPeriod).toBe('2026-11-15 2027-11-14');

    // 2. Dots in dates with time
    const sample2 = `
      Draudimo grupė: Bendrosios civilinės atsakomybės draudimas
      Draudimo laikotarpis
      Nuo: 2026.11.14 00:00    Iki: 2027.11.13 23:59
      Draudėjas
    `;
    expect(parseDocumentText(sample2).validPeriod).toBe('2026-11-14 2027-11-13');

    // 3. Multi-line label with en-dash
    const sample3 = `
      tel. +370 5 210 8888
      Draudimo 2026-10-28 11:02 – 2027-10-27 23:59
      liudijimo galiojimo
      periodas
    `;
    expect(parseDocumentText(sample3).validPeriod).toBe('2026-10-28 2027-10-27');

    // 4. Terminas with nuo ... iki and trailing period
    const sample4 = `
      Draudimo sutarties terminas: nuo 2026-10-29 14:30 iki 2027-10-29 00:00.
    `;
    expect(parseDocumentText(sample4).validPeriod).toBe('2026-10-29 2027-10-29');

    // 5. Laikotarpis with val. suffix
    const sample5 = `
      Draudimo laikotarpis:
      Nuo 2026-10-23 14:45 val.    Iki 2027-10-22 23:59 val.
    `;
    expect(parseDocumentText(sample5).validPeriod).toBe('2026-10-23 2027-10-22');

    // 6. Pradžia: and Pabaiga: lines
    const sample6 = `
      Numatomas draudimo laikotarpis:  Pradžia: 2026-11-05 00:00 val.
                                       Pabaiga: 2027-11-05 00:00 val.
    `;
    expect(parseDocumentText(sample6).validPeriod).toBe('2026-11-05 2027-11-05');
  });

  it('leaves validPeriod empty by default when document is unscannable or has no date', () => {
    // Empty / unscannable text
    expect(parseDocumentText('').validPeriod).toBe('');
    expect(parseDocumentCandidates('').validPeriod).toEqual([]);

    // Document with text but no dates
    const noDatesSample = `
      Vardas, pavardė: Jonas Jonaitis
      Adresas: Vilniaus g. 10
      Valst. nr.: ABC 123
      Markė: TOYOTA
    `;
    expect(parseDocumentText(noDatesSample).validPeriod).toBe('');
    expect(parseDocumentCandidates(noDatesSample).validPeriod).toEqual([]);

    // Document with an unrelated single birth date: must not auto-generate a validPeriod!
    const birthDateOnly = `
      Vardas: Petras
      Pavardė: Petraitis
      Gimimo data: 1985-04-12
    `;
    expect(parseDocumentText(birthDateOnly).validPeriod).toBe('');
    expect(parseDocumentCandidates(birthDateOnly).validPeriod).toEqual([]);
  });

  it('allows PDF files in both SingleImportTab and BulkStagingTab file inputs', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Single Import Tab
    await user.click(screen.getByRole('button', { name: /Importas/i }));
    const singleInput = screen.getByTestId('single-image-file-input');
    expect(singleInput.getAttribute('accept')).toContain('application/pdf');

    // Bulk Staging Tab
    await user.click(screen.getByRole('button', { name: /Masinis/i }));
    const bulkInput = screen.getByTestId('bulk-file-input');
    expect(bulkInput.getAttribute('accept')).toContain('application/pdf');
  });
  it('extracts phone numbers in multiple formats without output format and provides selection chips for multiple numbers', () => {
    // Single number in international +370 format (Image 1: Tel. / Phone No. +3705249226)
    const sampleImage1 = `
      Tel. / Phone No.
      +3705249226
    `;
    expect(parseDocumentText(sampleImage1).phone).toBe('+3705249226');
    expect(extractPhoneCandidates(sampleImage1)).toEqual(['+3705249226']);

    // Multiple numbers on same line with semicolon (Image 2: Tel. 067466499; 37067466499)
    const sampleImage2 = `
      ŠILALĖS G. 6, KIENŲ K., VILNIAUS R.
      Tel. 067466499; 37067466499
    `;
    const parsedImg2 = parseDocumentText(sampleImage2);
    expect(parsedImg2.phone).toBe('067466499');
    const candidatesImg2 = extractPhoneCandidates(sampleImage2);
    expect(candidatesImg2).toEqual(['067466499', '37067466499']);

    // Support +37061234567, 861234567, 061234567 without output format
    expect(parseDocumentText('Tel. +37061234567').phone).toBe('+37061234567');
    expect(parseDocumentText('Tel. 861234567').phone).toBe('861234567');
    expect(parseDocumentText('Tel. 061234567').phone).toBe('061234567');
  });

});

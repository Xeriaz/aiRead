import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import App from '../App';
import { db } from '../db/db';
import {
  calculateAccuracyScore,
  formatPhoneNumber,
  formatValidPeriod,
  isValidLithuanianPersonalCode,
  parseDocumentCandidates,
  parseDocumentText,
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
  it('normalizes Lithuanian phone numbers into 0-6XX-XXXXX format', () => {
    expect(formatPhoneNumber('+370 612 34567')).toBe('0-612-34567');
    expect(formatPhoneNumber('8 612 34567')).toBe('0-612-34567');
    expect(formatPhoneNumber('869911223')).toBe('0-699-11223');
    expect(formatPhoneNumber('061234567')).toBe('0-612-34567');
    expect(formatPhoneNumber('0-612-34567')).toBe('0-612-34567');
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
    expect(parsed.phone).toBe('0-612-34567');
    expect(parsed.licensePlate).toBe('ABC 123');
    expect(parsed.carModel).toBe('TOYOTA COROLLA');
    expect(parsed.validPeriod).toBe('2026-09-04 2027-09-04');

    const candidates = parseDocumentCandidates(sampleOcr);
    expect(candidates.address).toEqual(['Žirgų g. 12', 'Kauno g. 15', 'Ryto g. 13']);
    expect(candidates.fullName).toEqual(['Jonas Jonaitis', 'Petras Petraitis']);
    expect(candidates.phone).toEqual(['0-612-34567', '0-699-11223']);
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
    expect(screen.getByText('0-612-34567')).toBeInTheDocument();
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

    // Switch language to English
    await user.click(screen.getByRole('button', { name: /Toggle language/i }));
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
    expect(phoneInput).toHaveValue('0-655-44332');
    const altPhoneChip = within(screen.getByTestId('candidates-phone')).getByRole('button', {
      name: '0-612-34567',
    });
    await user.click(altPhoneChip);
    expect(phoneInput).toHaveValue('0-612-34567');

    await user.click(screen.getByRole('button', { name: /Išsaugoti įrašą/i }));

    expect(await screen.findByText('XYZ 789')).toBeInTheDocument();
    expect(screen.getByText('Kauno g. 15')).toBeInTheDocument();
    expect(screen.getByText('0-612-34567')).toBeInTheDocument();
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

  it('toggles between light and dark theme', async () => {
    const user = userEvent.setup();
    render(<App />);

    const toggleButton = screen.getByRole('button', { name: /Toggle theme/i });
    expect(document.documentElement.classList.contains('light')).toBe(true);

    await user.click(toggleButton);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('aiRead_theme')).toBe('dark');
  });
});

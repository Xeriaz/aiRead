import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { db } from '../db/db';
import {
  formatPhoneNumber,
  formatValidPeriod,
  parseDocumentText,
} from '../utils/parser';
import {
  generateCsvContent,
  generateJsonContent,
  generateXlsxBuffer,
} from '../utils/export';

describe('Parser & Normalization Utilities', () => {
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

  it('extracts all 7 fields from Lithuanian document OCR text', () => {
    const sampleOcr = `
      Vardas, pavardė: Jonas Jonaitis
      Asmens kodas: 38504121234
      Adresas: Gedimino pr. 15-4, LT-01103 Vilnius
      Tel.: +370 612 34567
      Valst. nr.: ABC 123
      Markė, modelis: TOYOTA COROLLA
      Galioja nuo 2026-09-04 iki 2027-09-04
    `;

    const parsed = parseDocumentText(sampleOcr);
    expect(parsed.fullName).toBe('Jonas Jonaitis');
    expect(parsed.personalCode).toBe('38504121234');
    expect(parsed.address).toBe('Gedimino pr. 15-4, LT-01103 Vilnius');
    expect(parsed.phone).toBe('0-612-34567');
    expect(parsed.licensePlate).toBe('ABC 123');
    expect(parsed.carModel).toBe('TOYOTA COROLLA');
    expect(parsed.validPeriod).toBe('2026-09-04 2027-09-04');
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
      createdAt: '2026-09-04T10:00:00.000Z',
      updatedAt: '2026-09-04T10:00:00.000Z',
    },
  ];

  it('generates UTF-8 BOM CSV with Lithuanian headers and Eil. Nr.', () => {
    const csv = generateCsvContent(sampleRecords, 'lt');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain(
      'Eil. Nr.,Vardas Pavardė,Adresas,Telefonas,Valst. Nr.,Modelis,Galiojimas,Asmens kodas'
    );
    expect(csv).toContain(
      '1,Jonas Jonaitis,"Gedimino pr. 15-4, Vilnius",0-612-34567,ABC 123,VOLKSWAGEN PASSAT,2026-09-04 2027-09-04,38504121234'
    );
  });

  it('generates JSON and XLSX buffer with localized columns', () => {
    const json = generateJsonContent(sampleRecords, 'lt');
    const parsed = JSON.parse(json);
    expect(parsed[0]['Eil. Nr.']).toBe(1);
    expect(parsed[0]['Vardas Pavardė']).toBe('Jonas Jonaitis');
    expect(parsed[0]['Modelis']).toBe('VOLKSWAGEN PASSAT');

    const xlsxBuf = generateXlsxBuffer(sampleRecords, 'lt');
    expect(xlsxBuf.byteLength).toBeGreaterThan(100);
  });
});

describe('aiRead CRUD & OCR Import App', () => {
  it('renders in Lithuanian by default, switches to English, and supports CRUD operations without saving images', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('aiRead')).toBeInTheDocument();
    expect(screen.getByText('Naujas įrašas')).toBeInTheDocument();

    // Create a new record via modal
    await user.click(screen.getByRole('button', { name: /Naujas įrašas/i }));
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByLabelText(/Vardas Pavardė/i), 'Petras Petraitis');
    await user.type(within(dialog).getByLabelText(/Asmens kodas/i), '39005151234');
    await user.type(within(dialog).getByLabelText(/Telefonas/i), '+370 612 34567');
    await user.type(within(dialog).getByLabelText(/Adresas/i), 'Laisvės al. 10, Kaunas');
    await user.type(within(dialog).getByLabelText(/Valst\. Nr\./i), 'kmn 456');
    await user.type(within(dialog).getByLabelText(/Modelis/i), 'audi a6');
    await user.type(within(dialog).getByLabelText(/Galiojimas/i), '2026.09.04 - 2027.09.04');

    await user.click(within(dialog).getByRole('button', { name: /Išsaugoti įrašą/i }));

    // Verify table row renders formatted values
    expect(await screen.findByText('Petras Petraitis')).toBeInTheDocument();
    expect(screen.getByText('0-612-34567')).toBeInTheDocument();
    expect(screen.getByText('KMN 456')).toBeInTheDocument();
    expect(screen.getByText('AUDI A6')).toBeInTheDocument();
    expect(screen.getByText('2026-09-04 2027-09-04')).toBeInTheDocument();
    expect(screen.getByText('39005151234')).toBeInTheDocument();

    // Verify database record has zero image fields
    const stored = await db.records.toArray();
    expect(stored).toHaveLength(1);
    expect('imageDataUrl' in stored[0]).toBe(false);

    // Switch language to English
    await user.click(screen.getByRole('button', { name: /Toggle language/i }));
    expect(screen.getByText('Add Record')).toBeInTheDocument();
    expect(screen.getByText('Validity Period')).toBeInTheDocument();
  });

  it('extracts fields in Import tab from pasted OCR text and saves record', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /Importas/i }));

    const rawTextarea = screen.getByLabelText(/Nuskaitytas tekstas/i);
    await user.type(
      rawTextarea,
      'Klientas: Onaitytė Rasa\nA.k. 49208081122\nTel. 8 655 44332\nAdresas: Taikos pr. 22-8, Klaipėda\nValst. nr. XYZ 789\nVOLVO XC60\nGalioja 2026-09-04 - 2027-09-04'
    );

    expect(screen.getByLabelText(/Telefonas/i)).toHaveValue('0-655-44332');
    expect(screen.getByLabelText(/Valst\. Nr\./i)).toHaveValue('XYZ 789');
    expect(screen.getByLabelText(/Modelis/i)).toHaveValue('VOLVO XC60');
    expect(screen.getByLabelText(/Galiojimas/i)).toHaveValue('2026-09-04 2027-09-04');
    expect(screen.getByLabelText(/Asmens kodas/i)).toHaveValue('49208081122');

    await user.click(screen.getByRole('button', { name: /Išsaugoti įrašą/i }));

    expect(await screen.findByText('XYZ 789')).toBeInTheDocument();
    expect(screen.getByText('VOLVO XC60')).toBeInTheDocument();
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

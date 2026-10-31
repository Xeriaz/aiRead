import * as XLSX from 'xlsx';
import type { TableRecord } from '../db/db';
import { translations, type Language } from '../i18n/translations';

export interface ExportRow {
  rowNumber: number;
  fullName: string;
  address: string;
  phone: string;
  licensePlate: string;
  carModel: string;
  validPeriod: string;
  personalCode: string;
}

export function buildExportRows(records: TableRecord[]): ExportRow[] {
  return records.map((rec, index) => ({
    rowNumber: index + 1,
    fullName: rec.fullName,
    address: rec.address,
    phone: rec.phone,
    licensePlate: rec.licensePlate,
    carModel: rec.carModel,
    validPeriod: rec.validPeriod,
    personalCode: rec.personalCode,
  }));
}

export function buildLocalizedObjects(
  records: TableRecord[],
  lang: Language
): Record<string, string | number>[] {
  const cols = translations[lang].columns;
  return records.map((rec, index) => ({
    [cols.rowNumber]: index + 1,
    [cols.fullName]: rec.fullName,
    [cols.address]: rec.address,
    [cols.phone]: rec.phone,
    [cols.licensePlate]: rec.licensePlate,
    [cols.carModel]: rec.carModel,
    [cols.validPeriod]: rec.validPeriod,
    [cols.personalCode]: rec.personalCode,
  }));
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsvContent(records: TableRecord[], lang: Language): string {
  const cols = translations[lang].columns;
  const headers = [
    cols.rowNumber,
    cols.fullName,
    cols.address,
    cols.phone,
    cols.licensePlate,
    cols.carModel,
    cols.validPeriod,
    cols.personalCode,
  ];

  const rows = buildExportRows(records).map((r) => [
    r.rowNumber,
    r.fullName,
    r.address,
    r.phone,
    r.licensePlate,
    r.carModel,
    r.validPeriod,
    r.personalCode,
  ]);

  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];

  // Prepend UTF-8 BOM so Excel opens Lithuanian characters cleanly
  return '\uFEFF' + lines.join('\r\n');
}

export function generateJsonContent(records: TableRecord[], lang: Language): string {
  const localized = buildLocalizedObjects(records, lang);
  return JSON.stringify(localized, null, 2);
}

export function generateXlsxBuffer(records: TableRecord[], lang: Language): Uint8Array {
  const localized = buildLocalizedObjects(records, lang);
  const cols = translations[lang].columns;
  const headers = [
    cols.rowNumber,
    cols.fullName,
    cols.address,
    cols.phone,
    cols.licensePlate,
    cols.carModel,
    cols.validPeriod,
    cols.personalCode,
  ];

  const worksheet =
    localized.length > 0
      ? XLSX.utils.json_to_sheet(localized, { header: headers })
      : XLSX.utils.aoa_to_sheet([headers]);

  worksheet['!cols'] = [
    { wch: 8 },
    { wch: 24 },
    { wch: 30 },
    { wch: 15 },
    { wch: 12 },
    { wch: 22 },
    { wch: 23 },
    { wch: 15 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, lang === 'lt' ? 'Įrašai' : 'Records');

  const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Uint8Array(out);
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function exportToCsv(records: TableRecord[], lang: Language): void {
  const csv = generateCsvContent(records, lang);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const dateStamp = new Date().toISOString().slice(0, 10);
  triggerBrowserDownload(blob, `aiRead_${dateStamp}.csv`);
}

export function exportToJson(records: TableRecord[], lang: Language): void {
  const json = generateJsonContent(records, lang);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const dateStamp = new Date().toISOString().slice(0, 10);
  triggerBrowserDownload(blob, `aiRead_${dateStamp}.json`);
}

export function exportToXlsx(records: TableRecord[], lang: Language): void {
  const buffer = generateXlsxBuffer(records, lang);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const dateStamp = new Date().toISOString().slice(0, 10);
  triggerBrowserDownload(blob, `aiRead_${dateStamp}.xlsx`);
}

import Dexie, { type Table } from 'dexie';
import type { ParsedDocumentCandidates } from '../utils/parser';

export interface TableRecord {
  id?: number;
  imageName?: string;    // Nuotrauka / Failas (optional source filename)
  fullName: string;      // Vardas Pavardė
  address: string;       // Adresas
  phone: string;         // Telefonas (0-612-34567)
  licensePlate: string;  // Valst. Nr.
  carModel: string;      // Modelis
  validPeriod: string;   // Galiojimas (YYYY-MM-DD YYYY-MM-DD)
  personalCode: string;  // Asmens kodas (11 digits)
  accuracyScore?: number; // Tikslumas (0-100 integer)
  createdAt: string;
  updatedAt: string;
}

export interface StagingRecord {
  id?: number;
  imageName: string;                         // Failo pavadinimas (e.g., "IMG_4821.JPG")
  fullName: string;                          // Vardas Pavardė
  address: string;                           // Adresas
  phone: string;                             // Telefonas (0-612-34567)
  licensePlate: string;                      // Valst. Nr.
  carModel: string;                          // Modelis
  validPeriod: string;                       // Galiojimas (YYYY-MM-DD YYYY-MM-DD)
  personalCode: string;                      // Asmens kodas (11 digits)
  accuracyScore: number;                     // Tikslumas (0–100%)
  rawText: string;                           // Raw OCR text for re-parsing & candidate chips
  candidates: ParsedDocumentCandidates;      // Alternative detected values per field
  createdAt: string;                         // ISO timestamp
  updatedAt: string;                         // ISO timestamp
}

export interface AppSetting {
  key: string;
  value: string;
}

export class AiReadDatabase extends Dexie {
  records!: Table<TableRecord, number>;
  stagingRecords!: Table<StagingRecord, number>;
  settings!: Table<AppSetting, string>;

  constructor() {
    super('aiRead_db');
    this.version(1).stores({
      scans: '++id, title, createdAt',
      settings: 'key',
    });
    this.version(2).stores({
      scans: null,
      records:
        '++id, fullName, address, phone, licensePlate, carModel, validPeriod, personalCode, createdAt, updatedAt',
      settings: 'key',
    });
    this.version(3).stores({
      scans: null,
      records:
        '++id, fullName, address, phone, licensePlate, carModel, validPeriod, personalCode, accuracyScore, createdAt, updatedAt',
      settings: 'key',
    });
    this.version(4).stores({
      scans: null,
      records:
        '++id, fullName, address, phone, licensePlate, carModel, validPeriod, personalCode, accuracyScore, createdAt, updatedAt',
      stagingRecords:
        '++id, imageName, fullName, address, phone, licensePlate, carModel, validPeriod, personalCode, accuracyScore, createdAt, updatedAt',
      settings: 'key',
    });
  }
}

export const db = new AiReadDatabase();

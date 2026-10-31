import Dexie, { type Table } from 'dexie';

export interface TableRecord {
  id?: number;
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

export interface AppSetting {
  key: string;
  value: string;
}

export class AiReadDatabase extends Dexie {
  records!: Table<TableRecord, number>;
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
  }
}

export const db = new AiReadDatabase();

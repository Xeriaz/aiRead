import Dexie, { type Table } from 'dexie';

export interface ImageScan {
  id?: number;
  title: string;
  imageDataUrl: string;
  extractedText: string;
  extractedData: Record<string, string>;
  createdAt: string;
}

export interface AppSetting {
  key: string;
  value: string;
}

export class AiReadDatabase extends Dexie {
  scans!: Table<ImageScan, number>;
  settings!: Table<AppSetting, string>;

  constructor() {
    super('aiRead_db');
    this.version(1).stores({
      scans: '++id, title, createdAt',
      settings: 'key',
    });
  }
}

export const db = new AiReadDatabase();

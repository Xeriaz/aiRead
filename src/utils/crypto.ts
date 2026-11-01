import type { TableRecord } from '../db/db';
import { calculateAccuracyScore } from './parser';

export const PBKDF2_RECOMMENDED_ITERATIONS = 600_000;
export const PBKDF2_LEGACY_ITERATIONS = 100_000;

export interface EncryptedBackupEnvelope {
  app: 'aiRead';
  version: 1;
  format: 'encrypted-backup-v1';
  exportedAt: string;
  recordCount: number;
  salt: string; // Base64 16 bytes
  iv: string; // Base64 12 bytes
  ciphertext: string; // Base64 AES-GCM ciphertext + 16-byte tag
  checksum: string; // SHA-256 hex digest of the ciphertext (or plaintext in legacy backups)
  iterations?: number; // PBKDF2 iterations (default 600,000 for new backups; fallback 100,000 for legacy v1)
}

export interface DecryptedBackupResult {
  records: Omit<TableRecord, 'id'>[];
  recordCount: number;
  exportedAt: string;
}

export interface BackupInspectionResult {
  isEncrypted: boolean;
  isValid: boolean;
  recordCount?: number;
  exportedAt?: string;
  error?: string;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function computeSha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(text));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveAesGcmKey(
  password: string,
  salt: Uint8Array,
  iterations = PBKDF2_RECOMMENDED_ITERATIONS
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

export function sanitizeRecordForBackup(rec: Partial<TableRecord>): Omit<TableRecord, 'id'> {
  const fullName = String(rec.fullName ?? '').trim();
  const address = String(rec.address ?? '').trim();
  const phone = String(rec.phone ?? '').trim();
  const licensePlate = String(rec.licensePlate ?? '').trim().toUpperCase();
  const carModel = String(rec.carModel ?? '').trim();
  const validPeriod = String(rec.validPeriod ?? '').trim();
  const personalCode = String(rec.personalCode ?? '').trim();
  const imageName = rec.imageName ? String(rec.imageName).trim() : undefined;

  const accuracyScore =
    typeof rec.accuracyScore === 'number'
      ? rec.accuracyScore
      : calculateAccuracyScore({
          fullName,
          address,
          phone,
          licensePlate,
          carModel,
          validPeriod,
          personalCode,
        });

  const now = new Date().toISOString();
  return {
    imageName,
    fullName,
    address,
    phone,
    licensePlate,
    carModel,
    validPeriod,
    personalCode,
    accuracyScore,
    createdAt: rec.createdAt ?? now,
    updatedAt: rec.updatedAt ?? now,
  };
}

export async function encryptRecords(
  records: TableRecord[],
  password: string
): Promise<EncryptedBackupEnvelope> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  const cleanRecords = records.map(sanitizeRecordForBackup);
  const jsonPayload = JSON.stringify(cleanRecords);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = PBKDF2_RECOMMENDED_ITERATIONS;
  const key = await deriveAesGcmKey(password, salt, iterations);

  const enc = new TextEncoder();
  const cipherBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    enc.encode(jsonPayload)
  );

  const ciphertext = uint8ArrayToBase64(new Uint8Array(cipherBuffer));
  // Checksum is computed over ciphertext to prevent plaintext hash oracle leakage
  const checksum = await computeSha256Hex(ciphertext);

  return {
    app: 'aiRead',
    version: 1,
    format: 'encrypted-backup-v1',
    exportedAt: new Date().toISOString(),
    recordCount: cleanRecords.length,
    salt: uint8ArrayToBase64(salt),
    iv: uint8ArrayToBase64(iv),
    ciphertext,
    checksum,
    iterations,
  };
}

export async function decryptRecords(
  envelope: EncryptedBackupEnvelope,
  password: string
): Promise<DecryptedBackupResult> {
  if (!password) {
    throw new Error('Password required to decrypt backup');
  }

  if (envelope.app !== 'aiRead' || envelope.format !== 'encrypted-backup-v1') {
    throw new Error('Unsupported backup format');
  }

  let salt: Uint8Array;
  let iv: Uint8Array;
  let ciphertext: Uint8Array;

  try {
    salt = base64ToUint8Array(envelope.salt);
    iv = base64ToUint8Array(envelope.iv);
    ciphertext = base64ToUint8Array(envelope.ciphertext);
  } catch {
    throw new Error('Corrupted backup: invalid base64 encoding');
  }

  // Pre-validate checksum against ciphertext (standard format)
  const ciphertextChecksum = await computeSha256Hex(envelope.ciphertext);
  const isCiphertextChecksumMatch = ciphertextChecksum === envelope.checksum;

  const iterations = envelope.iterations ?? PBKDF2_LEGACY_ITERATIONS;
  const key = await deriveAesGcmKey(password, salt, iterations);

  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      key,
      ciphertext
    );
  } catch {
    throw new Error('Incorrect password or corrupted backup file');
  }

  const jsonString = new TextDecoder().decode(decryptedBuffer);

  // If checksum did not match ciphertext, fallback check for legacy backups that hashed plaintext
  if (!isCiphertextChecksumMatch) {
    const legacyPlaintextChecksum = await computeSha256Hex(jsonString);
    if (legacyPlaintextChecksum !== envelope.checksum) {
      throw new Error('Integrity check failed: payload checksum mismatch');
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Corrupted backup: invalid JSON in decrypted payload');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Corrupted backup: records payload is not an array');
  }

  const sanitized = parsed.map(sanitizeRecordForBackup);
  return {
    records: sanitized,
    recordCount: sanitized.length,
    exportedAt: envelope.exportedAt,
  };
}

export function inspectBackupContent(fileText: string): BackupInspectionResult {
  const trimmed = fileText.trim();
  if (!trimmed) {
    return { isEncrypted: false, isValid: false, error: 'Empty file' };
  }

  try {
    const data = JSON.parse(trimmed);
    if (
      data &&
      typeof data === 'object' &&
      data.app === 'aiRead' &&
      data.format === 'encrypted-backup-v1'
    ) {
      return {
        isEncrypted: true,
        isValid: Boolean(data.salt && data.iv && data.ciphertext && data.checksum),
        recordCount: typeof data.recordCount === 'number' ? data.recordCount : undefined,
        exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : undefined,
      };
    }

    if (Array.isArray(data)) {
      return {
        isEncrypted: false,
        isValid: true,
        recordCount: data.length,
      };
    }

    return {
      isEncrypted: false,
      isValid: false,
      error: 'Unrecognized backup structure',
    };
  } catch {
    return {
      isEncrypted: false,
      isValid: false,
      error: 'Invalid JSON file',
    };
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export async function exportEncryptedBackupToFile(
  records: TableRecord[],
  password: string
): Promise<void> {
  const envelope = await encryptRecords(records, password);
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const dateStamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `aiRead_encrypted_backup_${dateStamp}.airead`);
}

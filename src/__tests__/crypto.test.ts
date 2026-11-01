import { describe, expect, it } from 'vitest';
import {
  computeSha256Hex,
  decryptRecords,
  encryptRecords,
  inspectBackupContent,
  sanitizeRecordForBackup,
  type EncryptedBackupEnvelope,
} from '../utils/crypto';
import type { TableRecord } from '../db/db';

describe('Web Crypto AES-256-GCM + PBKDF2 + SHA-256 Backup Protection', () => {
  const sampleRecords: TableRecord[] = [
    {
      id: 1,
      fullName: 'Jonas Jonaitis',
      address: 'Gedimino pr. 15-4, Vilnius',
      phone: '+37061234567',
      licensePlate: 'ABC 123',
      carModel: 'TOYOTA COROLLA',
      validPeriod: '2026-09-04 2027-09-04',
      personalCode: '38504121234',
      accuracyScore: 100,
      createdAt: '2026-09-04T10:00:00.000Z',
      updatedAt: '2026-09-04T10:00:00.000Z',
    },
    {
      id: 2,
      fullName: 'Petras Petraitis',
      address: 'Kauno g. 10',
      phone: '+37069911223',
      licensePlate: 'KMN 456',
      carModel: 'AUDI A6',
      validPeriod: '2026-10-01 2027-10-01',
      personalCode: '38801010000',
      accuracyScore: 90,
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
    },
  ];

  it('computes exact SHA-256 hex checksum of payload', async () => {
    const hash = await computeSha256Hex('test');
    expect(hash).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
  });

  it('encrypts records into AES-256-GCM envelope and successfully decrypts with correct password', async () => {
    const password = 'SuperSecretPassword2026!';
    const envelope = await encryptRecords(sampleRecords, password);

    expect(envelope.app).toBe('aiRead');
    expect(envelope.format).toBe('encrypted-backup-v1');
    expect(envelope.recordCount).toBe(2);
    expect(envelope.salt).toBeTruthy();
    expect(envelope.iv).toBeTruthy();
    expect(envelope.ciphertext).toBeTruthy();
    expect(envelope.checksum).toBeTruthy();

    // Verify inspection
    const inspection = inspectBackupContent(JSON.stringify(envelope));
    expect(inspection.isEncrypted).toBe(true);
    expect(inspection.isValid).toBe(true);
    expect(inspection.recordCount).toBe(2);

    // Decrypt with correct password
    const result = await decryptRecords(envelope, password);
    expect(result.recordCount).toBe(2);
    expect(result.records[0].fullName).toBe('Jonas Jonaitis');
    expect(result.records[0].personalCode).toBe('38504121234');
    expect(result.records[1].licensePlate).toBe('KMN 456');
  });

  it('fails decryption immediately when password is wrong', async () => {
    const password = 'CorrectPassword123';
    const envelope = await encryptRecords(sampleRecords, password);

    await expect(decryptRecords(envelope, 'WrongPassword456')).rejects.toThrow(
      'Incorrect password or corrupted backup file'
    );
  });

  it('detects tampering and fails when ciphertext or checksum is altered', async () => {
    const password = 'CorrectPassword123';
    const envelope = await encryptRecords(sampleRecords, password);

    // Alter checksum
    const tamperedChecksum: EncryptedBackupEnvelope = {
      ...envelope,
      checksum: '0000000000000000000000000000000000000000000000000000000000000000',
    };
    await expect(decryptRecords(tamperedChecksum, password)).rejects.toThrow(
      'Integrity check failed: payload checksum mismatch'
    );
  });

  it('sanitizes records and auto-calculates accuracy scores if missing', () => {
    const raw = {
      fullName: '  Jonas Jonaitis  ',
      address: 'Gedimino pr. 15-4, LT-01103 Vilnius',
      phone: '+37061234567',
      licensePlate: 'abc 123',
      carModel: 'TOYOTA COROLLA',
      validPeriod: '2026-09-04 2027-09-04',
      personalCode: '38504121234',
    };
    const sanitized = sanitizeRecordForBackup(raw);
    expect(sanitized.fullName).toBe('Jonas Jonaitis');
    expect(sanitized.licensePlate).toBe('ABC 123');
    expect(sanitized.accuracyScore).toBe(100);
  });
});

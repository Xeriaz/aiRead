import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BackupModal from '../components/BackupModal';
import { db, type TableRecord } from '../db/db';
import { translations } from '../i18n/translations';
import * as cryptoModule from '../utils/crypto';
import { encryptRecords } from '../utils/crypto';

describe('BackupModal Encrypted Export & Import', () => {
  const t = translations.lt;
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
  ];

  beforeEach(async () => {
    await db.records.clear();
  });

  it('renders modal when open and shows password validation on export', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    const handleImported = vi.fn().mockResolvedValue(undefined);

    render(
      <BackupModal
        isOpen={true}
        onClose={handleClose}
        initialMode="export"
        records={sampleRecords}
        onRecordsImported={handleImported}
        t={t}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(t.labels.backupModalTitle)).toBeInTheDocument();

    const passwordInputs = screen.getAllByPlaceholderText('••••••••');
    expect(passwordInputs).toHaveLength(2);

    // Type short password < 8 chars
    await user.type(passwordInputs[0], '1234567');
    await user.type(passwordInputs[1], '1234567');
    await user.click(screen.getByRole('button', { name: t.labels.backupExportAction }));
    expect(await screen.findByText(t.labels.backupPasswordMinLength)).toBeInTheDocument();

    // Type mismatching passwords
    await user.clear(passwordInputs[0]);
    await user.clear(passwordInputs[1]);
    await user.type(passwordInputs[0], 'Password123');
    await user.type(passwordInputs[1], 'Password456');
    await user.click(screen.getByRole('button', { name: t.labels.backupExportAction }));
    expect(await screen.findByText(t.labels.backupPasswordMismatch)).toBeInTheDocument();
  });

  it('exports encrypted backup when valid password is provided', async () => {
    const user = userEvent.setup();
    const exportSpy = vi
      .spyOn(cryptoModule, 'exportEncryptedBackupToFile')
      .mockResolvedValue(undefined);

    try {
      render(
        <BackupModal
          isOpen={true}
          onClose={vi.fn()}
          initialMode="export"
          records={sampleRecords}
          onRecordsImported={vi.fn()}
          t={t}
        />
      );

      const passwordInputs = screen.getAllByPlaceholderText('••••••••');
      await user.type(passwordInputs[0], 'ValidSecret2026!');
      await user.type(passwordInputs[1], 'ValidSecret2026!');

      await user.click(screen.getByRole('button', { name: t.labels.backupExportAction }));

      expect(exportSpy).toHaveBeenCalledWith(sampleRecords, 'ValidSecret2026!');
      expect(await screen.findByText(`${t.actions.exportProtected} - OK`)).toBeInTheDocument();
    } finally {
      exportSpy.mockRestore();
    }
  });

  it('decrypts encrypted backup file with password and merges records into database', async () => {
    const user = userEvent.setup();
    const handleClose = vi.fn();
    const handleImported = vi.fn().mockResolvedValue(undefined);

    // Create encrypted backup payload
    const password = 'TestSecretPassword2026!';
    const envelope = await encryptRecords(sampleRecords, password);
    const jsonStr = JSON.stringify(envelope);

    render(
      <BackupModal
        isOpen={true}
        onClose={handleClose}
        initialMode="import"
        records={[]}
        onRecordsImported={handleImported}
        t={t}
      />
    );

    // Upload mock file
    const file = new File([jsonStr], 'backup.airead', { type: 'application/json' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    await user.upload(fileInput, file);

    // Password input appears for decryption
    const passInput = await screen.findByPlaceholderText('••••••••');
    await user.type(passInput, password);
    await user.click(screen.getByRole('button', { name: t.labels.backupDecryptAction }));

    // Decrypted records preview is shown
    expect(await screen.findByText(/Įrašai: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/SHA-256 ✓ OK/i)).toBeInTheDocument();

    // Click Merge
    await user.click(screen.getByRole('button', { name: t.labels.backupMergeAction }));

    await waitFor(async () => {
      const stored = await db.records.toArray();
      expect(stored).toHaveLength(1);
      expect(stored[0].fullName).toBe('Jonas Jonaitis');
    });

    expect(handleImported).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Sėkmingai importuota įrašų: 1/i)).toBeInTheDocument();
  });

  it('supports Overwrite / Replace mode when importing backup', async () => {
    const user = userEvent.setup();
    const handleImported = vi.fn().mockResolvedValue(undefined);

    // Existing record in DB
    await db.records.add({
      fullName: 'Old Existing Record',
      address: 'Old Address 1',
      phone: '+37060000000',
      licensePlate: 'OLD 001',
      carModel: 'VW GOLF',
      validPeriod: '2025-01-01 2026-01-01',
      personalCode: '38504121234',
      accuracyScore: 80,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const newRecord: TableRecord = {
      id: 99,
      fullName: 'New Backup Record',
      address: 'New Address 2',
      phone: '+37061111111',
      licensePlate: 'NEW 999',
      carModel: 'TESLA MODEL 3',
      validPeriod: '2026-05-01 2027-05-01',
      personalCode: '49012120000',
      accuracyScore: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const password = 'ReplaceModePass2026!';
    const envelope = await encryptRecords([newRecord], password);
    const jsonStr = JSON.stringify(envelope);

    render(
      <BackupModal
        isOpen={true}
        onClose={vi.fn()}
        initialMode="import"
        records={[]}
        onRecordsImported={handleImported}
        t={t}
      />
    );

    const file = new File([jsonStr], 'replace.airead', { type: 'application/json' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    const passInput = await screen.findByPlaceholderText('••••••••');
    await user.type(passInput, password);
    await user.click(screen.getByRole('button', { name: t.labels.backupDecryptAction }));

    expect(await screen.findByText(/Įrašai: 1/i)).toBeInTheDocument();

    // Click Replace / Overwrite
    await user.click(screen.getByRole('button', { name: t.labels.backupReplaceAction }));

    await waitFor(async () => {
      const stored = await db.records.toArray();
      expect(stored).toHaveLength(1);
      expect(stored[0].fullName).toBe('New Backup Record');
      expect(stored[0].licensePlate).toBe('NEW 999');
    });

    expect(handleImported).toHaveBeenCalledTimes(1);
  });

  it('shows error when wrong password is typed for decryption', async () => {
    const user = userEvent.setup();
    const password = 'RealPassword123!';
    const envelope = await encryptRecords(sampleRecords, password);
    const jsonStr = JSON.stringify(envelope);

    render(
      <BackupModal
        isOpen={true}
        onClose={vi.fn()}
        initialMode="import"
        records={[]}
        onRecordsImported={vi.fn()}
        t={t}
      />
    );

    const file = new File([jsonStr], 'backup.airead', { type: 'application/json' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    const passInput = await screen.findByPlaceholderText('••••••••');
    await user.type(passInput, 'WrongPassword999!');
    await user.click(screen.getByRole('button', { name: t.labels.backupDecryptAction }));

    expect(await screen.findByText(t.labels.backupWrongPassword)).toBeInTheDocument();
    expect(screen.queryByText(/Įrašai: 1/i)).not.toBeInTheDocument();
  });

  it('shows error when file is corrupted or tampered', async () => {
    const user = userEvent.setup();
    const password = 'PasswordTampered1!';
    const envelope = await encryptRecords(sampleRecords, password);
    // Tamper with ciphertext
    envelope.ciphertext = envelope.ciphertext.slice(0, -6) + 'AAAAAA';
    const jsonStr = JSON.stringify(envelope);

    render(
      <BackupModal
        isOpen={true}
        onClose={vi.fn()}
        initialMode="import"
        records={[]}
        onRecordsImported={vi.fn()}
        t={t}
      />
    );

    const file = new File([jsonStr], 'corrupted.airead', { type: 'application/json' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    const passInput = await screen.findByPlaceholderText('••••••••');
    await user.type(passInput, password);
    await user.click(screen.getByRole('button', { name: t.labels.backupDecryptAction }));

    expect(await screen.findByText(t.labels.backupWrongPassword)).toBeInTheDocument();
  });
});

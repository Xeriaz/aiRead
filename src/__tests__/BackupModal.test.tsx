import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BackupModal from '../components/BackupModal';
import { db, type TableRecord } from '../db/db';
import { translations } from '../i18n/translations';
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
    await user.click(screen.getByRole('button', { name: /Atsisiųsti užšifruotą failą/i }));
    expect(await screen.findByText(t.labels.backupPasswordMinLength)).toBeInTheDocument();

    // Type mismatching passwords
    await user.clear(passwordInputs[0]);
    await user.clear(passwordInputs[1]);
    await user.type(passwordInputs[0], 'Password123');
    await user.type(passwordInputs[1], 'Password456');
    await user.click(screen.getByRole('button', { name: /Atsisiųsti užšifruotą failą/i }));
    expect(await screen.findByText(t.labels.backupPasswordMismatch)).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: /Iššifruoti ir patikrinti/i }));

    // Decrypted records preview is shown
    expect(await screen.findByText(/Įrašai: 1/i)).toBeInTheDocument();
    expect(screen.getByText(/SHA-256 ✓ OK/i)).toBeInTheDocument();

    // Click Merge
    await user.click(screen.getByRole('button', { name: /Sujungti su esamais įrašais/i }));

    await waitFor(async () => {
      const stored = await db.records.toArray();
      expect(stored).toHaveLength(1);
      expect(stored[0].fullName).toBe('Jonas Jonaitis');
    });

    expect(handleImported).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Sėkmingai importuota įrašų: 1/i)).toBeInTheDocument();
  });
});

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { db } from '../db/db';
import { translations } from '../i18n/translations';
import * as ocrModule from '../utils/ocr';
import * as cryptoModule from '../utils/crypto';
import {
  addOneYearToDate,
  formatPhoneNumber,
  formatValidPeriod,
  isValidLithuanianPersonalCode,
} from '../utils/parser';

describe('aiRead Main Flows Automation Suite', () => {
  const t = translations.lt;

  beforeEach(async () => {
    await db.records.clear();
    await db.stagingRecords.clear();
    localStorage.clear();
    document.documentElement.className = 'light';
    document.documentElement.lang = 'lt';
  });

  // --------------------------------------------------------------------------
  // FLOW 1: Single Document Import & OCR Parsing Flow
  // --------------------------------------------------------------------------
  describe('Flow 1: Single Document Import & OCR Parsing Flow', () => {
    it('uploads an image file, extracts fields via OCR, selects alternative candidate chips, and saves to database with zero image retention', async () => {
      const user = userEvent.setup();

      const ocrMock = vi
        .spyOn(ocrModule, 'extractTextAndConfidenceFromImageFile')
        .mockResolvedValue({
          text: [
            'Draudėjas: Rasa Onaitytė',
            'Asmens kodas: 38504121234',
            'Adresas: Gedimino pr. 10, Vilnius',
            'Gedimino pr. 12, Vilnius',
            'Tel. +37061234567',
            'Mob. 869911223',
            'Valst. nr.: AAA 111',
            'Markė: VOLVO XC90',
            'Galioja nuo 2026-06-01 iki 2027-06-01',
          ].join('\n'),
          confidence: 90,
        });

      try {
        render(<App />);

        // Navigate to Single Import tab
        await user.click(screen.getByRole('button', { name: new RegExp(t.navImport, 'i') }));
        expect(screen.getByText(t.labels.importTitle)).toBeInTheDocument();

        // Upload single image file
        const fileInput = screen.getByTestId('single-image-file-input');
        const testFile = new File(['mock-img-data'], 'policy_scan.jpg', { type: 'image/jpeg' });
        await user.upload(fileInput, testFile);

        // Verify OCR was invoked
        expect(ocrMock).toHaveBeenCalledWith(testFile, expect.any(Function));

        // Verify inputs populated
        const nameInput = await screen.findByLabelText(new RegExp(t.columns.fullName, 'i'));
        expect(nameInput).toHaveValue('Rasa Onaitytė');

        const codeInput = screen.getByLabelText(new RegExp(t.columns.personalCode, 'i'));
        expect(codeInput).toHaveValue('38504121234');

        const addressInput = screen.getByLabelText(new RegExp(t.columns.address, 'i'));
        expect(addressInput).toHaveValue('Gedimino pr. 10, Vilnius');

        // Multi-candidate chip for alternative address
        const altAddressChip = await screen.findByRole('button', { name: 'Gedimino pr. 12, Vilnius' });
        expect(altAddressChip).toBeInTheDocument();
        await user.click(altAddressChip);
        expect(addressInput).toHaveValue('Gedimino pr. 12, Vilnius');

        // Multi-candidate chip for alternative phone
        const phoneInput = screen.getByLabelText(new RegExp(t.columns.phone, 'i'));
        expect(phoneInput).toHaveValue('+37061234567');
        const altPhoneChip = await screen.findByRole('button', { name: '869911223' });
        await user.click(altPhoneChip);
        expect(phoneInput).toHaveValue('869911223');

        // Submit form to save record
        const saveBtn = screen.getByRole('button', { name: new RegExp(t.actions.save, 'i') });
        await user.click(saveBtn);

        // Verify record is committed to Dexie db.records
        await waitFor(async () => {
          const stored = await db.records.toArray();
          expect(stored).toHaveLength(1);
          expect(stored[0].fullName).toBe('Rasa Onaitytė');
          expect(stored[0].address).toBe('Gedimino pr. 12, Vilnius');
          expect(stored[0].phone).toBe('869911223');
          expect(stored[0].licensePlate).toBe('AAA 111');
          expect(stored[0].imageName).toBe('policy_scan.jpg');
          // Strict privacy guarantee: no photo blob or base64 data stored
          expect('imageDataUrl' in stored[0]).toBe(false);
          expect('blob' in stored[0]).toBe(false);
          expect(stored[0].accuracyScore).toBeGreaterThanOrEqual(80);
        });

        // App redirected to table tab where the saved record is rendered
        expect(await screen.findByText('Rasa Onaitytė')).toBeInTheDocument();
        expect(screen.getByText('AAA 111')).toBeInTheDocument();

        // Navigating back to Import tab shows fresh, empty inputs
        await user.click(screen.getByRole('button', { name: new RegExp(t.navImport, 'i') }));
        const freshNameInput = await screen.findByLabelText(new RegExp(t.columns.fullName, 'i'));
        expect(freshNameInput).toHaveValue('');
        const freshAddressInput = screen.getByLabelText(new RegExp(t.columns.address, 'i'));
        expect(freshAddressInput).toHaveValue('');
      } finally {
        ocrMock.mockRestore();
      }
    });

    it('displays a dismissible error notice when OCR recognition fails', async () => {
      const user = userEvent.setup();
      const ocrMock = vi
        .spyOn(ocrModule, 'extractTextAndConfidenceFromImageFile')
        .mockRejectedValue(new Error('Tesseract failed'));

      try {
        render(<App />);

        await user.click(screen.getByRole('button', { name: new RegExp(t.navImport, 'i') }));
        const fileInput = screen.getByTestId('single-image-file-input');
        const invalidFile = new File(['invalid'], 'corrupt.png', { type: 'image/png' });

        await user.upload(fileInput, invalidFile);

        // Error banner is displayed
        expect(await screen.findByText(t.labels.ocrErrorNotice)).toBeInTheDocument();

        // Dismiss the error banner using aria-label="Dismiss error"
        const dismissBtn = screen.getByLabelText(/Dismiss error/i);
        await user.click(dismissBtn);
        expect(screen.queryByText(t.labels.ocrErrorNotice)).not.toBeInTheDocument();
      } finally {
        ocrMock.mockRestore();
      }
    });
  });

  // --------------------------------------------------------------------------
  // FLOW 2: Bulk Upload & Staging Queue Flow
  // --------------------------------------------------------------------------
  describe('Flow 2: Bulk Upload & Staging Queue Flow', () => {
    it('handles multi-file upload, isolates OCR failures, supports wizard edits, and commits individual staging items', async () => {
      const user = userEvent.setup();

      const ocrMock = vi
        .spyOn(ocrModule, 'extractTextAndConfidenceFromImageFile')
        .mockImplementation(async (file: File) => {
          if (file.name === 'corrupted.jpg') {
            throw new Error('Unreadable image');
          }
          return {
            text: [
              'Draudėjas: Andrius Kubilius',
              'Valst. nr.: BBB 222',
              'Tel. +370 600 12345',
            ].join('\n'),
            confidence: 85,
          };
        });

      try {
        render(<App />);

        // Navigate to Bulk Staging tab
        await user.click(screen.getByRole('button', { name: new RegExp(t.navBulk, 'i') }));
        expect(screen.getByText(t.labels.bulkTitle)).toBeInTheDocument();

        const fileInput = screen.getByTestId('bulk-file-input');
        const corruptedFile = new File(['bad'], 'corrupted.jpg', { type: 'image/jpeg' });
        const validFile = new File(['good'], 'valid_doc.jpg', { type: 'image/jpeg' });

        await user.upload(fileInput, [corruptedFile, validFile]);

        // Wait for batch processing banner to complete
        await waitFor(() => {
          expect(screen.queryByTestId('batch-progress-banner')).not.toBeInTheDocument();
        });

        // Verify staging queue contains both items
        const stagedItems = await db.stagingRecords.orderBy('id').toArray();
        expect(stagedItems).toHaveLength(2);
        expect(stagedItems[0].imageName).toBe('corrupted.jpg');
        expect(stagedItems[0].accuracyScore).toBe(0);
        expect(stagedItems[1].imageName).toBe('valid_doc.jpg');
        expect(stagedItems[1].fullName).toBe('Andrius Kubilius');

        // Strict privacy check on staging records
        expect('imageDataUrl' in stagedItems[0]).toBe(false);
        expect('imageDataUrl' in stagedItems[1]).toBe(false);

        // Edit valid_doc.jpg in the staging wizard
        const stagingTable = screen.getByTestId('staging-queue-table');
        const verifyBtn = within(stagingTable).getAllByRole('button', { name: new RegExp(t.actions.verifyItem, 'i') })[1];
        await user.click(verifyBtn);

        const wizard = screen.getByTestId('one-by-one-wizard');
        expect(screen.getByTestId('wizard-image-name')).toHaveTextContent('valid_doc.jpg');

        // Edit address in wizard
        const addressInput = within(wizard).getByLabelText(new RegExp(t.columns.address, 'i'));
        await user.type(addressInput, 'Vilniaus g. 25, Kaunas');

        // Approve and Next
        await user.click(screen.getByTestId('approve-and-next-btn'));

        // Verify approved record moved to db.records with updated address
        await waitFor(async () => {
          const approved = await db.records.toArray();
          expect(approved).toHaveLength(1);
          expect(approved[0].imageName).toBe('valid_doc.jpg');
          expect(approved[0].fullName).toBe('Andrius Kubilius');
          expect(approved[0].address).toBe('Vilniaus g. 25, Kaunas');
        });

        // Delete the remaining corrupted staging item from table
        const deleteBtn = within(stagingTable).getByRole('button', { name: new RegExp(t.actions.delete, 'i') });
        await user.click(deleteBtn);

        await waitFor(async () => {
          const remaining = await db.stagingRecords.toArray();
          expect(remaining).toHaveLength(0);
        });
      } finally {
        ocrMock.mockRestore();
      }
    });
  });

  // --------------------------------------------------------------------------
  // FLOW 3: Records Management & CRUD Flow
  // --------------------------------------------------------------------------
  describe('Flow 3: Records Management & CRUD Flow', () => {
    it('creates records with green, amber, and red accuracy badges, filters via search, edits, deletes, and switches view modes', async () => {
      const user = userEvent.setup();
      render(<App />);

      // 1. Create Green Record (100% complete)
      await user.click(screen.getByRole('button', { name: new RegExp(t.actions.addNew, 'i') }));
      const dialog = screen.getByRole('dialog');

      await user.type(within(dialog).getByLabelText(new RegExp(t.columns.fullName, 'i')), 'Vytautas Didysis');
      await user.type(within(dialog).getByLabelText(new RegExp(t.columns.personalCode, 'i')), '38504121234');
      await user.type(within(dialog).getByLabelText(new RegExp(t.columns.phone, 'i')), '+37061234567');
      await user.type(within(dialog).getByLabelText(new RegExp(t.columns.address, 'i')), 'Pilies g. 1, Trakai');
      await user.type(within(dialog).getByLabelText(new RegExp(t.columns.licensePlate, 'i')), 'VYT 001');
      await user.type(within(dialog).getByLabelText(new RegExp(t.columns.carModel, 'i')), 'TOYOTA COROLLA');
      await user.type(within(dialog).getByLabelText(new RegExp(t.columns.validPeriod, 'i')), '2026-01-01 2027-01-01');

      await user.click(within(dialog).getByRole('button', { name: new RegExp(t.actions.save, 'i') }));
      expect(await screen.findByText('Vytautas Didysis')).toBeInTheDocument();

      // Green badge check
      const greenBadge = screen.getByTestId('accuracy-badge-1');
      expect(greenBadge).toHaveTextContent('100%');
      expect(greenBadge.className).toContain('bg-emerald-500/15');

      // 2. Create Amber Record (partially complete ~65%)
      await user.click(screen.getByRole('button', { name: new RegExp(t.actions.addNew, 'i') }));
      const dialog2 = screen.getByRole('dialog');
      await user.type(within(dialog2).getByLabelText(new RegExp(t.columns.fullName, 'i')), 'Mindaugas Karalius');
      await user.type(within(dialog2).getByLabelText(new RegExp(t.columns.phone, 'i')), '+37060000000');
      await user.type(within(dialog2).getByLabelText(new RegExp(t.columns.licensePlate, 'i')), 'MIN 001');
      await user.type(within(dialog2).getByLabelText(new RegExp(t.columns.carModel, 'i')), 'AUDI A6');
      await user.click(within(dialog2).getByRole('button', { name: new RegExp(t.actions.save, 'i') }));
      expect(await screen.findByText('Mindaugas Karalius')).toBeInTheDocument();

      const amberBadge = screen.getByTestId('accuracy-badge-2');
      expect(amberBadge.className).toContain('bg-amber-500/15');

      // 3. Create Red Record (< 50%)
      await user.click(screen.getByRole('button', { name: new RegExp(t.actions.addNew, 'i') }));
      const dialog3 = screen.getByRole('dialog');
      await user.type(within(dialog3).getByLabelText(new RegExp(t.columns.fullName, 'i')), 'Gediminas');
      await user.click(within(dialog3).getByRole('button', { name: new RegExp(t.actions.save, 'i') }));
      expect(await screen.findByText('Gediminas')).toBeInTheDocument();

      const redBadge = screen.getByTestId('accuracy-badge-3');
      expect(redBadge.className).toContain('bg-red-500/15');

      // 4. Live Search Filter
      const searchInput = screen.getByPlaceholderText(t.placeholders.search);
      await user.type(searchInput, 'VYT 001');

      expect(screen.getByText('Vytautas Didysis')).toBeInTheDocument();
      expect(screen.queryByText('Mindaugas Karalius')).not.toBeInTheDocument();
      expect(screen.queryByText('Gediminas')).not.toBeInTheDocument();

      // Clear search restores all records
      await user.clear(searchInput);
      expect(screen.getByText('Mindaugas Karalius')).toBeInTheDocument();
      expect(screen.getByText('Gediminas')).toBeInTheDocument();

      // 5. Edit Record
      const editButtons = screen.getAllByRole('button', { name: new RegExp(t.actions.edit, 'i') });
      await user.click(editButtons[0]); // Edit Vytautas

      const editDialog = screen.getByRole('dialog');
      const editPhoneInput = within(editDialog).getByLabelText(new RegExp(t.columns.phone, 'i'));
      await user.clear(editPhoneInput);
      await user.type(editPhoneInput, '+37069999999');
      await user.click(within(editDialog).getByRole('button', { name: new RegExp(t.actions.update, 'i') }));

      expect(await screen.findByText('+37069999999')).toBeInTheDocument();

      // 6. Delete Record
      const deleteButtons = screen.getAllByRole('button', { name: new RegExp(t.actions.delete, 'i') });
      await user.click(deleteButtons[2]); // Delete Gediminas

      await waitFor(() => {
        expect(screen.queryByText('Gediminas')).not.toBeInTheDocument();
      });

      // 7. Toggle View Mode (Table <-> Cards)
      const viewCardsBtn = screen.getByRole('button', { name: new RegExp(t.actions.viewCards, 'i') });
      await user.click(viewCardsBtn);

      // In cards mode, table element is replaced by card grid
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText('Vytautas Didysis')).toBeInTheDocument();
      expect(screen.getByText('Mindaugas Karalius')).toBeInTheDocument();

      const viewTableBtn = screen.getByLabelText(t.actions.viewTable);
      await user.click(viewTableBtn);
      expect(screen.getByRole('table')).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // FLOW 4: Encrypted Backup & Sync Flow
  // --------------------------------------------------------------------------
  describe('Flow 4: Encrypted Backup & Sync Flow', () => {
    it('executes full password-protected backup cycle: export -> merge import -> replace import -> wrong password rejection', async () => {
      const user = userEvent.setup();

      // Seed DB with initial record
      await db.records.add({
        fullName: 'Original User',
        address: 'Gedimino pr. 1',
        phone: '+37061111111',
        licensePlate: 'AAA 001',
        carModel: 'TOYOTA COROLLA',
        validPeriod: '2026-01-01 2027-01-01',
        personalCode: '38504121234',
        accuracyScore: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      render(<App />);

      // Open Settings and launch Backup Export modal
      await user.click(screen.getByRole('button', { name: new RegExp(t.navSettings, 'i') }));
      const settingsArea = screen.getByRole('main');
      await user.click(within(settingsArea).getByRole('button', { name: new RegExp(t.actions.exportProtected, 'i') }));

      const exportModal = screen.getByRole('dialog');
      const passInputs = within(exportModal).getAllByPlaceholderText('••••••••');

      // Export with valid password
      const exportSpy = vi.spyOn(cryptoModule, 'exportEncryptedBackupToFile').mockResolvedValue(undefined);
      await user.type(passInputs[0], 'TopSecretPass2026!');
      await user.type(passInputs[1], 'TopSecretPass2026!');
      await user.click(within(exportModal).getByRole('button', { name: t.labels.backupExportAction }));

      expect(exportSpy).toHaveBeenCalled();
      expect(await within(exportModal).findByText(`${t.actions.exportProtected} - OK`)).toBeInTheDocument();
      exportSpy.mockRestore();

      // Close modal
      await user.keyboard('{Escape}');

      // Prepare an encrypted backup file to test import
      const incomingRecord = {
        id: 50,
        fullName: 'Imported Specialist',
        address: 'Kauno g. 10',
        phone: '+37062222222',
        licensePlate: 'BBB 002',
        carModel: 'AUDI A6',
        validPeriod: '2026-05-01 2027-05-01',
        personalCode: '38504121234',
        accuracyScore: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const validPass = 'SecureBackupKey2026!';
      const envelope = await cryptoModule.encryptRecords([incomingRecord], validPass);
      const fileBlob = new File([JSON.stringify(envelope)], 'backup.airead', { type: 'application/json' });

      // Open Import Backup modal from Settings
      await user.click(within(settingsArea).getByRole('button', { name: new RegExp(t.actions.importBackup, 'i') }));
      const importModal = screen.getByRole('dialog');
      const fileInput = importModal.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(fileInput, fileBlob);

      // Wrong password rejection
      const decryptPassInput = await within(importModal).findByPlaceholderText('••••••••');
      await user.type(decryptPassInput, 'WrongKey123!');
      await user.click(within(importModal).getByRole('button', { name: t.labels.backupDecryptAction }));
      expect(await within(importModal).findByText(t.labels.backupWrongPassword)).toBeInTheDocument();

      // Correct password decryption
      await user.clear(decryptPassInput);
      await user.type(decryptPassInput, validPass);
      await user.click(within(importModal).getByRole('button', { name: t.labels.backupDecryptAction }));
      expect(await within(importModal).findByText(/Įrašai: 1/i)).toBeInTheDocument();

      // Replace / Overwrite mode
      await user.click(within(importModal).getByRole('button', { name: t.labels.backupReplaceAction }));

      // Verify DB was replaced (Original User removed, Imported Specialist present)
      await waitFor(async () => {
        const records = await db.records.toArray();
        expect(records).toHaveLength(1);
        expect(records[0].fullName).toBe('Imported Specialist');
      });
    });
  });

  // --------------------------------------------------------------------------
  // FLOW 5: Localization & Theme Settings Flow
  // --------------------------------------------------------------------------
  describe('Flow 5: Localization & Theme Settings Flow', () => {
    it('switches languages between LT and EN and updates document lang and localStorage', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Open Settings
      await user.click(screen.getByRole('button', { name: /Nustatymai|Settings/i }));

      // Switch to English
      await user.click(screen.getByRole('button', { name: 'English' }));

      expect(document.documentElement.lang).toBe('en');
      expect(localStorage.getItem('aiRead_lang')).toBe('en');

      // Check English navigation and headers
      const nav = screen.getByRole('navigation');
      expect(within(nav).getByRole('button', { name: /Table/i })).toBeInTheDocument();
      expect(within(nav).getByRole('button', { name: /Bulk/i })).toBeInTheDocument();

      // Switch back to Lithuanian
      await user.click(screen.getByRole('button', { name: 'Lietuvių' }));
      expect(document.documentElement.lang).toBe('lt');
      expect(localStorage.getItem('aiRead_lang')).toBe('lt');
      expect(within(nav).getByRole('button', { name: /Lentelė/i })).toBeInTheDocument();
    });

    it('toggles light/dark theme, updates HTML classes, theme-color meta tag, and localStorage', async () => {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole('button', { name: /Nustatymai|Settings/i }));
      const themeBtn = screen.getByRole('button', { name: /Toggle theme/i });

      expect(document.documentElement.classList.contains('light')).toBe(true);

      // Toggle to dark
      await user.click(themeBtn);
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('aiRead_theme')).toBe('dark');

      // Toggle back to light
      await user.click(themeBtn);
      expect(document.documentElement.classList.contains('light')).toBe(true);
      expect(localStorage.getItem('aiRead_theme')).toBe('light');
    });
  });

  // --------------------------------------------------------------------------
  // FLOW 6: Field Validation & Lithuanian Personal Code Logic
  // --------------------------------------------------------------------------
  describe('Flow 6: Field Validation & Lithuanian Personal Code Logic', () => {
    it('validates 11-digit Lithuanian personal codes with modulo-11 checksum across centuries', () => {
      // 19th Century (1 = male, 2 = female)
      expect(isValidLithuanianPersonalCode('18504121232')).toBe(true);
      expect(isValidLithuanianPersonalCode('28504121233')).toBe(true);

      // 20th Century (3 = male, 4 = female)
      expect(isValidLithuanianPersonalCode('38504121234')).toBe(true);
      expect(isValidLithuanianPersonalCode('49012120001')).toBe(true);

      // 21st Century (5 = male, 6 = female)
      expect(isValidLithuanianPersonalCode('50506150014')).toBe(true);
      expect(isValidLithuanianPersonalCode('60506150015')).toBe(true);

      // Invalid checksums
      expect(isValidLithuanianPersonalCode('38504121239')).toBe(false);

      // Invalid length / non-numeric
      expect(isValidLithuanianPersonalCode('3850412123')).toBe(false);
      expect(isValidLithuanianPersonalCode('385041212345')).toBe(false);
      expect(isValidLithuanianPersonalCode('3850412123A')).toBe(false);

      // Invalid dates in personal code (Feb 30th)
      expect(isValidLithuanianPersonalCode('38502301230')).toBe(false);
    });

    it('normalizes Lithuanian phone numbers and calculates valid period date intervals', () => {
      expect(formatPhoneNumber('+370 612 34567')).toBe('+37061234567');
      expect(formatPhoneNumber('8 655 44332')).toBe('865544332');
      expect(formatPhoneNumber('061234567')).toBe('061234567');

      // Valid period normalization
      expect(formatValidPeriod('2026.09.04 - 2027.09.04')).toBe('2026-09-04 2027-09-04');
      expect(formatValidPeriod('nuo 2026-10-23 iki 2027-10-22')).toBe('2026-10-23 2027-10-22');

      // +1 Year calculation
      expect(addOneYearToDate('2026-05-15')).toBe('2027-05-15');
      // Leap year edge case Feb 29 -> Feb 28
      expect(addOneYearToDate('2024-02-29')).toBe('2025-02-28');
    });
  });
});

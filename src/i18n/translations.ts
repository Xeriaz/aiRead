export type Language = 'lt' | 'en';

export interface Translations {
  appName: string;
  appSubtitle: string;
  navTable: string;
  navImport: string;
  navBulk: string;
  navSettings: string;
  columns: {
    rowNumber: string;
    imageName: string;
    fullName: string;
    address: string;
    phone: string;
    licensePlate: string;
    carModel: string;
    validPeriod: string;
    personalCode: string;
    accuracyScore: string;
    actions: string;
  };
  placeholders: {
    search: string;
    fullName: string;
    address: string;
    phone: string;
    licensePlate: string;
    carModel: string;
    validPeriod: string;
    personalCode: string;
    rawText: string;
  };
  actions: {
    addNew: string;
    importPhoto: string;
    selectMultiplePhotos: string;
    stopBatch: string;
    approveAndMove: string;
    approveAndNext: string;
    approve: string;
    skip: string;
    rejectDelete: string;
    verifyItem: string;
    sortLowestAccuracy: string;
    sortInsertionOrder: string;
    save: string;
    update: string;
    cancel: string;
    edit: string;
    delete: string;
    deleteAll: string;
    duplicate: string;
    clear: string;
    parseText: string;
    addOneYear: string;
    exportCsv: string;
    exportXlsx: string;
    exportJson: string;
    viewCards: string;
    viewTable: string;
    exportProtected: string;
    importBackup: string;
  };
  labels: {
    recordsCount: string;
    noRecordsTitle: string;
    noRecordsDesc: string;
    newRecordTitle: string;
    editRecordTitle: string;
    importTitle: string;
    importSubtitle: string;
    bulkTitle: string;
    bulkSubtitle: string;
    uploadOrTakePhoto: string;
    processingOcr: string;
    processingBatchItem: string;
    ocrErrorNotice: string;
    verifyOneByOneTitle: string;
    pendingVerificationCount: string;
    stagingTableTitle: string;
    noStagingTitle: string;
    noStagingDesc: string;
    ocrRawText: string;
    verifiedFields: string;
    emptyFieldBadge: string;
    emptyFieldsSummary: string;
    allFieldsFilled: string;
    privacyBadge: string;
    startDate: string;
    endDate: string;
    language: string;
    appearance: string;
    lightMode: string;
    darkMode: string;
    exportData: string;
    exportSubtitle: string;
    dataManagement: string;
    confirmDeleteAll: string;
    statusActive: string;
    statusExpiring: string;
    statusExpired: string;
    backupModalTitle: string;
    backupExportTab: string;
    backupImportTab: string;
    backupExportDesc: string;
    backupImportDesc: string;
    backupPassword: string;
    backupPasswordConfirm: string;
    backupPasswordMismatch: string;
    backupPasswordMinLength: string;
    backupExportAction: string;
    backupImportAction: string;
    backupSelectFile: string;
    backupDropNotice: string;
    backupDecryptAction: string;
    backupWrongPassword: string;
    backupInvalidFile: string;
    backupMergeAction: string;
    backupReplaceAction: string;
    backupSuccessImport: string;
    backupEncryptionNotice: string;
    backupPhoneToPcNotice: string;
    statsTotalRecords: string;
    statsActive: string;
    statsExpiring: string;
    statsExpired: string;
    statsAvgAccuracy: string;
  };
}

export const translations: Record<Language, Translations> = {
  lt: {
    appName: 'aiRead',
    appSubtitle: 'Duomenų nuskaitymas ir lentelė',
    navTable: 'Lentelė',
    navImport: 'Importas',
    navBulk: 'Masinis',
    navSettings: 'Nustatymai',
    columns: {
      rowNumber: 'Eil. Nr.',
      imageName: 'Nuotrauka / Failas',
      fullName: 'Vardas Pavardė',
      address: 'Adresas',
      phone: 'Telefonas',
      licensePlate: 'Valst. Nr.',
      carModel: 'Modelis',
      validPeriod: 'Galiojimas',
      personalCode: 'Asmens kodas',
      accuracyScore: 'Tikslumas',
      actions: 'Veiksmai',
    },
    placeholders: {
      search: 'Ieškoti pagal vardą, valst. nr., modelį, tel., a.k...',
      fullName: 'Jonas Jonaitis',
      address: 'Gedimino pr. 15-4, Vilnius',
      phone: '+37061234567',
      licensePlate: 'ABC 123',
      carModel: 'TOYOTA COROLLA',
      validPeriod: '2026-09-04 2027-09-04',
      personalCode: '38504121234',
      rawText: 'Įklijuokite arba redaguokite nuskaitytą tekstą greitam laukų atpažinimui...',
    },
    actions: {
      addNew: 'Naujas įrašas',
      importPhoto: 'Nuskaityti nuotrauką',
      selectMultiplePhotos: 'Pasirinkti kelias nuotraukas',
      stopBatch: 'Sustabdyti',
      approveAndMove: 'Patvirtinti ir perkelti į lentelę',
      approveAndNext: 'Patvirtinti ir toliau ->',
      approve: 'Patvirtinti',
      skip: 'Praleisti',
      rejectDelete: 'Atmesti / Ištrinti',
      verifyItem: 'Tikrinti',
      sortLowestAccuracy: 'Rikiuoti: mažiausias tikslumas viršuje',
      sortInsertionOrder: 'Rikiuoti: įkėlimo tvarka',
      save: 'Išsaugoti įrašą',
      update: 'Atnaujinti įrašą',
      cancel: 'Atšaukti',
      edit: 'Redaguoti',
      delete: 'Ištrinti',
      deleteAll: 'Ištrinti visus įrašus',
      duplicate: 'Dubliuoti',
      clear: 'Išvalyti',
      parseText: 'Atpažinti laukus iš teksto',
      addOneYear: '+1 metai',
      exportCsv: 'CSV',
      exportXlsx: 'XLSX',
      exportJson: 'JSON',
      viewCards: 'Kortelės',
      viewTable: 'Lentelė',
      exportProtected: 'Apsaugotas eksportas',
      importBackup: 'Importuoti atsarginę kopiją',
    },
    labels: {
      recordsCount: 'Įrašai',
      noRecordsTitle: 'Įrašų dar nėra',
      noRecordsDesc: 'Pridėkite įrašą rankiniu būdu arba nuskaitykite iš nuotraukos.',
      newRecordTitle: 'Naujas įrašas',
      editRecordTitle: 'Redaguoti įrašą',
      importTitle: 'Importas iš nuotraukos',
      importSubtitle:
        'Vietinis optinis teksto atpažinimas (OCR) ir laukų išgavimas be išorinių tarnybų.',
      bulkTitle: 'Masinis įkėlimas ir patikra',
      bulkSubtitle:
        'Įkelkite kelias nuotraukas iš eilės — įrašai patenka į laikiną patikros eilę su failo pavadinimu.',
      uploadOrTakePhoto: 'Pasirinkite arba nufotografuokite dokumentą',
      processingOcr: 'Atpažįstamas tekstas įrenginyje...',
      processingBatchItem: 'Apdorojama: {current} iš {total} ({fileName})...',
      ocrErrorNotice:
        'Nepavyko nuskaityti nuotraukos teksto. Duomenis galite suvesti rankiniu būdu.',
      verifyOneByOneTitle: 'Tikrinti po vieną ({current} iš {total})',
      pendingVerificationCount: 'Laukia patvirtinimo ({count})',
      stagingTableTitle: 'Laikina patikros lentelė',
      noStagingTitle: 'Patikros eilė tuščia',
      noStagingDesc: 'Pasirinkite kelias nuotraukas masiniam nuskaitymui ir patikrai.',
      ocrRawText: 'Nuskaitytas tekstas (OCR / įklijuotas)',
      verifiedFields: 'Atpažinti duomenys (patikrinkite prieš išsaugant)',
      emptyFieldBadge: 'Neužpildyta',
      emptyFieldsSummary: 'Neužpildyti stulpeliai ({count}):',
      allFieldsFilled: 'Visi stulpeliai užpildyti (7/7)',
      privacyBadge:
        'Privatumas: nuotraukos apdorojamos tik laikinoje atmintyje ir niekur nesaugomos.',
      startDate: 'Pradžia',
      endDate: 'Pabaiga',
      language: 'Kalba / Language',
      appearance: 'Išvaizda',
      lightMode: 'Šviesi tema',
      darkMode: 'Tamsi tema',
      exportData: 'Eksportuoti duomenis',
      exportSubtitle: 'Atsisiųskite visus lentelės įrašus CSV, XLSX arba JSON formatu.',
      dataManagement: 'Duomenų valdymas',
      confirmDeleteAll: 'Ar tikrai norite ištrinti visus įrašus?',
      statusActive: 'Galioja',
      statusExpiring: 'Baigiasi',
      statusExpired: 'Pasibaigęs',
      backupModalTitle: 'Duomenų sinchronizavimas ir atsarginė kopija',
      backupExportTab: 'Apsaugotas eksportas (iš telefono)',
      backupImportTab: 'Importuoti duomenis (į kompiuterį / naršyklę)',
      backupExportDesc:
        'Eksportuokite duomenis užšifruotus stipriu AES-256-GCM šifru su PBKDF2 raktu ir SHA-256 vientisumo parašu. Failą saugu siųsti per el. paštą, AirDrop ar debesį.',
      backupImportDesc:
        'Pasirinkite iš telefono eksportuotą apsaugotą failą (.airead arba .json) ir įveskite slaptažodį duomenų iššifravimui.',
      backupPassword: 'Šifravimo slaptažodis',
      backupPasswordConfirm: 'Pakartokite slaptažodį',
      backupPasswordMismatch: 'Slaptažodžiai nesutampa',
      backupPasswordMinLength: 'Slaptažodis turi būti bent 4 simbolių',
      backupExportAction: 'Atsisiųsti užšifruotą failą (.airead)',
      backupImportAction: 'Importuoti įrašus',
      backupSelectFile: 'Pasirinkite failą (.airead / .json)',
      backupDropNotice: 'Nutempkite failą čia arba spustelėkite pasirinkimui',
      backupDecryptAction: 'Iššifruoti ir patikrinti',
      backupWrongPassword: 'Neteisingas slaptažodis arba sugadintas failas',
      backupInvalidFile: 'Netinkamas failo formatas',
      backupMergeAction: 'Sujungti su esamais įrašais',
      backupReplaceAction: 'Pakeisti visus įrašus (perrašyti)',
      backupSuccessImport: 'Sėkmingai importuota įrašų: {count}',
      backupEncryptionNotice: 'AES-256-GCM + PBKDF2 + SHA-256 autentiškas šifravimas',
      backupPhoneToPcNotice:
        'Kaip perkelti: telefone nustatykite slaptažodį ir eksportuokite -> atsiųskite failą į kompiuterį -> kompiuterio naršyklėje atidarykite aiRead ir importuokite!',
      statsTotalRecords: 'Iš viso įrašų',
      statsActive: 'Galiojantys',
      statsExpiring: 'Besibaigiantys',
      statsExpired: 'Pasibaigę',
      statsAvgAccuracy: 'Vidutinis tikslumas',
    },
  },
  en: {
    appName: 'aiRead',
    appSubtitle: 'Document Reader & CRUD Table',
    navTable: 'Table',
    navImport: 'Import',
    navBulk: 'Bulk',
    navSettings: 'Settings',
    columns: {
      rowNumber: 'No.',
      imageName: 'Image Name',
      fullName: 'Full Name',
      address: 'Address',
      phone: 'Phone',
      licensePlate: 'License Plate',
      carModel: 'Car Model',
      validPeriod: 'Validity Period',
      personalCode: 'Personal Code',
      accuracyScore: 'Accuracy',
      actions: 'Actions',
    },
    placeholders: {
      search: 'Search name, plate, model, phone, personal code...',
      fullName: 'Jonas Jonaitis',
      address: 'Gedimino pr. 15-4, Vilnius',
      phone: '+37061234567',
      licensePlate: 'ABC 123',
      carModel: 'TOYOTA COROLLA',
      validPeriod: '2026-09-04 2027-09-04',
      personalCode: '38504121234',
      rawText: 'Paste or edit scanned text here for automatic field extraction...',
    },
    actions: {
      addNew: 'Add Record',
      importPhoto: 'Scan Photo',
      selectMultiplePhotos: 'Select Multiple Photos',
      stopBatch: 'Stop Batch',
      approveAndMove: 'Approve & Move to Main Table',
      approveAndNext: 'Approve & Next ->',
      approve: 'Approve',
      skip: 'Skip',
      rejectDelete: 'Reject / Delete',
      verifyItem: 'Verify',
      sortLowestAccuracy: 'Sort: Lowest Accuracy First',
      sortInsertionOrder: 'Sort: Upload Order',
      save: 'Save Record',
      update: 'Update Record',
      cancel: 'Cancel',
      edit: 'Edit',
      delete: 'Delete',
      deleteAll: 'Delete All Records',
      duplicate: 'Duplicate',
      clear: 'Clear',
      parseText: 'Extract Fields from Text',
      addOneYear: '+1 Year',
      exportCsv: 'CSV',
      exportXlsx: 'XLSX',
      exportJson: 'JSON',
      viewCards: 'Cards',
      viewTable: 'Table',
      exportProtected: 'Protected Export',
      importBackup: 'Import Backup',
    },
    labels: {
      recordsCount: 'Records',
      noRecordsTitle: 'No records yet',
      noRecordsDesc: 'Add a record manually or import from a document photo.',
      newRecordTitle: 'New Record',
      editRecordTitle: 'Edit Record',
      importTitle: 'Import via Photo',
      importSubtitle: '100% local on-device OCR & RegExp extraction without external AI services.',
      bulkTitle: 'Bulk Import & Verification',
      bulkSubtitle:
        'Upload multiple photos sequentially — items enter a staging queue with their image filename for verification.',
      uploadOrTakePhoto: 'Choose or take a photo of a document',
      processingOcr: 'Extracting text locally on device...',
      processingBatchItem: 'Processing {current} of {total} ({fileName})...',
      ocrErrorNotice:
        'Failed to extract text from photo. You can fill in the fields manually.',
      verifyOneByOneTitle: 'Verify One-by-One ({current} of {total})',
      pendingVerificationCount: 'Pending Verification ({count})',
      stagingTableTitle: 'Staging Queue Table',
      noStagingTitle: 'Staging queue is empty',
      noStagingDesc: 'Select multiple photos for sequential OCR and manual verification.',
      ocrRawText: 'Extracted Text (OCR / Paste)',
      verifiedFields: 'Extracted Fields (verify before saving)',
      emptyFieldBadge: 'Empty',
      emptyFieldsSummary: 'Empty columns ({count}):',
      allFieldsFilled: 'All columns filled (7/7)',
      privacyBadge: 'Privacy: photos are processed in RAM only and never saved to database.',
      startDate: 'Start',
      endDate: 'End',
      language: 'Language / Kalba',
      appearance: 'Appearance',
      lightMode: 'Light Mode',
      darkMode: 'Dark Mode',
      exportData: 'Export Data',
      exportSubtitle: 'Download all table records in CSV, XLSX, or JSON format.',
      dataManagement: 'Data Management',
      confirmDeleteAll: 'Are you sure you want to delete all records?',
      statusActive: 'Valid',
      statusExpiring: 'Expiring soon',
      statusExpired: 'Expired',
      backupModalTitle: 'Data Sync & Backup Protection',
      backupExportTab: 'Protected Export (from Phone)',
      backupImportTab: 'Import Data (on PC / Browser)',
      backupExportDesc:
        'Export records protected with authenticated AES-256-GCM encryption, PBKDF2 key derivation, and SHA-256 tamper-proof checksum. Completely safe to send via email, AirDrop, or cloud drive.',
      backupImportDesc:
        'Select the protected backup file (.airead or .json) exported from your phone, and enter your password to safely restore your records.',
      backupPassword: 'Encryption Password',
      backupPasswordConfirm: 'Confirm Password',
      backupPasswordMismatch: 'Passwords do not match',
      backupPasswordMinLength: 'Password must be at least 4 characters long',
      backupExportAction: 'Download Encrypted File (.airead)',
      backupImportAction: 'Import Records',
      backupSelectFile: 'Select File (.airead / .json)',
      backupDropNotice: 'Drop backup file here, or click to browse',
      backupDecryptAction: 'Decrypt & Verify File',
      backupWrongPassword: 'Incorrect password or corrupted file',
      backupInvalidFile: 'Invalid file format',
      backupMergeAction: 'Merge with Existing Records',
      backupReplaceAction: 'Replace All Existing Records',
      backupSuccessImport: 'Successfully imported {count} records',
      backupEncryptionNotice: 'AES-256-GCM + PBKDF2 + SHA-256 Authenticated Encryption',
      backupPhoneToPcNotice:
        'Phone-to-PC Workflow: Scan on phone -> Protected Export with password -> Send to PC -> Open aiRead on PC browser & Import!',
      statsTotalRecords: 'Total Records',
      statsActive: 'Active',
      statsExpiring: 'Expiring Soon',
      statsExpired: 'Expired',
      statsAvgAccuracy: 'Avg. Accuracy',
    },
  },
};

export type Language = 'lt' | 'en';

export interface Translations {
  appName: string;
  appSubtitle: string;
  navTable: string;
  navImport: string;
  navSettings: string;
  columns: {
    rowNumber: string;
    fullName: string;
    address: string;
    phone: string;
    licensePlate: string;
    carModel: string;
    validPeriod: string;
    personalCode: string;
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
  };
  labels: {
    recordsCount: string;
    noRecordsTitle: string;
    noRecordsDesc: string;
    newRecordTitle: string;
    editRecordTitle: string;
    importTitle: string;
    importSubtitle: string;
    uploadOrTakePhoto: string;
    processingOcr: string;
    ocrRawText: string;
    verifiedFields: string;
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
  };
}

export const translations: Record<Language, Translations> = {
  lt: {
    appName: 'aiRead',
    appSubtitle: 'Duomenų nuskaitymas ir lentelė',
    navTable: 'Lentelė',
    navImport: 'Importas',
    navSettings: 'Nustatymai',
    columns: {
      rowNumber: 'Eil. Nr.',
      fullName: 'Vardas Pavardė',
      address: 'Adresas',
      phone: 'Telefonas',
      licensePlate: 'Valst. Nr.',
      carModel: 'Modelis',
      validPeriod: 'Galiojimas',
      personalCode: 'Asmens kodas',
      actions: 'Veiksmai',
    },
    placeholders: {
      search: 'Ieškoti pagal vardą, valst. nr., modelį, tel., a.k...',
      fullName: 'Jonas Jonaitis',
      address: 'Gedimino pr. 15-4, Vilnius',
      phone: '0-612-34567',
      licensePlate: 'ABC 123',
      carModel: 'TOYOTA COROLLA',
      validPeriod: '2026-09-04 2027-09-04',
      personalCode: '38504121234',
      rawText: 'Įklijuokite arba redaguokite nuskaitytą tekstą greitam laukų atpažinimui...',
    },
    actions: {
      addNew: 'Naujas įrašas',
      importPhoto: 'Nuskaityti nuotrauką',
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
      uploadOrTakePhoto: 'Pasirinkite arba nufotografuokite dokumentą',
      processingOcr: 'Atpažįstamas tekstas įrenginyje...',
      ocrRawText: 'Nuskaitytas tekstas (OCR / įklijuotas)',
      verifiedFields: 'Atpažinti duomenys (patikrinkite prieš išsaugant)',
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
    },
  },
  en: {
    appName: 'aiRead',
    appSubtitle: 'Document Reader & CRUD Table',
    navTable: 'Table',
    navImport: 'Import',
    navSettings: 'Settings',
    columns: {
      rowNumber: 'No.',
      fullName: 'Full Name',
      address: 'Address',
      phone: 'Phone',
      licensePlate: 'License Plate',
      carModel: 'Car Model',
      validPeriod: 'Validity Period',
      personalCode: 'Personal Code',
      actions: 'Actions',
    },
    placeholders: {
      search: 'Search name, plate, model, phone, personal code...',
      fullName: 'Jonas Jonaitis',
      address: 'Gedimino pr. 15-4, Vilnius',
      phone: '0-612-34567',
      licensePlate: 'ABC 123',
      carModel: 'TOYOTA COROLLA',
      validPeriod: '2026-09-04 2027-09-04',
      personalCode: '38504121234',
      rawText: 'Paste or edit scanned text here for automatic field extraction...',
    },
    actions: {
      addNew: 'Add Record',
      importPhoto: 'Scan Photo',
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
    },
    labels: {
      recordsCount: 'Records',
      noRecordsTitle: 'No records yet',
      noRecordsDesc: 'Add a record manually or import from a document photo.',
      newRecordTitle: 'New Record',
      editRecordTitle: 'Edit Record',
      importTitle: 'Import via Photo',
      importSubtitle: '100% local on-device OCR & RegExp extraction without external AI services.',
      uploadOrTakePhoto: 'Choose or take a photo of a document',
      processingOcr: 'Extracting text locally on device...',
      ocrRawText: 'Extracted Text (OCR / Paste)',
      verifiedFields: 'Extracted Fields (verify before saving)',
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
    },
  },
};

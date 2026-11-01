export interface ParsedDocumentFields {
  fullName: string;
  address: string;
  phone: string;
  licensePlate: string;
  carModel: string;
  validPeriod: string;
  personalCode: string;
}

export type ParsedDocumentCandidates = Record<keyof ParsedDocumentFields, string[]>;

const CAR_MAKES = [
  'MERCEDES-BENZ',
  'MERCEDES BENZ',
  'ALFA ROMEO',
  'LAND ROVER',
  'VOLKSWAGEN',
  'MITSUBISHI',
  'CHEVROLET',
  'CHRYSLER',
  'MERCEDES',
  'PEUGEOT',
  'RENAULT',
  'CITROËN',
  'CITROEN',
  'HYUNDAI',
  'PORSCHE',
  'TOYOTA',
  'NISSAN',
  'SUBARU',
  'MAZDA',
  'VOLVO',
  'ŠKODA',
  'SKODA',
  'HONDA',
  'LEXUS',
  'TESLA',
  'DACIA',
  'SUZUKI',
  'DODGE',
  'JAGUAR',
  'AUDI',
  'FORD',
  'OPEL',
  'SEAT',
  'CUPRA',
  'JEEP',
  'MINI',
  'FIAT',
  'SAAB',
  'BMW',
  'KIA',
  'VW',
];

const CAR_MAKE_PATTERNS = CAR_MAKES.map((make) => {
  const escapedMake = make.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    make,
    wordBoundaryRegex: new RegExp(`\\b${escapedMake}\\b`, 'i'),
    modelLineRegex: new RegExp(
      `\\b(${escapedMake})\\b(?:[\\s,/-]+([A-Z0-9ĄČĘĖĮŠŲŪŽ][A-Za-z0-9ĄČĘĖĮŠŲŪŽąčęėįšųūž.-]{0,15}(?:\\s+[A-Z0-9][A-Za-z0-9.-]{0,12})?))?`,
      'i'
    ),
  };
});

const FALSE_POSITIVE_PLATES = new Set([
  'EUR',
  'PVM',
  'UAB',
  'VŠĮ',
  'VSI',
  'LTU',
  'TEL',
  'NR.',
  'NR',
  'nuo',
  'IKI',
  'AB',
  'MB',
  'kod',
  'KOD',
  'VIN',
  'MET',
  'SER',
]);

const LITHUANIAN_PERSONAL_CODE_DATE_REGEX =
  /^[1-6]\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{4}$/;

function addUniqueCandidate(list: string[], value: string): void {
  const cleaned = value.trim();
  if (!cleaned) return;
  if (!list.some((item) => item.toLowerCase() === cleaned.toLowerCase())) {
    list.push(cleaned);
  }
}

/**
 * Validates that a (year, month, day) triple represents a real calendar date
 * (rejecting e.g. Feb 30, Feb 31, Apr 31, or Feb 29 on non-leap years).
 */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1800 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

/**
 * Computes official Modulo-11 checksum for the first 10 digits of a Lithuanian personal code.
 * Returns null if input is not exactly 10 digits.
 */
export function computeLithuanianPersonalCodeChecksum(tenDigits: string): number | null {
  if (!tenDigits || tenDigits.length !== 10 || !/^\d{10}$/.test(tenDigits)) {
    return null;
  }
  const digits = tenDigits.split('').map(Number);
  const weights1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1];
  const weights2 = [3, 4, 5, 6, 7, 8, 9, 1, 2, 3];

  let sum1 = 0;
  for (let i = 0; i < 10; i++) {
    sum1 += digits[i] * weights1[i];
  }
  let remainder = sum1 % 11;

  if (remainder === 10) {
    let sum2 = 0;
    for (let i = 0; i < 10; i++) {
      sum2 += digits[i] * weights2[i];
    }
    remainder = sum2 % 11;
    if (remainder === 10) {
      remainder = 0;
    }
  }

  return remainder;
}

/**
 * Validates an 11-digit Lithuanian personal code (Asmens kodas),
 * including strict calendar birth date validation and the official modulo-11 checksum algorithm.
 */
export function isValidLithuanianPersonalCode(code: string): boolean {
  if (!code) return false;
  const trimmed = code.trim();
  if (!LITHUANIAN_PERSONAL_CODE_DATE_REGEX.test(trimmed)) {
    return false;
  }

  const digits = trimmed.split('').map(Number);
  const firstDigit = digits[0];
  const century = firstDigit === 1 || firstDigit === 2 ? 1800 : firstDigit === 3 || firstDigit === 4 ? 1900 : 2000;
  const yy = Number(trimmed.slice(1, 3));
  const mm = Number(trimmed.slice(3, 5));
  const dd = Number(trimmed.slice(5, 7));

  if (!isValidCalendarDate(century + yy, mm, dd)) {
    return false;
  }

  const currentYear = new Date().getFullYear();
  if (century + yy > currentYear + 1) {
    return false;
  }

  const expectedChecksum = computeLithuanianPersonalCodeChecksum(trimmed.slice(0, 10));
  return expectedChecksum !== null && digits[10] === expectedChecksum;
}

/**
 * Attempts to repair an 11-digit Lithuanian personal code that failed checksum,
 * testing single-digit OCR handwriting confusions and single-digit mutations
 * to find if a unique valid personal code with matching calendar date and checksum exists.
 */
export function repairLithuanianPersonalCode(code: string): string | null {
  if (!code || code.length !== 11 || !/^\d{11}$/.test(code)) {
    return null;
  }
  if (isValidLithuanianPersonalCode(code)) {
    return code;
  }

  // Case 1: The first 10 digits form a valid date, only the 11th checksum digit was misread/corrupted
  const tenDigits = code.slice(0, 10);
  const firstDigit = Number(tenDigits[0]);
  const century = firstDigit === 1 || firstDigit === 2 ? 1800 : firstDigit === 3 || firstDigit === 4 ? 1900 : 2000;
  const yy = Number(tenDigits.slice(1, 3));
  const mm = Number(tenDigits.slice(3, 5));
  const dd = Number(tenDigits.slice(5, 7));
  const currentYear = new Date().getFullYear();

  if (isValidCalendarDate(century + yy, mm, dd) && century + yy <= currentYear + 1) {
    const expectedChecksum = computeLithuanianPersonalCodeChecksum(tenDigits);
    if (expectedChecksum !== null) {
      return `${tenDigits}${expectedChecksum}`;
    }
  }

  // Case 2: One of the first 10 digits was misread/confused
  const digits = code.split("");
  const validRepairs: string[] = [];

  const confusionMap: Record<string, string[]> = {
    "0": ["6", "8", "9"],
    "1": ["7", "4"],
    "2": ["7", "3"],
    "3": ["5", "8", "9"],
    "4": ["1", "9", "5"],
    "5": ["3", "6", "8", "4"],
    "6": ["0", "5", "8"],
    "7": ["1", "2"],
    "8": ["0", "3", "6", "9", "5"],
    "9": ["0", "8", "3", "4"],
  };

  for (let pos = 0; pos < 10; pos++) {
    const orig = digits[pos];
    const alts = confusionMap[orig] || [];
    for (const alt of alts) {
      digits[pos] = alt;
      const candidate = digits.join("");
      if (isValidLithuanianPersonalCode(candidate)) {
        if (!validRepairs.includes(candidate)) {
          validRepairs.push(candidate);
        }
      }
    }
    digits[pos] = orig;
  }

  if (validRepairs.length === 1) {
    return validRepairs[0];
  }

  return null;
}

export function normalizeOcrDigits(raw: string): string {
  return raw
    .replace(/[OoD]/g, '0')
    .replace(/[Il|\/!\]]/g, '1')
    .replace(/[Zz]/g, '2')
    .replace(/[E]/g, '3')
    .replace(/[Ah]/g, '4')
    .replace(/[Ss]/g, '5')
    .replace(/[bG]/g, '6')
    .replace(/[TF]/g, '7')
    .replace(/[B]/g, '8')
    .replace(/[gq]/g, '9');
}

/**
 * Validates a Lithuanian phone string (mobile or landline):
 * - "+370" followed by 7 or 8 digits (total 10-11 digits)
 * - "00370" followed by 7 or 8 digits (total 12-13 digits)
 * - "370" followed by 7 or 8 digits (total 10-11 digits)
 * - "8" followed by 8 digits (total 9 digits, e.g. 861234567, 85249226)
 * - "0" followed by 8 digits (total 9 digits, e.g. 061234567, 067466499)
 * - 8 digits starting with 5 or 6 (mobile/landline, e.g. 61234567, 5249226)
 * - Legacy formatted /^0-\d{3}-\d{5}$/
 */
export function isValidLithuanianPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  if (/^0-\d{3}-\d{5}$/.test(trimmed)) return true;
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+370')) {
    return digits.length >= 10 && digits.length <= 11;
  }
  if (digits.startsWith('00370')) {
    return digits.length >= 12 && digits.length <= 13;
  }
  if (digits.startsWith('370')) {
    return digits.length >= 10 && digits.length <= 11;
  }
  if (digits.startsWith('8') || digits.startsWith('0')) {
    return digits.length === 9;
  }
  if (digits.startsWith('5') || digits.startsWith('6')) {
    return digits.length === 8;
  }
  return false;
}

export function calculateAccuracyScore(
  fields: ParsedDocumentFields,
  ocrConfidence?: number
): number {
  let fieldScore = 0;

  // 1. personalCode (20 pts): 20 pts if 11-digit valid date + valid checksum; 14 pts if 11-digit valid date pattern; 0 pts otherwise.
  const pc = (fields.personalCode || '').trim();
  if (isValidLithuanianPersonalCode(pc)) {
    fieldScore += 20;
  } else if (LITHUANIAN_PERSONAL_CODE_DATE_REGEX.test(pc)) {
    fieldScore += 14;
  }

  // 2. validPeriod (20 pts): 20 pts if valid YYYY-MM-DD YYYY-MM-DD with startDate <= endDate; 10 pts if single valid YYYY-MM-DD; 0 pts otherwise.
  const vp = (fields.validPeriod || '').trim();
  if (vp) {
    const tokens =
      vp.match(/\b(?:\d{4}[-./]\d{2}[-./]\d{2}|\d{2}[-./]\d{2}[-./]\d{4})\b/g) || [];
    const validDates = tokens
      .map(normalizeSingleDate)
      .filter((d): d is string => Boolean(d));

    if (validDates.length >= 2) {
      if (validDates[0] <= validDates[1]) {
        fieldScore += 20;
      }
    } else if (validDates.length === 1) {
      fieldScore += 10;
    }
  }

  // 3. phone (15 pts): 15 pts if valid Lithuanian phone number; 7 pts if 7–12 digits; 0 pts otherwise.
  const ph = (fields.phone || '').trim();
  if (isValidLithuanianPhoneNumber(ph)) {
    fieldScore += 15;
  } else {
    const phoneDigits = ph.replace(/\D/g, '');
    if (phoneDigits.length >= 7 && phoneDigits.length <= 12) {
      fieldScore += 7;
    }
  }

  // 4. licensePlate (15 pts): 15 pts if matches standard Lithuanian plate; 7 pts if >= 4 alphanumeric chars; 0 pts otherwise.
  const plate = (fields.licensePlate || '').trim().toUpperCase();
  if (
    /^[A-Z]{3}\s\d{3}$/.test(plate) ||
    /^E[A-Z]\d{4}$/.test(plate) ||
    /^[A-Z]{2}\s?\d{3}$/.test(plate) ||
    /^\d{3}\s?[A-Z]{2,3}$/.test(plate)
  ) {
    fieldScore += 15;
  } else if (plate.replace(/[^A-Z0-9]/g, '').length >= 4) {
    fieldScore += 7;
  }

  // 5. carModel (10 pts): 10 pts if contains a known car make from CAR_MAKES; 5 pts if >= 2 chars; 0 pts otherwise.
  const model = (fields.carModel || '').trim().toUpperCase();
  if (model) {
    const hasKnownMake = CAR_MAKE_PATTERNS.some(({ wordBoundaryRegex }) =>
      wordBoundaryRegex.test(model)
    );
    if (hasKnownMake) {
      fieldScore += 10;
    } else if (model.length >= 2) {
      fieldScore += 5;
    }
  }

  // 6. fullName (10 pts): 10 pts if >= 2 words and >= 5 chars; 5 pts if non-empty; 0 pts otherwise.
  const name = (fields.fullName || '').trim();
  if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && name.length >= 5) {
      fieldScore += 10;
    } else {
      fieldScore += 5;
    }
  }

  // 7. address (10 pts): 10 pts if contains Lithuanian address markers and >= 6 chars; 5 pts if >= 4 chars; 0 pts otherwise.
  const addr = (fields.address || '').trim();
  if (addr) {
    const addressMarkerRegex =
      /(?:(?:^|\s|,)(?:g\.|gatvė|pr\.|al\.|k\.|raj\.|sav\.)(?=\s|,|$)|\bLT-\d{5}\b|\b\d+-\d+\b)/i;
    if (addr.length >= 6 && addressMarkerRegex.test(addr)) {
      fieldScore += 10;
    } else if (addr.length >= 4) {
      fieldScore += 5;
    }
  }

  if (typeof ocrConfidence === 'number' && !Number.isNaN(ocrConfidence)) {
    const clampedConfidence = Math.max(0, Math.min(100, ocrConfidence));
    return Math.max(0, Math.min(100, Math.round(fieldScore * 0.8 + clampedConfidence * 0.2)));
  }

  return Math.max(0, Math.min(100, Math.round(fieldScore)));
}

/**
 * Cleans any Lithuanian phone number representation without output formatting (no hyphens/spaces):
 * Preserves leading '+' if present and removes spaces, dashes, dots, parentheses:
 * e.g. "+370 612 34567" -> "+37061234567"
 * "8 612 34567" -> "861234567"
 * "0 612 34567" -> "061234567"
 * "0-612-34567" -> "061234567"
 * "+370 5 249226" -> "+3705249226"
 */
export function formatPhoneNumber(raw: string): string {
  if (!raw || !raw.trim()) return '';
  const trimmed = raw.trim();

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  return (hasPlus ? '+' : '') + digits;
}

/**
 * Normalizes a single date token (YYYY-MM-DD, YYYY.MM.DD, DD.MM.YYYY, DD/MM/YYYY) into YYYY-MM-DD.
 */
export function normalizeSingleDate(token: string): string | null {
  const cleaned = token.trim();

  // YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
  const ymd = cleaned.match(/^(\d{4})[-./](\d{2})[-./](\d{2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (year >= 1990 && year <= 2100 && isValidCalendarDate(year, month, day)) {
      return `${y}-${m}-${d}`;
    }
  }

  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const dmy = cleaned.match(/^(\d{2})[-./](\d{2})[-./](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (year >= 1990 && year <= 2100 && isValidCalendarDate(year, month, day)) {
      return `${y}-${m}-${d}`;
    }
  }

  return null;
}

/**
 * Given a YYYY-MM-DD start date, returns YYYY-MM-DD exactly 1 year later.
 */
export function addOneYearToDate(isoDate: string): string {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]) + 1;
  const month = match[2];
  const day = match[3];
  // Handle Feb 29 leap year edge case
  if (month === '02' && day === '29') {
    return `${year}-02-28`;
  }
  return `${year}-${month}-${day}`;
}

/**
 * Extracts 2-digit year table dates (e.g. Lithuanian Green Card / OCTA tables:
 * "GALIOJA / VALID", "Nuo / From", "Iki / To", "Metų / Year", "Mėn. / Month", "Dienos / Day",
 * "26 11 15 00:00 27 11 14 24:00" -> ["2026-11-15", "2027-11-14"]).
 */
export function extractTwoDigitTableDates(windowText: string): string[] {
  const dates: string[] = [];

  // Pattern A: Labeled with Metų/Year ... Mėn/Month ... Dienos/Day
  const labeledRegex =
    /(?:met[uų]|year)[\s:.-]*(\d{2,4})[^\d]+(?:m[eė]n|month)[\s:.-]*(\d{1,2})[^\d]+(?:dien|day)[\s:.-]*(\d{1,2})/gi;
  for (const m of windowText.matchAll(labeledRegex)) {
    const rawY = Number(m[1]);
    const y = rawY < 100 ? 2000 + rawY : rawY;
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (isValidCalendarDate(y, mo, d)) {
      const iso = y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      if (!dates.includes(iso)) {
        dates.push(iso);
      }
    }
  }

  if (dates.length >= 2) {
    return dates;
  }

  // Pattern B: Raw 2-digit year triples in table rows: e.g. "26 11 15 00:00 27 11 14 24:00" or "26 11 15"
  const tripleRegex = /\b(2[0-9])\s+(0?[1-9]|1[0-2])\s+(0?[1-9]|[12]\d|3[01])\b/g;
  for (const m of windowText.matchAll(tripleRegex)) {
    const y = 2000 + Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (isValidCalendarDate(y, mo, d)) {
      const iso = y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      if (!dates.includes(iso)) {
        dates.push(iso);
      }
    }
  }

  return dates;
}

/**
 * Normalizes a date range string into "YYYY-MM-DD YYYY-MM-DD" (e.g., "2026-09-04 2027-09-04").
 */
export function formatValidPeriod(raw: string, autoAddOneYearIfSingle = false): string {
  if (!raw || !raw.trim()) return "";
  const dateTokenRegex = /\b(?:\d{4}[-./]\d{2}[-./]\d{2}|\d{2}[-./]\d{2}[-./]\d{4})\b/g;
  const matches = raw.match(dateTokenRegex) || [];
  const normalized = matches
    .map(normalizeSingleDate)
    .filter((d): d is string => Boolean(d));

  if (normalized.length >= 2) {
    const [first, second] = normalized;
    return first <= second ? (first + " " + second) : (second + " " + first);
  }

  if (normalized.length === 0) {
    const tableDates = extractTwoDigitTableDates(raw);
    if (tableDates.length >= 2) {
      const [first, second] = tableDates;
      return first <= second ? (first + " " + second) : (second + " " + first);
    }
  }

  if (normalized.length === 1) {
    const start = normalized[0];
    if (autoAddOneYearIfSingle) {
      return start + " " + addOneYearToDate(start);
    }
    return start;
  }

  return raw.trim();
}

/**
 * Splits a "YYYY-MM-DD YYYY-MM-DD" period into [startDate, endDate].
 */
export function splitValidPeriod(validPeriod: string): [string, string] {
  const normalized = formatValidPeriod(validPeriod);
  const parts = normalized.split(/\s+/).filter(Boolean);
  return [parts[0] || '', parts[1] || ''];
}

/**
 * Extracts all distinct 11-digit Lithuanian personal code candidates while ignoring +3706... phone numbers.
 * Supports:
 * - Standard contiguous 11 digits
 * - Space-separated and delimited handwritten digits (e.g. "3 8 5 0 4 1 2 1 2 3 4" or "46 7 11 18 0212")
 * - Labeled single-line and multi-line codes (e.g. "a.k.", "asmens kodas", "personal code")
 * - OCR character confusion recovery (e.g. letter O -> 0, letter l/I -> 1)
 * - Single-digit checksum auto-correction
 * - Prioritizes checksum-verified codes at the top of candidate list
 */
export function extractPersonalCodeCandidates(text: string): string[] {
  if (!text) return [];
  const rawCandidates: string[] = [];
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const considerCandidate = (raw: string) => {
    if (!raw) return;
    const digitsOnly = raw.replace(/\D/g, '');
    if (digitsOnly.length === 11) {
      addUniqueCandidate(rawCandidates, digitsOnly);
      if (!isValidLithuanianPersonalCode(digitsOnly)) {
        const repaired = repairLithuanianPersonalCode(digitsOnly);
        if (repaired && repaired !== digitsOnly) {
          addUniqueCandidate(rawCandidates, repaired);
        }
      }
    } else if (digitsOnly.length === 10 && /^[1-6]\d{9}$/.test(digitsOnly)) {
      const checksum = computeLithuanianPersonalCodeChecksum(digitsOnly);
      if (checksum !== null) {
        const completed = `${digitsOnly}${checksum}`;
        if (isValidLithuanianPersonalCode(completed)) {
          addUniqueCandidate(rawCandidates, completed);
        }
      }
    }
  };

  // 1. Explicitly labeled personal codes (single-line and stacked multi-line)
  const labelPrefix = /(?:a\s*\.?\s*k\s*\.?|asmens\s+kodas|personal\s+code|id\s+kodas|a\/k)\b/i;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (labelPrefix.test(line)) {
      // Examine remaining text on same line
      const after = line
        .replace(/.*?(?:a\s*\.?\s*k\s*\.?|asmens\s+kodas|personal\s+code|id\s+kodas|a\/k)[:\s#-.]*/i, '')
        .trim();
      if (after) {
        const normalizedAfter = normalizeOcrDigits(after);
        const seqMatches = normalizedAfter.match(/[1-6](?:[\s./|\\-]*\d){9,10}/g);
        if (seqMatches) {
          for (const m of seqMatches) considerCandidate(m);
        } else {
          considerCandidate(normalizedAfter);
        }
      }

      // Examine next 1-2 lines for stacked/boxed layouts
      for (let j = i + 1; j < Math.min(rawLines.length, i + 3); j++) {
        const nextLine = rawLines[j];
        if (!nextLine || labelPrefix.test(nextLine)) break;
        if (/(?:adresas|tel|valst|galioj|mark[eė])/i.test(nextLine)) break;
        const normalizedNext = normalizeOcrDigits(nextLine);
        const seqMatches = normalizedNext.match(/[1-6](?:[\s./|\\-]*\d){9,10}/g);
        if (seqMatches) {
          for (const m of seqMatches) considerCandidate(m);
        } else {
          considerCandidate(normalizedNext);
        }
      }
    }
  }

  // 2. Scan contiguous 11-digit patterns
  const globalRegex = /\b([1-6]\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{4})\b/g;
  for (const match of text.matchAll(globalRegex)) {
    const candidate = match[1];
    const index = match.index ?? 0;
    const prefix = text.slice(Math.max(0, index - 4), index);
    if (prefix.includes('+')) continue;
    if (candidate.startsWith('3706')) {
      const lineStart = text.lastIndexOf('\n', index) + 1;
      const lineEnd = text.indexOf('\n', index);
      const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).toLowerCase();
      if (line.includes('tel') || line.includes('mob') || line.includes('phone')) {
        continue;
      }
    }
    considerCandidate(candidate);
  }

  // 3. Scan space-separated or delimiter-separated sequences across all lines
  for (const line of rawLines) {
    if (/\b(?:tel|mob|phone|iban|sąskaita)\b/i.test(line)) continue;
    const normalizedLine = normalizeOcrDigits(line);
    const matches = normalizedLine.match(/(?:^|[^0-9A-Za-z])([1-6](?:[\s./|\\-]*\d){10})(?:$|[^0-9A-Za-z])/g);
    if (matches) {
      for (const m of matches) {
        considerCandidate(m);
      }
    }
  }

  // 4. Filter and rank candidates:
  // - Top rank: Valid Lithuanian personal code with matching date and checksum
  // - Mid rank: Valid Lithuanian personal code date structure
  // - Low rank: Other 11-digit candidates
  const unique = Array.from(new Set(rawCandidates));
  unique.sort((a, b) => {
    const scoreA = isValidLithuanianPersonalCode(a)
      ? 100
      : LITHUANIAN_PERSONAL_CODE_DATE_REGEX.test(a)
      ? 50
      : 0;
    const scoreB = isValidLithuanianPersonalCode(b)
      ? 100
      : LITHUANIAN_PERSONAL_CODE_DATE_REGEX.test(b)
      ? 50
      : 0;
    return scoreB - scoreA;
  });

  return unique;
}

/**
 * Extracts 11-digit Lithuanian personal code while ignoring +3706... phone numbers.
 */
export function extractPersonalCode(text: string): string {
  return extractPersonalCodeCandidates(text)[0] || '';
}

/**
 * Extracts and normalizes all Lithuanian phone number candidates into "0-6XX-XXXXX".
 */
export function extractPhoneCandidates(
  text: string,
  excludePersonalCodes: string | string[] = ''
): string[] {
  if (!text) return [];
  const candidates: string[] = [];
  const excludedSet = new Set(
    (Array.isArray(excludePersonalCodes) ? excludePersonalCodes : [excludePersonalCodes]).filter(
      Boolean
    )
  );

  const checkAndAdd = (raw: string) => {
    const cleaned = formatPhoneNumber(raw);
    const digits = cleaned.replace(/\D/g, '');
    if (!digits || excludedSet.has(digits)) return;
    if (isValidLithuanianPhoneNumber(cleaned)) {
      addUniqueCandidate(candidates, cleaned);
    }
  };

  // 1. Look near phone labels first (supporting Tel., Mob., Phone No., Tel. / Phone No., etc.)
  // and supporting multiple numbers separated by semicolon, comma, slash, or whitespace
  const lines = text.split(/\r?\n/);
  const labelIndicator = /(?:tel(?:\.|efonas)?|mob(?:\.|ilus)?|phone(?:\s*no\.?)?)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (labelIndicator.test(line)) {
      const windowStr = [line, lines[i + 1] || ''].join(' ');
      const matches = windowStr.matchAll(/(?:\+370|00370|\b370|\b8|\b0)[\d\s()./-]{7,25}\b/g);
      for (const m of matches) {
        const subParts = m[0].split(/[;,/|\n]/);
        for (const sp of subParts) {
          checkAndAdd(sp);
        }
      }
    }
  }

  // 2. Scan general Lithuanian mobile & landline patterns across entire text
  const globalPhoneRegex =
    /(?:\+370|00370|\b370)[\s.-]*\(?[56]\d{1,2}\)?[\s.-]*\d{2}[\s.-]*\d{2,3}(?:[\s.-]*\d{2,3})?\b|\b[08][\s.-]*\(?[56]\d{1,2}\)?[\s.-]*\d{2}[\s.-]*\d{2,3}(?:[\s.-]*\d{2,3})?\b|\b(?:\+370|00370|370)\d{7,8}\b|\b[08][56]\d{7}\b/g;

  for (const match of text.matchAll(globalPhoneRegex)) {
    checkAndAdd(match[0]);
  }

  return candidates;
}

/**
 * Extracts and normalizes Lithuanian phone number into "0-6XX-XXXXX".
 */
export function extractPhone(text: string, excludePersonalCode = ''): string {
  return extractPhoneCandidates(text, excludePersonalCode)[0] || '';
}

/**
 * Extracts all validity period candidates ("YYYY-MM-DD YYYY-MM-DD").
 */
export function extractValidPeriodCandidates(text: string): string[] {
  if (!text) return [];
  const candidates: string[] = [];
  const lines = text.split(/\r?\n/);

  // 1. Prioritize lines with validity or table keywords
  const validityKeywords =
    /(?:galioj|laikotarp|nuo\b|iki\b|valid|period|term|pradž|pradz|pabaig|from\b|to\b|met[uų]|year|m[eė]n|month|dien|day)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (validityKeywords.test(line)) {
      const combinedWindow = lines
        .slice(Math.max(0, i - 1), Math.min(lines.length, i + 5))
        .join(" ");
      const dateTokens =
        combinedWindow.match(/\b(?:\d{4}[-./]\d{2}[-./]\d{2}|\d{2}[-./]\d{2}[-./]\d{4})\b/g) || [];
      const windowDates: string[] = [];
      for (const token of dateTokens) {
        const iso = normalizeSingleDate(token);
        if (iso && !windowDates.includes(iso)) {
          windowDates.push(iso);
        }
      }

      // Check 2-digit table dates (e.g. Green Card / OCTA tables: 26 11 15 27 11 14)
      if (windowDates.length < 2) {
        const tableDates = extractTwoDigitTableDates(combinedWindow);
        for (const td of tableDates) {
          if (!windowDates.includes(td)) {
            windowDates.push(td);
          }
        }
      }

      if (windowDates.length >= 2) {
        const [d1, d2] = windowDates;
        addUniqueCandidate(candidates, d1 <= d2 ? (d1 + " " + d2) : (d2 + " " + d1));
      } else if (windowDates.length === 1) {
        // Single date explicitly accompanied by a validity keyword
        addUniqueCandidate(candidates, windowDates[0]);
      }
    }
  }

  // 2. Scan all dates in text (non-overlapping adjacent pairs only if 2+ dates exist)
  const allTokens =
    text.match(/\b(?:\d{4}[-./]\d{2}[-./]\d{2}|\d{2}[-./]\d{2}[-./]\d{4})\b/g) || [];
  const allIso: string[] = [];
  for (const token of allTokens) {
    const iso = normalizeSingleDate(token);
    if (iso && !allIso.includes(iso)) {
      allIso.push(iso);
    }
  }

  if (allIso.length >= 2) {
    for (let i = 0; i + 1 < allIso.length; i += 2) {
      const d1 = allIso[i];
      const d2 = allIso[i + 1];
      addUniqueCandidate(candidates, d1 <= d2 ? (d1 + " " + d2) : (d2 + " " + d1));
    }
  }

  return candidates;
}

/**
 * Extracts validity period ("YYYY-MM-DD YYYY-MM-DD").
 */
export function extractValidPeriod(text: string): string {
  return extractValidPeriodCandidates(text)[0] || '';
}

/**
 * Extracts all Lithuanian license plate candidates (e.g. "ABC 123", "EA1234").
 */
export function extractLicensePlateCandidates(text: string): string[] {
  if (!text) return [];
  const candidates: string[] = [];

  // 1. Check explicitly labeled plates first (EV 6-char pattern before 2-3 letter + 3 digit pattern)
  const labeledRegex =
    /(?:valst\.?\s*nr\.?|valstybinis\s*nr\.?|reg\.?\s*nr\.?|plate(?:\s*no\.?)?)[:\s#-]*(\bE[A-Z]\d{4}\b|\b[A-Z]{2,3}[\s-]?\d{3}\b|\b\d{3}[\s-]?[A-Z]{2,3}\b)/gi;
  for (const labeledMatch of text.matchAll(labeledRegex)) {
    const rawPlate = labeledMatch[1].toUpperCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    const stdMatch = rawPlate.match(/^([A-Z]{3})\s*(\d{3})$/);
    addUniqueCandidate(candidates, stdMatch ? `${stdMatch[1]} ${stdMatch[2]}` : rawPlate);
  }

  // 2. Scan lines for standard Lithuanian plates (ABC 123 / ABC123 / EA1234)
  const plateCandidates = text.matchAll(/\b(E[A-Z]\d{4})\b|\b([A-Z]{3})[\s-]?(\d{3})\b/g);
  for (const match of plateCandidates) {
    if (match[1]) {
      addUniqueCandidate(candidates, match[1].toUpperCase());
      continue;
    }
    const letters = match[2].toUpperCase();
    const digits = match[3];
    if (FALSE_POSITIVE_PLATES.has(letters)) continue;
    addUniqueCandidate(candidates, `${letters} ${digits}`);
  }

  return candidates;
}

/**
 * Extracts Lithuanian license plate (e.g. "ABC 123", "EA1234").
 */
export function extractLicensePlate(text: string): string {
  return extractLicensePlateCandidates(text)[0] || '';
}

/**
 * Extracts all Vehicle Make & Model candidates (e.g. "TOYOTA COROLLA", "VOLKSWAGEN PASSAT").
 */
export function extractCarModelCandidates(text: string): string[] {
  if (!text) return [];
  const candidates: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. Look for known car makes across all lines
  for (const line of lines) {
    for (const { modelLineRegex } of CAR_MAKE_PATTERNS) {
      const match = line.match(modelLineRegex);
      if (match) {
        const detectedMake = match[1].toUpperCase() === 'VW' ? 'VOLKSWAGEN' : match[1].toUpperCase();
        let rawModel = (match[2] || '').trim();
        // Clean out plate numbers, VINs, or label words from model tail
        rawModel = rawModel
          .replace(/\b(?:valst|nr|vin|metai|kėbulo|kebulo|galioja)\b.*$/i, '')
          .replace(/\b[A-HJ-NPR-Z0-9]{17}\b/gi, '')
          .replace(/\b[A-Z]{3}\s*\d{3}\b/g, '')
          .replace(/[,:;]+$/, '')
          .trim();

        const formatted = rawModel ? `${detectedMake} ${rawModel.toUpperCase()}` : detectedMake;
        // Avoid adding bare 'MERCEDES' if 'MERCEDES-BENZ ...' was already added from the same line
        if (
          formatted === 'MERCEDES' &&
          candidates.some((c) => c.startsWith('MERCEDES-BENZ') || c.startsWith('MERCEDES BENZ'))
        ) {
          continue;
        }
        addUniqueCandidate(candidates, formatted);
      }
    }
  }

  // 2. Fallback: check explicitly labeled "Markė, modelis:" or "Transporto priemonė:"
  for (const line of lines) {
    const labeled = line.match(
      /(?:markė(?:\s*,?\s*modelis)?|modelis|transporto\s+priemonė|automobilis|vehicle)[:\s-]+([A-Za-z0-9ĄČĘĖĮŠŲŪŽąčęėįšųūž\s-]{2,35})/i
    );
    if (labeled) {
      const cleaned = labeled[1]
        .replace(/\b(?:valst|nr|vin)\b.*$/i, '')
        .trim()
        .toUpperCase();
      if (cleaned.length >= 2) {
        addUniqueCandidate(candidates, cleaned);
      }
    }
  }

  return candidates;
}

/**
 * Extracts Vehicle Make & Model (e.g. "TOYOTA COROLLA", "VOLKSWAGEN PASSAT").
 */
export function extractCarModel(text: string): string {
  return extractCarModelCandidates(text)[0] || '';
}

function splitMultipleStreetAddressesInLine(cleanedLine: string): string[] {
  const streetWithNumberRegex =
    /(?:(?:^|\s)(?:g\.|gatvė|pr\.|prospektas|al\.|alėja|skg\.|pl\.|plentas)\s*\d+)/i;

  // 1. Check semicolon or slash delimiters first so city names after commas are preserved
  const primaryParts = cleanedLine
    .split(/;|\s+\/\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (primaryParts.length >= 2 && primaryParts.every((p) => streetWithNumberRegex.test(p))) {
    return primaryParts;
  }

  // 2. Fall back to comma splitting only when every comma-separated segment is a street address
  const commaParts = cleanedLine
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (commaParts.length >= 2 && commaParts.every((p) => streetWithNumberRegex.test(p))) {
    return commaParts;
  }

  return [cleanedLine];
}

/**
 * Extracts all Lithuanian address candidates from text.
 */
export function extractAddressCandidates(text: string): string[] {
  if (!text) return [];
  const candidates: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. Explicitly labeled addresses
  for (const line of lines) {
    const labeled = line.match(
      /(?:adresas|gyv\.?\s*vieta|deklaruota\s+gyv\.?\s*vieta|address)[:\s-]+(.+)$/i
    );
    if (labeled && labeled[1].trim().length >= 4) {
      const normalizedLine = labeled[1].trim().replace(/\s+/g, ' ');
      for (const addr of splitMultipleStreetAddressesInLine(normalizedLine)) {
        addUniqueCandidate(candidates, addr);
      }
    }
  }

  // 2. Street / settlement / postal code heuristics across all lines
  const addressIndicator =
    /(?:(?:^|\s|,)(?:g\.|gatvė|pr\.|prospektas|al\.|alėja|skg\.|pl\.|plentas|a\.|aikštė|k\.|kaimas|mstl\.|raj\.|sav\.)(?=\s|,|$)|\bLT-\d{5}\b)/i;

  for (const line of lines) {
    if (addressIndicator.test(line)) {
      // Avoid company footer lines if possible
      if (/\b(?:UAB|AB\s+draudimas|SEB|Swedbank|Luminor)\b/i.test(line) && !/adresas/i.test(line)) {
        continue;
      }
      const cleaned = line
        .replace(/^(?:adresas|gyv\.?\s*vieta|deklaruota\s+gyv\.?\s*vieta|address)[:\s-]*/i, '')
        .trim()
        .replace(/\s+/g, ' ');
      for (const addr of splitMultipleStreetAddressesInLine(cleaned)) {
        addUniqueCandidate(candidates, addr);
      }
    }
  }

  return candidates;
}

/**
 * Extracts Lithuanian address line.
 */
export function extractAddress(text: string): string {
  return extractAddressCandidates(text)[0] || '';
}

const FALSE_POSITIVE_NAME_PHRASES = [
  'arba įmonės pavadinimas',
  'arba imones pavadinimas',
  'įmonės pavadinimas',
  'imones pavadinimas',
  'firmos pavadinimas',
  'company name',
  'gimimo data',
  'date of birth',
  'birth date',
  'asmens kodas',
  'personal code',
  'id kodas',
  'būsto draudimas',
  'busto draudimas',
  'butas apsauga',
  'civilinė atsakomybė',
  'civiline atsakomybe',
  'transporto priemonė',
  'transporto priemone',
  'draudimo polisas',
  'draudimo liudijimas',
  'draudimo rūšis',
  'draudimo rusis',
  'draudimo suma',
  'draudimo įmoka',
  'draudimo imoka',
  'mokėtina suma',
  'moketina suma',
  'bendra suma',
  'sumoka visą',
  'sumoka visa',
  'galiojimo data',
  'galioja nuo',
  'galioja iki',
  'apmokėjimo terminas',
  'apmokejimo terminas',
  'swedbank',
  'seb bankas',
  'seb lizingas',
  'šiaulių bankas',
  'siauliu bankas',
  'luminor',
  'citadele',
  'medicinos bankas',
  'lietuvos draudimas',
  'bta draudimas',
  'ergo insurance',
  'if draudimas',
  'balcia insurance',
  'gjensidige',
  'compensa',
  'vairuotojo pažymėjimas',
  'vairuotojo pazymejimas',
  'driving licence',
  'driving license',
  'registracijos liudijimas',
  'lietuvos respublika',
  'republic of lithuania',
];

const EXCLUDED_NAME_WORDS = new Set([
  'LIETUVOS',
  'RESPUBLIKA',
  'VILNIUS',
  'KAUNAS',
  'KLAIPĖDA',
  'KLAIPEDA',
  'ŠIAULIAI',
  'SIAULIAI',
  'PANEVĖŽYS',
  'PANEVEZYS',
  'ALYTUS',
  'VARDAS',
  'PAVARDĖ',
  'PAVARDE',
  'ADRESAS',
  'TELEFONAS',
  'GALIOJIMAS',
  'GALIOJA',
  'ASMENS',
  'KODAS',
  'TRANSPORTO',
  'PRIEMONĖ',
  'PRIEMONE',
  'VALSTYBINIS',
  'NUMERIS',
  'DRAUDĖJAS',
  'DRAUDEJAS',
  'APDRAUSTASIS',
  'SAVININKAS',
  'VALDYTOJAS',
  'VAIRUOTOJAS',
  'NAUDOTOJAS',
  'KLIENTAS',
  'MOKĖTOJAS',
  'MOKETOJAS',
  'PIRKĖJAS',
  'PIRKEJAS',
  'POLISAS',
  'LIUDIJIMAS',
  'DRAUDIMAS',
  'BANKAS',
  'SUMA',
  'ĮMOKA',
  'IMOKA',
  'DATA',
  'GIMIMO',
  'VIETA',
  'BUTAS',
  'APSAUGA',
  'BŪSTAS',
  'BUSTAS',
  'BŪSTO',
  'BUSTO',
  'CIVILINĖ',
  'CIVILINE',
  'ATSAKOMYBĖ',
  'ATSAKOMYBE',
  'SUMOKA',
  'VISĄ',
  'VISA',
  'MOKĖTINA',
  'MOKETINA',
  'SWEDBANK',
  'SEB',
  'LUMINOR',
  'CITADELE',
  'BTA',
  'ERGO',
  'BALCIA',
  'IF',
  'COMPENSA',
  'REGITRA',
  'SURNAME',
  'NAME',
  'GIVEN',
  'FIRST',
  'LAST',
  'COMPANY',
  'INSURER',
  'POLICYHOLDER',
  'INSURED',
  'OWNER',
  'KEEPER',
  'HOLDER',
  'DRIVER',
  'UAB',
  'AB',
  'MB',
  'VŠĮ',
  'VSI',
  'IĮ',
  'II',
  'ARBA',
  'ĮMONĖS',
  'IMONES',
  'PAVADINIMAS',
  'REKVIZITAI',
  'MARKĖ',
  'MARKE',
  'MODELIS',
  'AUTOMOBILIS',
  'AI',
  'AK',
  'ID',
]);

/**
 * Normalizes a Lithuanian name (including ALL-CAPS and hyphenated names)
 * into proper Lithuanian Title Case (e.g. "VAIDA MULERSKAITĖ-VACZYNSKA" -> "Vaida Mulerskaitė-Vaczynska").
 */
export function toLithuanianTitleCase(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .replace(/\s*-\s*/g, '-')
    .split(/\s+/)
    .map((word) =>
      word
        .split('-')
        .map((part) => {
          if (!part) return '';
          const first = part.charAt(0).toUpperCase();
          const rest = part.slice(1).toLowerCase();
          return first + rest;
        })
        .join('-')
    )
    .join(' ');
}

function isValidNameWord(word: string): boolean {
  if (!word || word.length < 2) return false;
  if (!/^[A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]+(?:-[A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]+)*$/.test(word)) return false;
  const parts = word.split('-');
  for (const p of parts) {
    if (!p || p.length < 2) return false;
    if (EXCLUDED_NAME_WORDS.has(p.toUpperCase())) return false;
  }
  return true;
}

export function isValidCandidateName(name: string): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length < 4) return false;
  const lower = trimmed.toLowerCase();
  for (const phrase of FALSE_POSITIVE_NAME_PHRASES) {
    if (lower.includes(phrase)) return false;
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  return words.every(isValidNameWord);
}

function extractNameFromSegment(raw: string): string | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  for (const phrase of FALSE_POSITIVE_NAME_PHRASES) {
    const reg = new RegExp(phrase, 'gi');
    cleaned = cleaned.replace(reg, ' ');
  }
  cleaned = cleaned.replace(/\b\d{4}[-./]\d{2}[-./]\d{2}\b/g, ' ');
  cleaned = cleaned.replace(/\b\d{11}\b/g, ' ');
  cleaned = cleaned.replace(/\b[1-6]\d{10}\b/g, ' ');
  cleaned = cleaned.replace(/[^\w\sĄČĘĖĮŠŲŪŽąčęėįšųūž-]/g, ' ');
  cleaned = cleaned.replace(/\s*-\s*/g, '-');
  const words = cleaned.split(/\s+/).filter(Boolean);

  for (let len = Math.min(3, words.length); len >= 2; len--) {
    for (let start = 0; start + len <= words.length; start++) {
      const slice = words.slice(start, start + len);
      if (slice.every(isValidNameWord)) {
        const candidate = slice.join(' ');
        if (isValidCandidateName(candidate)) {
          return candidate;
        }
      }
    }
  }
  return null;
}

function extractSingleNameWord(raw: string): string | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  for (const phrase of FALSE_POSITIVE_NAME_PHRASES) {
    const reg = new RegExp(phrase, 'gi');
    cleaned = cleaned.replace(reg, ' ');
  }
  cleaned = cleaned.replace(/[^\w\sĄČĘĖĮŠŲŪŽąčęėįšųūž-]/g, ' ');
  cleaned = cleaned.replace(/\s*-\s*/g, '-');
  const words = cleaned.split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (isValidNameWord(w)) {
      return w;
    }
  }
  return null;
}

/**
 * Extracts all Full Name (Vardas Pavardė) candidates.
 */
export function extractFullNameCandidates(text: string): string[] {
  if (!text) return [];
  const candidates: string[] = [];
  const rawLines = text.split(/\r?\n/).map((l) => l.trim());
  const lines = rawLines.filter(Boolean);

  interface RankedCandidate {
    index: number;
    name: string;
  }
  const rankedLabeled: RankedCandidate[] = [];

  const addRanked = (idx: number, name: string) => {
    if (isValidCandidateName(name)) {
      rankedLabeled.push({ index: idx, name: toLithuanianTitleCase(name) });
    }
  };

  // 1. Separate "Vardas" & "Pavardė" in single row:
  const singleRowPatterns = [
    /(?:(?:2\.\s*)?vardas|\bgiven\s*names?)\s*[:\s-]+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+).*?(?:(?:1\.\s*)?pavardė|\bsurname)\s*[:\s-]+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+)/i,
    /(?:(?:1\.\s*)?pavardė|\bsurname)\s*[:\s-]+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+).*?(?:(?:2\.\s*)?vardas|\bgiven\s*names?)\s*[:\s-]+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+)/i,
    /C\.1\.1\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+).*?C\.1\.2\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+)/i,
    /C\.1\.2\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+).*?C\.1\.1\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+)/i,
    /C\.2\.1\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+).*?C\.2\.2\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+)/i,
    /C\.2\.2\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+).*?C\.2\.1\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+)/i,
  ];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line) continue;
    const m1 = line.match(singleRowPatterns[0]);
    if (m1 && isValidNameWord(m1[1]) && isValidNameWord(m1[2])) {
      addRanked(i, `${m1[1]} ${m1[2]}`);
    }
    const m2 = line.match(singleRowPatterns[1]);
    if (m2 && isValidNameWord(m2[1]) && isValidNameWord(m2[2])) {
      addRanked(i, `${m2[2]} ${m2[1]}`);
    }
    const m3 = line.match(singleRowPatterns[2]);
    if (m3 && isValidNameWord(m3[1]) && isValidNameWord(m3[2])) {
      addRanked(i, `${m3[2]} ${m3[1]}`);
    }
    const m4 = line.match(singleRowPatterns[3]);
    if (m4 && isValidNameWord(m4[1]) && isValidNameWord(m4[2])) {
      addRanked(i, `${m4[1]} ${m4[2]}`);
    }
    const m5 = line.match(singleRowPatterns[4]);
    if (m5 && isValidNameWord(m5[1]) && isValidNameWord(m5[2])) {
      addRanked(i, `${m5[2]} ${m5[1]}`);
    }
    const m6 = line.match(singleRowPatterns[5]);
    if (m6 && isValidNameWord(m6[1]) && isValidNameWord(m6[2])) {
      addRanked(i, `${m6[1]} ${m6[2]}`);
    }
  }

  // 2. Multi-line Regitra (C.1 and C.2)
  for (const prefix of ['C\\.1', 'C\\.2']) {
    let surname: string | null = null;
    let firstName: string | null = null;
    let surnameLine = -1;
    let firstNameLine = -1;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (new RegExp(`\\b${prefix}\\.1\\b`, 'i').test(line)) {
        const rest = line.replace(new RegExp(`.*?\\b${prefix}\\.1\\b[:\\s-]*`, 'i'), '');
        const w = extractSingleNameWord(rest);
        if (w) {
          surname = w;
          surnameLine = i;
        } else if (i + 1 < rawLines.length) {
          const nextW = extractSingleNameWord(rawLines[i + 1]);
          if (nextW) {
            surname = nextW;
            surnameLine = i;
          }
        }
      }
      if (new RegExp(`\\b${prefix}\\.2\\b`, 'i').test(line)) {
        const rest = line.replace(new RegExp(`.*?\\b${prefix}\\.2\\b[:\\s-]*`, 'i'), '');
        const w = extractSingleNameWord(rest);
        if (w) {
          firstName = w;
          firstNameLine = i;
        } else if (i + 1 < rawLines.length) {
          const nextW = extractSingleNameWord(rawLines[i + 1]);
          if (nextW) {
            firstName = nextW;
            firstNameLine = i;
          }
        }
      }
    }
    if (firstName && surname) {
      addRanked(Math.min(firstNameLine, surnameLine), `${firstName} ${surname}`);
    }
  }

  // 3. Multi-line separate Vardas and Pavardė (1. Pavardė, 2. Vardas, or Driving License 1. X, 2. Y)
  let separateFirstName: string | null = null;
  let separateLastName: string | null = null;
  let firstLine = -1;
  let lastLine = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line) continue;
    // Skip if line has both or combined vardas, pavardė
    if (/vardas/i.test(line) && /pavard[eė]/i.test(line)) continue;

    // First name detection
    if (
      !separateFirstName &&
      /(?:^|[\s,;/])(?:2\.\s*vardas|2\.\s+given|vardas(?![A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž])|given\s*name\b|first\s*name\b)/i.test(line)
    ) {
      const rest = line.replace(
        /.*?(?:2\.\s*vardas|2\.\s+given|vardas(?![A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž])|given\s*name\b|first\s*name\b)[:\s-]*/i,
        ''
      );
      const w = extractSingleNameWord(rest);
      if (w) {
        separateFirstName = w;
        firstLine = i;
      } else if (i + 1 < rawLines.length) {
        const nextW = extractSingleNameWord(rawLines[i + 1]);
        if (nextW) {
          separateFirstName = nextW;
          firstLine = i;
        }
      }
    }

    // Surname detection
    if (
      !separateLastName &&
      /(?:^|[\s,;/])(?:1\.\s*pavard[eė]|1\.\s+surname|pavard[eė](?![A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž])|surname\b|last\s*name\b)/i.test(line)
    ) {
      const rest = line.replace(
        /.*?(?:1\.\s*pavard[eė]|1\.\s+surname|pavard[eė](?![A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž])|surname\b|last\s*name\b)[:\s-]*/i,
        ''
      );
      const w = extractSingleNameWord(rest);
      if (w) {
        separateLastName = w;
        lastLine = i;
      } else if (i + 1 < rawLines.length) {
        const nextW = extractSingleNameWord(rawLines[i + 1]);
        if (nextW) {
          separateLastName = nextW;
          lastLine = i;
        }
      }
    }

    // Driving license 1. Jonaitis / 2. Jonas
    if (!separateLastName && /^1\.\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+)$/.test(line)) {
      const m = line.match(/^1\.\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+)$/);
      if (m && isValidNameWord(m[1])) {
        separateLastName = m[1];
        lastLine = i;
      }
    }
    if (!separateFirstName && /^2\.\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+)$/.test(line)) {
      const m = line.match(/^2\.\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž-]+)$/);
      if (m && isValidNameWord(m[1])) {
        separateFirstName = m[1];
        firstLine = i;
      }
    }
  }

  if (separateFirstName && separateLastName) {
    addRanked(Math.min(firstLine, lastLine), `${separateFirstName} ${separateLastName}`);
  }

  // 4. Full name labeled headers (combined or stacked layout)
  const fullLabelRegex =
    /(?:vardas\s*,?\s*pavard[eė]|klientas|savininkas|valdytojas|vairuotojas|naudotojas|draud[eė]jas|apdraustasis|mok[eė]tojas|pirk[eė]jas|full\s*name|policyholder|insurer|insured|driver)/i;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!line) continue;
    if (fullLabelRegex.test(line)) {
      let sameLineValue = '';
      if (line.includes(':')) {
        sameLineValue = line.slice(line.indexOf(':') + 1).trim();
      }
      const sameLineCandidate = extractNameFromSegment(sameLineValue);
      if (sameLineCandidate) {
        addRanked(i, sameLineCandidate);
      } else {
        // Multi-line / stacked layout: check the next non-empty line
        for (let j = i + 1; j < Math.min(rawLines.length, i + 4); j++) {
          const nextLine = rawLines[j];
          if (!nextLine) continue;
          if (/(?:asmens\s+kodas|kodas|adresas|tel|valst|galioj|mark[eė])/i.test(nextLine)) {
            break;
          }
          const nextLineCandidate = extractNameFromSegment(nextLine);
          if (nextLineCandidate) {
            addRanked(i, nextLineCandidate);
            break;
          }
        }
      }
    }
  }

  rankedLabeled.sort((a, b) => a.index - b.index);
  for (const item of rankedLabeled) {
    addUniqueCandidate(candidates, item.name);
  }

  // 5. Fallback Heuristic: Capitalized or ALL-CAPS words with Lithuanian name suffixes
  const lithuanianSuffixFirst = /(?:as|is|ys|us|a|ė|aitė|ytė|utė|ienė|uvienė)$/i;
  const lithuanianSuffixLast =
    /(?:as|is|ys|us|a|ė|aitė|ytė|utė|ienė|uvienė|onis|ėnas|ūnas|auskas|inskas|aitis|vicius|vičius|ska|skas|skytė|skaitė|ckas|ckytė|ckaitė)$/i;

  for (const line of lines) {
    if (/\b(?:UAB|AB|VŠĮ|VSI|MB|IĮ|LTD|SIA|OÜ|BANKAS|LIZINGAS)\b/i.test(line)) continue;
    if (/(?:(?:^|\s|,)(?:g\.|gatvė|pr\.|al\.)(?=\s|,|$)|\bLT-\d{5}\b)/i.test(line)) continue;
    if (/\b(?:VIN|kėbulo|kebulo|variklio|kategorija|masė|mase|sėdimų|sedimu|markė|marke|modelis|automobilis|transporto)\b/i.test(line)) continue;
    if (CAR_MAKE_PATTERNS.some(({ wordBoundaryRegex }) => wordBoundaryRegex.test(line))) continue;

    const nameMatchRegex =
      /\b([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]{2,18})\s+([A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]{2,22}(?:-[A-Za-zĄČĘĖĮŠŲŪŽąčęėįšųūž]{2,20})?)\b/g;

    for (const match of line.matchAll(nameMatchRegex)) {
      const first = match[1];
      const last = match[2];
      if (isValidNameWord(first) && isValidNameWord(last)) {
        if (lithuanianSuffixFirst.test(first) && lithuanianSuffixLast.test(last)) {
          const candidate = `${first} ${last}`;
          if (isValidCandidateName(candidate)) {
            addUniqueCandidate(candidates, toLithuanianTitleCase(candidate));
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * Extracts Full Name (Vardas Pavardė).
 */
export function extractFullName(text: string): string {
  return extractFullNameCandidates(text)[0] || '';
}

/**
 * Collects all distinct candidate values found in the text for each of the 7 fields,
 * deduplicated and ordered by priority.
 */
export function parseDocumentCandidates(rawText: string): ParsedDocumentCandidates {
  const personalCode = extractPersonalCodeCandidates(rawText);
  const phone = extractPhoneCandidates(rawText, personalCode);
  const validPeriod = extractValidPeriodCandidates(rawText);
  const licensePlate = extractLicensePlateCandidates(rawText);
  const carModel = extractCarModelCandidates(rawText);
  const address = extractAddressCandidates(rawText);
  const fullName = extractFullNameCandidates(rawText);

  return {
    fullName,
    address,
    phone,
    licensePlate,
    carModel,
    validPeriod,
    personalCode,
  };
}

/**
 * Master parser that extracts all 7 structured fields from raw OCR or pasted text.
 * Returns the primary (1st) candidate for each field.
 */
export function parseDocumentText(rawText: string): ParsedDocumentFields {
  const candidates = parseDocumentCandidates(rawText);

  return {
    fullName: candidates.fullName[0] || '',
    address: candidates.address[0] || '',
    phone: candidates.phone[0] || '',
    licensePlate: candidates.licensePlate[0] || '',
    carModel: candidates.carModel[0] || '',
    validPeriod: candidates.validPeriod[0] || '',
    personalCode: candidates.personalCode[0] || '',
  };
}

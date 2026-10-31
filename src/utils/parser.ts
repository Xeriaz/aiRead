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
 * Validates an 11-digit Lithuanian personal code (Asmens kodas),
 * including the official modulo-11 checksum algorithm.
 */
export function isValidLithuanianPersonalCode(code: string): boolean {
  if (!code) return false;
  const trimmed = code.trim();
  if (!LITHUANIAN_PERSONAL_CODE_DATE_REGEX.test(trimmed)) {
    return false;
  }

  const digits = trimmed.split('').map(Number);
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

  return digits[10] === remainder;
}

/**
 * Calculates a 0-100 data read accuracy score across all 7 extracted/verified fields,
 * optionally blended with Tesseract OCR confidence (80% field validation + 20% OCR confidence).
 */
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

  // 3. phone (15 pts): 15 pts if matches /^0-\d{3}-\d{5}$/; 7 pts if 8–11 digits; 0 pts otherwise.
  const ph = (fields.phone || '').trim();
  if (/^0-\d{3}-\d{5}$/.test(ph)) {
    fieldScore += 15;
  } else {
    const phoneDigits = ph.replace(/\D/g, '');
    if (phoneDigits.length >= 8 && phoneDigits.length <= 11) {
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
    const hasKnownMake = CAR_MAKES.some((make) => {
      const escapedMake = make.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${escapedMake}\\b`, 'i').test(model);
    });
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
 * Formats any Lithuanian phone number representation into "0-6XX-XXXXX" (e.g. "0-612-34567").
 */
export function formatPhoneNumber(raw: string): string {
  if (!raw || !raw.trim()) return '';
  const trimmed = raw.trim();

  // If already in 0-XXX-XXXXX format
  if (/^0-\d{3}-\d{5}$/.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;

  let normalizedNine = '';

  if (digits.startsWith('00370') && digits.length >= 13) {
    normalizedNine = '0' + digits.slice(5, 13);
  } else if (digits.startsWith('370') && digits.length >= 11) {
    normalizedNine = '0' + digits.slice(3, 11);
  } else if (digits.startsWith('8') && digits.length === 9) {
    normalizedNine = '0' + digits.slice(1);
  } else if (digits.startsWith('0') && digits.length === 9) {
    normalizedNine = digits;
  } else if (digits.startsWith('6') && digits.length === 8) {
    normalizedNine = '0' + digits;
  }

  if (normalizedNine.length === 9) {
    return `${normalizedNine.slice(0, 1)}-${normalizedNine.slice(1, 4)}-${normalizedNine.slice(4, 9)}`;
  }

  return trimmed;
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
    if (year >= 1990 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
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
    if (year >= 1990 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
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
 * Normalizes a date range string into "YYYY-MM-DD YYYY-MM-DD" (e.g., "2026-09-04 2027-09-04").
 */
export function formatValidPeriod(raw: string, autoAddOneYearIfSingle = false): string {
  if (!raw || !raw.trim()) return '';
  const dateTokenRegex = /\b(?:\d{4}[-./]\d{2}[-./]\d{2}|\d{2}[-./]\d{2}[-./]\d{4})\b/g;
  const matches = raw.match(dateTokenRegex) || [];
  const normalized = matches
    .map(normalizeSingleDate)
    .filter((d): d is string => Boolean(d));

  if (normalized.length >= 2) {
    const [first, second] = normalized;
    return first <= second ? `${first} ${second}` : `${second} ${first}`;
  }

  if (normalized.length === 1) {
    const start = normalized[0];
    if (autoAddOneYearIfSingle) {
      return `${start} ${addOneYearToDate(start)}`;
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
 */
export function extractPersonalCodeCandidates(text: string): string[] {
  if (!text) return [];
  const candidates: string[] = [];

  // 1. Check explicitly labeled personal codes first
  const labeledRegex =
    /(?:a\s*\.\s*k\s*\.?|asmens\s+kodas|personal\s+code|id\s+kodas)[:\s#-]*([1-6]\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{4})\b/gi;
  for (const match of text.matchAll(labeledRegex)) {
    addUniqueCandidate(candidates, match[1]);
  }

  // 2. Scan all 11-digit valid Lithuanian personal code patterns
  const globalRegex = /\b([1-6]\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{4})\b/g;
  for (const match of text.matchAll(globalRegex)) {
    const candidate = match[1];
    const index = match.index ?? 0;
    const prefix = text.slice(Math.max(0, index - 4), index);
    // Ignore if preceded by '+' (e.g. +37061234567) or if it starts with 3706 and looks like a phone
    if (prefix.includes('+')) continue;
    if (candidate.startsWith('3706')) {
      const lineStart = text.lastIndexOf('\n', index) + 1;
      const lineEnd = text.indexOf('\n', index);
      const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).toLowerCase();
      if (line.includes('tel') || line.includes('mob') || line.includes('phone')) {
        continue;
      }
    }
    addUniqueCandidate(candidates, candidate);
  }

  return candidates;
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

  // 1. Look near phone labels first
  const labeledLineRegex =
    /(?:tel(?:\.|efonas)?|mob(?:\.|ilus)?|phone)[:\s]*((?:\+370|00370|370|8|0)[\s()-]*(?:\d[\s()-]*){7,8})/gi;
  for (const labeledMatch of text.matchAll(labeledLineRegex)) {
    const formatted = formatPhoneNumber(labeledMatch[1]);
    if (/^0-\d{3}-\d{5}$/.test(formatted)) {
      addUniqueCandidate(candidates, formatted);
    }
  }

  // 2. General Lithuanian mobile/phone pattern across text
  const phoneRegex =
    /(?:\+370|00370|(?:\b370)|(?:\b8)|(?:\b0))[\s.-]*\(?6\d{2}\)?[\s.-]*\d{2}[\s.-]*\d{3}\b|(?:\b0-\d{3}-\d{5}\b)/g;

  for (const match of text.matchAll(phoneRegex)) {
    const rawCandidate = match[0];
    const digitsOnly = rawCandidate.replace(/\D/g, '');
    if (excludedSet.has(digitsOnly)) {
      continue;
    }
    const formatted = formatPhoneNumber(rawCandidate);
    if (/^0-\d{3}-\d{5}$/.test(formatted)) {
      addUniqueCandidate(candidates, formatted);
    }
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

  // 1. Prioritize lines with validity keywords
  const validityKeywords = /(?:galioj|laikotarp|nuo\b|iki\b|valid|period|term)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (validityKeywords.test(line)) {
      const combinedWindow = [line, lines[i + 1] || ''].join(' ');
      const dateTokens =
        combinedWindow.match(/\b(?:\d{4}[-./]\d{2}[-./]\d{2}|\d{2}[-./]\d{2}[-./]\d{4})\b/g) || [];
      const windowDates: string[] = [];
      for (const token of dateTokens) {
        const iso = normalizeSingleDate(token);
        if (iso && !windowDates.includes(iso)) {
          windowDates.push(iso);
        }
      }
      if (windowDates.length >= 2) {
        const [d1, d2] = windowDates;
        addUniqueCandidate(candidates, d1 <= d2 ? `${d1} ${d2}` : `${d2} ${d1}`);
      } else if (windowDates.length === 1) {
        const d1 = windowDates[0];
        addUniqueCandidate(candidates, `${d1} ${addOneYearToDate(d1)}`);
      }
    }
  }

  // 2. Scan all dates in text
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
    for (let i = 0; i + 1 < allIso.length; i++) {
      const d1 = allIso[i];
      const d2 = allIso[i + 1];
      addUniqueCandidate(candidates, d1 <= d2 ? `${d1} ${d2}` : `${d2} ${d1}`);
    }
  } else if (allIso.length === 1) {
    const start = allIso[0];
    addUniqueCandidate(candidates, `${start} ${addOneYearToDate(start)}`);
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

  // 1. Check explicitly labeled plates first
  const labeledRegex =
    /(?:valst\.?\s*nr\.?|valstybinis\s*nr\.?|reg\.?\s*nr\.?|plate(?:\s*no\.?)?)[:\s#-]*([A-Z]{2,3}[\s-]?\d{3}|\bE[A-Z]\d{4}\b|\b\d{3}[\s-]?[A-Z]{2,3}\b)/gi;
  for (const labeledMatch of text.matchAll(labeledRegex)) {
    const rawPlate = labeledMatch[1].toUpperCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    const stdMatch = rawPlate.match(/^([A-Z]{3})\s*(\d{3})$/);
    addUniqueCandidate(candidates, stdMatch ? `${stdMatch[1]} ${stdMatch[2]}` : rawPlate);
  }

  // 2. Scan lines for standard Lithuanian plates (ABC 123 / ABC123 / EA1234)
  const plateCandidates = text.matchAll(/\b([A-Z]{3})[\s-]?(\d{3})\b|\b(E[A-Z]\d{4})\b/g);
  for (const match of plateCandidates) {
    if (match[3]) {
      addUniqueCandidate(candidates, match[3].toUpperCase());
      continue;
    }
    const letters = match[1].toUpperCase();
    const digits = match[2];
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
    for (const make of CAR_MAKES) {
      const escapedMake = make.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(
        `\\b(${escapedMake})\\b(?:[\\s,/-]+([A-Z0-9ĄČĘĖĮŠŲŪŽ][A-Za-z0-9ĄČĘĖĮŠŲŪŽąčęėįšųūž.-]{0,15}(?:\\s+[A-Z0-9][A-Za-z0-9.-]{0,12})?))?`,
        'i'
      );
      const match = line.match(regex);
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
  const parts = cleanedLine
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2 && parts.every((p) => streetWithNumberRegex.test(p))) {
    return parts;
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

/**
 * Extracts all Full Name (Vardas Pavardė) candidates.
 */
export function extractFullNameCandidates(text: string): string[] {
  if (!text) return [];
  const candidates: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. Check labeled name fields first
  const nameLabelRegex =
    /(?:vardas\s*,?\s*pavardė|klientas|savininkas|valdytojas|draudėjas|mokėtojas|pirkėjas|full\s*name|name)[:\s-]+([A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+(?:\s+[A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž-]+){1,2})/i;

  for (const line of lines) {
    const match = line.match(nameLabelRegex);
    if (match) {
      addUniqueCandidate(candidates, match[1].replace(/\s+/g, ' ').trim());
    }
  }

  // 2. Heuristic: Two capitalized words with Lithuanian personal name endings
  const excludedWords = new Set([
    'Lietuvos',
    'Respublika',
    'Vilnius',
    'Kaunas',
    'Klaipėda',
    'Šiauliai',
    'Panevėžys',
    'Alytus',
    'Vardas',
    'Pavardė',
    'Adresas',
    'Telefonas',
    'Galiojimas',
    'Asmens',
    'Kodas',
    'Transporto',
    'Priemonė',
    'Valstybinis',
    'Numeris',
  ]);

  const lithuanianNameRegex =
    /\b([A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]{2,18})\s+([A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]{2,22}(?:-(?:[A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]{2,20}))?)\b/g;

  for (const line of lines) {
    // Skip lines that look like addresses or vehicle models
    if (/(?:(?:^|\s|,)(?:g\.|gatvė|pr\.|al\.)(?=\s|,|$)|\bLT-\d{5}\b)/i.test(line)) continue;
    for (const match of line.matchAll(lithuanianNameRegex)) {
      const first = match[1];
      const last = match[2];
      if (excludedWords.has(first) || excludedWords.has(last)) continue;
      if (
        /(?:as|is|ys|us|a|ė|aitė|ytė|utė|ienė|uvienė)$/i.test(first) &&
        /(?:as|is|ys|us|a|ė|aitė|ytė|utė|ienė|uvienė|onis|ėnas|ūnas|auskas|inskas|aitis|vicius|vičius)$/i.test(
          last
        )
      ) {
        addUniqueCandidate(candidates, `${first} ${last}`);
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

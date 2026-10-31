export interface ParsedDocumentFields {
  fullName: string;
  address: string;
  phone: string;
  licensePlate: string;
  carModel: string;
  validPeriod: string;
  personalCode: string;
}

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
 * Extracts 11-digit Lithuanian personal code while ignoring +3706... phone numbers.
 */
export function extractPersonalCode(text: string): string {
  if (!text) return '';

  // 1. Check explicitly labeled personal code first
  const labeledRegex =
    /(?:a\s*\.\s*k\s*\.?|asmens\s+kodas|personal\s+code|id\s+kodas)[:\s#-]*([1-6]\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{4})\b/i;
  const labeledMatch = text.match(labeledRegex);
  if (labeledMatch) {
    return labeledMatch[1];
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
    return candidate;
  }

  return '';
}

/**
 * Extracts and normalizes Lithuanian phone number into "0-6XX-XXXXX".
 */
export function extractPhone(text: string, excludePersonalCode = ''): string {
  if (!text) return '';

  // 1. Look near phone labels first
  const labeledLineRegex =
    /(?:tel(?:\.|efonas)?|mob(?:\.|ilus)?|phone)[:\s]*((?:\+370|00370|370|8|0)[\s()-]*(?:\d[\s()-]*){7,8})/i;
  const labeledMatch = text.match(labeledLineRegex);
  if (labeledMatch) {
    const formatted = formatPhoneNumber(labeledMatch[1]);
    if (/^0-\d{3}-\d{5}$/.test(formatted)) {
      return formatted;
    }
  }

  // 2. General Lithuanian mobile/phone pattern across text
  const phoneRegex =
    /(?:\+370|00370|(?:\b370)|(?:\b8)|(?:\b0))[\s.-]*\(?6\d{2}\)?[\s.-]*\d{2}[\s.-]*\d{3}\b|(?:\b0-\d{3}-\d{5}\b)/g;

  for (const match of text.matchAll(phoneRegex)) {
    const rawCandidate = match[0];
    const digitsOnly = rawCandidate.replace(/\D/g, '');
    if (excludePersonalCode && digitsOnly === excludePersonalCode) {
      continue;
    }
    const formatted = formatPhoneNumber(rawCandidate);
    if (/^0-\d{3}-\d{5}$/.test(formatted)) {
      return formatted;
    }
  }

  return '';
}

/**
 * Extracts validity period ("YYYY-MM-DD YYYY-MM-DD").
 */
export function extractValidPeriod(text: string): string {
  if (!text) return '';

  const lines = text.split(/\r?\n/);

  // 1. Prioritize lines with validity keywords
  const validityKeywords = /(?:galioj|laikotarp|nuo\b|iki\b|valid|period|term)/i;
  const keywordDates: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (validityKeywords.test(line)) {
      const combinedWindow = [line, lines[i + 1] || ''].join(' ');
      const dateTokens =
        combinedWindow.match(/\b(?:\d{4}[-./]\d{2}[-./]\d{2}|\d{2}[-./]\d{2}[-./]\d{4})\b/g) || [];
      for (const token of dateTokens) {
        const iso = normalizeSingleDate(token);
        if (iso && !keywordDates.includes(iso)) {
          keywordDates.push(iso);
        }
      }
      if (keywordDates.length >= 2) {
        const [d1, d2] = keywordDates;
        return d1 <= d2 ? `${d1} ${d2}` : `${d2} ${d1}`;
      }
    }
  }

  // 2. Fallback: scan all dates in text
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
    const [d1, d2] = allIso.slice(0, 2);
    return d1 <= d2 ? `${d1} ${d2}` : `${d2} ${d1}`;
  }

  if (allIso.length === 1) {
    const start = allIso[0];
    return `${start} ${addOneYearToDate(start)}`;
  }

  return '';
}

/**
 * Extracts Lithuanian license plate (e.g. "ABC 123", "EA1234").
 */
export function extractLicensePlate(text: string): string {
  if (!text) return '';

  // 1. Check explicitly labeled plate first
  const labeledRegex =
    /(?:valst\.?\s*nr\.?|valstybinis\s*nr\.?|reg\.?\s*nr\.?|plate(?:\s*no\.?)?)[:\s#-]*([A-Z]{2,3}[\s-]?\d{3}|\bE[A-Z]\d{4}\b|\b\d{3}[\s-]?[A-Z]{2,3}\b)/i;
  const labeledMatch = text.match(labeledRegex);
  if (labeledMatch) {
    const rawPlate = labeledMatch[1].toUpperCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    const stdMatch = rawPlate.match(/^([A-Z]{3})\s*(\d{3})$/);
    if (stdMatch) return `${stdMatch[1]} ${stdMatch[2]}`;
    return rawPlate;
  }

  // 2. Scan lines for standard Lithuanian plates (ABC 123 / ABC123 / EA1234)
  const plateCandidates = text.matchAll(/\b([A-Z]{3})[\s-]?(\d{3})\b|\b(E[A-Z]\d{4})\b/g);
  for (const match of plateCandidates) {
    if (match[3]) {
      return match[3].toUpperCase();
    }
    const letters = match[1].toUpperCase();
    const digits = match[2];
    if (FALSE_POSITIVE_PLATES.has(letters)) continue;
    return `${letters} ${digits}`;
  }

  return '';
}

/**
 * Extracts Vehicle Make & Model (e.g. "TOYOTA COROLLA", "VOLKSWAGEN PASSAT").
 */
export function extractCarModel(text: string): string {
  if (!text) return '';

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

        return rawModel ? `${detectedMake} ${rawModel.toUpperCase()}` : detectedMake;
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
      if (cleaned.length >= 2) return cleaned;
    }
  }

  return '';
}

/**
 * Extracts Lithuanian address line.
 */
export function extractAddress(text: string): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. Explicitly labeled address
  for (const line of lines) {
    const labeled = line.match(
      /(?:adresas|gyv\.?\s*vieta|deklaruota\s+gyv\.?\s*vieta|address)[:\s-]+(.+)$/i
    );
    if (labeled && labeled[1].trim().length >= 4) {
      return labeled[1].trim().replace(/\s+/g, ' ');
    }
  }

  // 2. Street / settlement / postal code heuristics
  const addressIndicator =
    /(?:\b(?:g\.|gatvė|pr\.|prospektas|al\.|alėja|skg\.|pl\.|plentas|a\.|aikštė|k\.|kaimas|mstl\.|raj\.|sav\.)\b|\bLT-\d{5}\b)/i;

  for (const line of lines) {
    if (addressIndicator.test(line)) {
      // Avoid company footer lines if possible
      if (/\b(?:UAB|AB\s+draudimas|SEB|Swedbank|Luminor)\b/i.test(line) && !/adresas/i.test(line)) {
        continue;
      }
      return line
        .replace(/^(?:adresas|gyv\.?\s*vieta)[:\s-]*/i, '')
        .trim()
        .replace(/\s+/g, ' ');
    }
  }

  return '';
}

/**
 * Extracts Full Name (Vardas Pavardė).
 */
export function extractFullName(text: string): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // 1. Check labeled name fields first
  const nameLabelRegex =
    /(?:vardas\s*,?\s*pavardė|klientas|savininkas|valdytojas|draudėjas|mokėtojas|pirkėjas|full\s*name|name)[:\s-]+([A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+(?:\s+[A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž-]+){1,2})/i;

  for (const line of lines) {
    const match = line.match(nameLabelRegex);
    if (match) {
      return match[1].replace(/\s+/g, ' ').trim();
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
    if (/\b(?:g\.|gatvė|pr\.|al\.|LT-\d{5})\b/i.test(line)) continue;
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
        return `${first} ${last}`;
      }
    }
  }

  return '';
}

/**
 * Master parser that extracts all 7 structured fields from raw OCR or pasted text.
 */
export function parseDocumentText(rawText: string): ParsedDocumentFields {
  const personalCode = extractPersonalCode(rawText);
  const phone = extractPhone(rawText, personalCode);
  const validPeriod = extractValidPeriod(rawText);
  const licensePlate = extractLicensePlate(rawText);
  const carModel = extractCarModel(rawText);
  const address = extractAddress(rawText);
  const fullName = extractFullName(rawText);

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

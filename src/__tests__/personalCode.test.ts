import { describe, expect, it } from 'vitest';
import {
  computeLithuanianPersonalCodeChecksum,
  extractPersonalCode,
  extractPersonalCodeCandidates,
  isValidLithuanianPersonalCode,
  normalizeOcrDigits,
  parseDocumentText,
  repairLithuanianPersonalCode,
} from '../utils/parser';

describe('Lithuanian Personal Code (Asmens kodas) Handwritten & Checksum Engine', () => {
  it('validates authentic Lithuanian personal codes across centuries (19th, 20th, 21st)', () => {
    // Male born 1985-04-12, checksum = 4
    expect(isValidLithuanianPersonalCode('38504121234')).toBe(true);

    // Female born 1967-11-18: 4 67 11 18 021 -> checksum calculation
    const prefixF67 = '4671118021';
    const cF67 = computeLithuanianPersonalCodeChecksum(prefixF67);
    expect(cF67).not.toBeNull();
    expect(isValidLithuanianPersonalCode(`${prefixF67}${cF67}`)).toBe(true);

    // Male born 1982-02-27
    const prefixM82 = '3820227123';
    const cM82 = computeLithuanianPersonalCodeChecksum(prefixM82);
    expect(isValidLithuanianPersonalCode(`${prefixM82}${cM82}`)).toBe(true);

    // 21st century boy born 2005-06-15 (starts with 5)
    const prefix21 = '5050615001';
    const c21 = computeLithuanianPersonalCodeChecksum(prefix21);
    expect(isValidLithuanianPersonalCode(`${prefix21}${c21}`)).toBe(true);
  });

  it('rejects invalid personal codes (bad century, impossible calendar dates, wrong checksum)', () => {
    // Bad century/gender (starts with 7 or 0)
    expect(isValidLithuanianPersonalCode('78504121234')).toBe(false);
    expect(isValidLithuanianPersonalCode('08504121234')).toBe(false);

    // Impossible calendar dates: Feb 30, April 31, Month 13
    expect(isValidLithuanianPersonalCode('38502301234')).toBe(false);
    expect(isValidLithuanianPersonalCode('38504311234')).toBe(false);
    expect(isValidLithuanianPersonalCode('38513011234')).toBe(false);

    // Leap year rejection: 1985 is not a leap year, so Feb 29 is invalid
    expect(isValidLithuanianPersonalCode('38502291234')).toBe(false);

    // Valid leap year: 2000 was a leap year
    const leapPrefix = '5000229001';
    const leapC = computeLithuanianPersonalCodeChecksum(leapPrefix);
    expect(isValidLithuanianPersonalCode(`${leapPrefix}${leapC}`)).toBe(true);

    // Corrupted checksum (38504121234 ends in 4, so ending in 5 must fail)
    expect(isValidLithuanianPersonalCode('38504121235')).toBe(false);
  });

  it('computes official Modulo-11 checksums including second weight fallback', () => {
    // Test known code
    expect(computeLithuanianPersonalCodeChecksum('3850412123')).toBe(4);

    // Incomplete length must return null
    expect(computeLithuanianPersonalCodeChecksum('385041212')).toBeNull();
    expect(computeLithuanianPersonalCodeChecksum('38504121234')).toBeNull();
    expect(computeLithuanianPersonalCodeChecksum('abcdefghij')).toBeNull();
  });

  it('repairs single-digit OCR handwriting corruption using Modulo-11 checksum', () => {
    // Suppose '38504121234' was read with OCR misreading '3' as '5': '58504121234'
    // Note: 58504121234 implies born in 2085 (future date), so it should repair back to 38504121234
    const repaired1 = repairLithuanianPersonalCode('58504121234');
    expect(repaired1).toBe('38504121234');

    // Suppose last digit (checksum) was misread as 5 instead of 4:
    const repaired2 = repairLithuanianPersonalCode('38504121235');
    expect(repaired2).toBe('38504121234');

    // Already valid code returns as-is
    expect(repairLithuanianPersonalCode('38504121234')).toBe('38504121234');
  });

  it('normalizes handwritten OCR letter-to-digit confusions', () => {
    // O -> 0, l/I/| -> 1, Z -> 2, S -> 5, B -> 8
    expect(normalizeOcrDigits('486O7O7Ol23')).toBe('48607070123');
    expect(normalizeOcrDigits('38S04l2l234')).toBe('38504121234');
    expect(normalizeOcrDigits('Z82O227')).toBe('2820227');
  });

  it('extracts handwritten space-separated and boxed personal codes', () => {
    // Space-separated handwritten personal code
    const textSpaced = 'Klientas: Jonas Jonaitis\nAsmens kodas: 3 8 5 0 4 1 2 1 2 3 4';
    const candidatesSpaced = extractPersonalCodeCandidates(textSpaced);
    expect(candidatesSpaced).toContain('38504121234');
    expect(extractPersonalCode(textSpaced)).toBe('38504121234');

    // Dot and dash separated
    const textDelim = 'A.K.: 385-04-12-1234';
    expect(extractPersonalCode(textDelim)).toBe('38504121234');

    // Multiline stacked label and handwritten number on line below
    const textStacked = `
      Vardas, Pavardė: Petras Petraitis
      Asmens kodas / ID
      38504121234
    `;
    expect(extractPersonalCode(textStacked)).toBe('38504121234');
  });

  it('completes 10-digit codes with calculated checksum if 11th digit was truncated', () => {
    // 10 digits without the 11th checksum digit (e.g. truncated image)
    const text10 = 'Asmens kodas: 3850412123';
    const candidates = extractPersonalCodeCandidates(text10);
    expect(candidates).toContain('38504121234');
  });

  it('prioritizes checksum-verified candidates over unverified ones', () => {
    // Feed text with both an invalid number and a valid checksum personal code
    const mixedText = `
      Dokumento numeris: 46711180000
      Asmens kodas: 3 8 5 0 4 1 2 1 2 3 4
    `;
    const candidates = extractPersonalCodeCandidates(mixedText);
    expect(candidates[0]).toBe('38504121234');
  });

  it('integrates seamlessly with master parseDocumentText', () => {
    const rawForm = `
      Draudėjas: Jonas Jonaitis
      Asmens kodas: 3 8 5 0 4 1 2 1 2 3 4
      Adresas: Gedimino pr. 10, Vilnius
      Tel. 861234567
    `;
    const parsed = parseDocumentText(rawForm);
    expect(parsed.personalCode).toBe('38504121234');
    expect(parsed.fullName).toBe('Jonas Jonaitis');
    expect(parsed.phone).toBe('861234567');
  });
});

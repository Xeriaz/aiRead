import { describe, expect, it } from 'vitest';
import { extractTextAndConfidenceFromFile } from '../utils/ocr';
import { extractTextAndConfidenceFromPdfFile } from '../utils/pdf';

describe('PDF text extraction and unscannable fallback', () => {
  it('returns empty text and 0 confidence for corrupted or unscannable PDF files', async () => {
    const corruptPdfFile = new File(['%PDF-1.4 corrupt content not valid pdf'], 'policy.pdf', {
      type: 'application/pdf',
    });

    const result = await extractTextAndConfidenceFromPdfFile(corruptPdfFile);
    expect(result.text).toBe('');
    expect(result.confidence).toBe(0);
  });

  it('routes .pdf files in extractTextAndConfidenceFromFile to the PDF extractor', async () => {
    const corruptPdfFile = new File(['%PDF-invalid'], 'policy.pdf', {
      type: 'application/pdf',
    });

    const result = await extractTextAndConfidenceFromFile(corruptPdfFile);
    expect(result.text).toBe('');
    expect(result.confidence).toBe(0);
  });
});

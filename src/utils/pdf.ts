import * as pdfjsLib from 'pdfjs-dist';
import {
  extractTextAndConfidenceFromImageFile,
  type OcrExtractionResult,
  type OcrProgressCallback,
} from './ocr';

// Configure pdfjs worker if in browser
if (typeof window !== 'undefined' && pdfjsLib?.GlobalWorkerOptions) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
}

/**
 * Extracts text and confidence from a PDF file.
 * 1. Attempts digital text extraction across pages (fast, 100% accurate, no OCR needed).
 * 2. If no digital text layer exists (scanned PDF), renders page(s) to canvas and runs Tesseract OCR.
 * 3. If file is corrupt or unreadable, returns empty text and 0 confidence (fields stay empty).
 */
export async function extractTextAndConfidenceFromPdfFile(
  file: File,
  onProgress?: OcrProgressCallback
): Promise<OcrExtractionResult> {
  try {
    onProgress?.(5);
    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(15);

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer),
      useSystemFonts: true,
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = Math.min(pdfDoc.numPages, 3);

    let fullText = '';
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();

      let pageText = '';
      let lastY: number | null = null;

      for (const item of textContent.items) {
        if ('str' in item) {
          const currentY = Array.isArray(item.transform) ? item.transform[5] : null;
          if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 5) {
            pageText += '\n';
          } else if (pageText.length > 0 && !pageText.endsWith('\n') && !pageText.endsWith(' ')) {
            pageText += ' ';
          }
          pageText += item.str;
          if (currentY !== null) {
            lastY = currentY;
          }
        }
      }

      if (pageText.trim()) {
        fullText += (fullText ? '\n\n' : '') + pageText.trim();
      }
    }

    // If digital text was extracted (at least 20 characters)
    if (fullText.trim().length >= 20) {
      onProgress?.(100);
      return {
        text: fullText.trim(),
        confidence: 100,
      };
    }

    // Otherwise, it's a scanned PDF (image only) -> Render page 1 to canvas and run OCR
    onProgress?.(25);
    const firstPage = await pdfDoc.getPage(1);
    const viewport = firstPage.getViewport({ scale: 2.0 });

    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        await firstPage.render({ canvasContext: ctx, viewport }).promise;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          const imageFile = new File([blob], file.name.replace(/\.pdf$/i, '.png'), {
            type: 'image/png',
          });
          return extractTextAndConfidenceFromImageFile(imageFile, onProgress);
        }
      }
    }

    return { text: fullText.trim(), confidence: fullText.trim() ? 80 : 0 };
  } catch {
    // If unscannable or corrupted PDF, return empty text so fields remain empty
    return { text: '', confidence: 0 };
  }
}

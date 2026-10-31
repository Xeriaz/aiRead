import { createWorker } from 'tesseract.js';

export interface OcrProgressCallback {
  (progressPercent: number): void;
}

/**
 * Pre-processes an image File in transient memory on an offscreen canvas
 * (downscales to max 2000px and increases grayscale contrast for cleaner OCR),
 * runs local Tesseract.js OCR (Lithuanian + English), and immediately destroys
 * all temporary image buffers and object URLs.
 */
export async function extractTextFromImageFile(
  file: File,
  onProgress?: OcrProgressCallback
): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  let canvas: HTMLCanvasElement | null = null;

  try {
    onProgress?.(5);
    const processedSource = await preprocessImageInMemory(objectUrl, (c) => {
      canvas = c;
    });

    onProgress?.(15);
    const worker = await createWorker(['lit', 'eng'], 1, {
      logger: (m) => {
        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
          onProgress?.(Math.min(99, Math.round(15 + m.progress * 84)));
        }
      },
    });

    try {
      const {
        data: { text },
      } = await worker.recognize(processedSource);
      onProgress?.(100);
      return text || '';
    } finally {
      await worker.terminate();
    }
  } finally {
    // Strictly purge transient image from memory
    URL.revokeObjectURL(objectUrl);
    if (canvas) {
      const c = canvas as HTMLCanvasElement;
      c.width = 0;
      c.height = 0;
    }
  }
}

async function preprocessImageInMemory(
  objectUrl: string,
  registerCanvas: (canvas: HTMLCanvasElement) => void
): Promise<HTMLCanvasElement | string> {
  if (typeof document === 'undefined') {
    return objectUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 2000;
        let width = img.naturalWidth || img.width || 1000;
        let height = img.naturalHeight || img.height || 1000;

        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        registerCanvas(canvas);
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(objectUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Grayscale + contrast boost for crisp receipt/document text
        const contrast = 1.35;
        const intercept = 128 * (1 - contrast);

        for (let i = 0; i < data.length; i += 4) {
          const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const boosted = Math.max(0, Math.min(255, luminance * contrast + intercept));
          data[i] = boosted;
          data[i + 1] = boosted;
          data[i + 2] = boosted;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas);
      } catch {
        resolve(objectUrl);
      }
    };
    img.onerror = () => resolve(objectUrl);
    img.src = objectUrl;
  });
}

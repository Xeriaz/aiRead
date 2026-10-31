import { createWorker, type Worker } from 'tesseract.js';

export interface OcrProgressCallback {
  (progressPercent: number): void;
}

export interface OcrExtractionResult {
  text: string;
  confidence?: number;
}

export interface EphemeralResourceHandle {
  objectUrl?: string;
  canvas?: HTMLCanvasElement | null;
  worker?: { terminate: () => Promise<unknown> | unknown } | null;
}

interface ActiveEphemeralEntry {
  handle: EphemeralResourceHandle;
  timerId: ReturnType<typeof setTimeout>;
  disposed: boolean;
}

/**
 * Hard 30-second TTL watchdog limit for any ephemeral image in RAM.
 * Images NEVER touch localStorage, sessionStorage, IndexedDB, or disk cache.
 */
export const IMAGE_MEMORY_TTL_MS = 30_000;

const activeEphemeralRegistry = new Set<ActiveEphemeralEntry>();

async function disposeEphemeralEntry(entry: ActiveEphemeralEntry): Promise<void> {
  if (entry.disposed) return;
  entry.disposed = true;
  activeEphemeralRegistry.delete(entry);
  clearTimeout(entry.timerId);

  const { handle } = entry;

  if (handle.objectUrl) {
    try {
      URL.revokeObjectURL(handle.objectUrl);
    } catch {
      // Ignore errors in non-browser test environments
    }
    handle.objectUrl = undefined;
  }

  if (handle.canvas) {
    try {
      handle.canvas.width = 0;
      handle.canvas.height = 0;
    } catch {
      // Ignore errors if canvas was already detached
    }
    handle.canvas = null;
  }

  if (handle.worker) {
    const workerToTerminate = handle.worker;
    handle.worker = null;
    try {
      await workerToTerminate.terminate();
    } catch {
      // Ignore worker termination errors
    }
  }
}

/**
 * Registers an ephemeral image resource (blob URL, offscreen canvas, and/or Tesseract worker)
 * with a hard 30-second TTL watchdog timer. If OCR hangs or is interrupted, the watchdog
 * automatically revokes the blob URL, zeroes the canvas dimensions, and terminates the worker.
 */
export function registerEphemeralResource(
  handle: EphemeralResourceHandle,
  ttlMs: number = IMAGE_MEMORY_TTL_MS
): () => Promise<void> {
  const entry: ActiveEphemeralEntry = {
    handle,
    disposed: false,
    timerId: setTimeout(() => {
      void disposeEphemeralEntry(entry);
    }, ttlMs),
  };

  activeEphemeralRegistry.add(entry);

  return () => disposeEphemeralEntry(entry);
}

/**
 * Shared warm worker state for batch scans to avoid repeated heavy initialization.
 */
let warmWorkerPromise: Promise<Worker> | null = null;
let warmWorkerHandle: EphemeralResourceHandle | null = null;
let warmWorkerRelease: (() => Promise<void>) | null = null;
let currentProgressCallback: OcrProgressCallback | null = null;

async function getOrCreateWarmWorker(): Promise<Worker> {
  // If a warm worker entry exists and is active, reset its TTL watchdog
  if (warmWorkerRelease) {
    await warmWorkerRelease();
    warmWorkerRelease = null;
  }

  if (!warmWorkerPromise) {
    warmWorkerPromise = (async () => {
      const worker = await createWorker(['lit', 'eng'], 1, {
        logger: (m) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            currentProgressCallback?.(Math.min(99, Math.round(15 + m.progress * 84)));
          }
        },
      });
      return worker;
    })().catch((err) => {
      warmWorkerPromise = null;
      throw err;
    });
  }

  const worker = await warmWorkerPromise;
  warmWorkerHandle = { worker };
  warmWorkerRelease = registerEphemeralResource(warmWorkerHandle, IMAGE_MEMORY_TTL_MS);
  return worker;
}

/**
 * Immediately purges all active ephemeral image buffers, blob URLs, offscreen canvases,
 * and OCR workers currently registered in RAM.
 */
export function cleanupAllEphemeralResources(): void {
  warmWorkerPromise = null;
  warmWorkerHandle = null;
  warmWorkerRelease = null;
  currentProgressCallback = null;

  for (const entry of Array.from(activeEphemeralRegistry)) {
    void disposeEphemeralEntry(entry);
  }
}

export const cleanupAllEphemeralImages = cleanupAllEphemeralResources;

export function getActiveEphemeralResourceCount(): number {
  return activeEphemeralRegistry.size;
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', cleanupAllEphemeralImages);
}

/**
 * Pre-processes an image File in transient memory on an offscreen canvas,
 * runs local Tesseract.js OCR (Lithuanian + English), returns extracted text and
 * OCR confidence (0-100), and strictly destroys all temporary image buffers via
 * both `finally` cleanup and the 30-second hard TTL watchdog.
 */
export async function extractTextAndConfidenceFromImageFile(
  file: File,
  onProgress?: OcrProgressCallback
): Promise<OcrExtractionResult> {
  const objectUrl = URL.createObjectURL(file);
  const resourceHandle: EphemeralResourceHandle = {
    objectUrl,
    canvas: null,
  };
  const releaseImageResources = registerEphemeralResource(resourceHandle, IMAGE_MEMORY_TTL_MS);

  try {
    currentProgressCallback = onProgress ?? null;
    onProgress?.(5);
    const processedSource = await preprocessImageInMemory(objectUrl, (c) => {
      resourceHandle.canvas = c;
    });

    onProgress?.(15);
    const worker = await getOrCreateWarmWorker();

    const {
      data: { text, confidence },
    } = await worker.recognize(processedSource);
    onProgress?.(100);
    return {
      text: text || '',
      confidence: typeof confidence === 'number' ? confidence : undefined,
    };
  } finally {
    currentProgressCallback = null;
    await releaseImageResources();
  }
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
  const result = await extractTextAndConfidenceFromImageFile(file, onProgress);
  return result.text;
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

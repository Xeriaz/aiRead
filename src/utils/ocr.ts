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

/**
 * Idle watchdog timeout for warm Tesseract worker in RAM (60 seconds).
 */
export const WARM_WORKER_IDLE_TIMEOUT_MS = 60_000;

/**
 * Maximum timeout for a single OCR image recognition pass (45 seconds).
 */
export const OCR_TIMEOUT_MS = 45_000;

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
 * Registers an ephemeral image resource (blob URL and offscreen canvas)
 * with a hard 30-second TTL watchdog timer. If processing hangs or is interrupted, the watchdog
 * automatically revokes the blob URL and zeroes the canvas dimensions.
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
 * Warm worker singleton state and idle timer.
 */
let warmWorker: Worker | null = null;
let warmWorkerPromise: Promise<Worker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let currentProgressCallback: OcrProgressCallback | null = null;

function scheduleWarmWorkerIdle(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (!warmWorker && !warmWorkerPromise) {
    return;
  }
  idleTimer = setTimeout(() => {
    void terminateWarmWorker();
  }, WARM_WORKER_IDLE_TIMEOUT_MS);
}

/**
 * Gets the existing warm worker or creates a new one.
 * If an idle timer is pending, cancels the timer and retains the existing alive worker.
 */
export async function getOrCreateWarmWorker(): Promise<Worker> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  if (warmWorker) {
    scheduleWarmWorkerIdle();
    return warmWorker;
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
      warmWorker = worker;
      return worker;
    })().catch((err) => {
      warmWorker = null;
      warmWorkerPromise = null;
      throw err;
    });
  }

  const worker = await warmWorkerPromise;
  scheduleWarmWorkerIdle();
  return worker;
}

/**
 * Cleanly releases warm Tesseract OCR worker memory.
 * Cancels pending idle watchdog timer, terminates worker, and clears references.
 */
export async function terminateWarmWorker(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const workerToTerminate = warmWorker;
  const inFlightPromise = warmWorkerPromise;
  warmWorker = null;
  warmWorkerPromise = null;

  if (workerToTerminate) {
    try {
      await workerToTerminate.terminate();
    } catch {
      // Ignore worker termination errors
    }
  } else if (inFlightPromise) {
    try {
      const w = await inFlightPromise;
      await w.terminate();
    } catch {
      // Ignore worker termination errors
    }
  }
}

/**
 * Returns the current warm worker instance, if any (primarily for inspection/testing).
 */
export function getWarmWorker(): Worker | null {
  return warmWorker;
}

/**
 * Immediately purges all active ephemeral image buffers, blob URLs, offscreen canvases,
 * and releases warm OCR worker currently registered in RAM.
 */
export function cleanupAllEphemeralResources(): void {
  void terminateWarmWorker();
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
  window.addEventListener('pagehide', cleanupAllEphemeralResources);
}

/**
 * Pre-processes an image File in transient memory on an offscreen canvas,
 * runs local Tesseract.js OCR (Lithuanian + English) using a shared warm worker,
 * applies an explicit per-image OCR timeout (45 seconds), returns extracted text and confidence,
 * and strictly destroys temporary image buffers via both `finally` cleanup and the 30-second hard TTL watchdog.
 */
export async function extractTextAndConfidenceFromImageFile(
  file: File,
  onProgress?: OcrProgressCallback
): Promise<OcrExtractionResult> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    const { extractTextAndConfidenceFromPdfFile } = await import('./pdf');
    return extractTextAndConfidenceFromPdfFile(file, onProgress);
  }

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

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`OCR recognition timed out after ${OCR_TIMEOUT_MS}ms`));
      }, OCR_TIMEOUT_MS);
    });

    try {
      const recognitionPromise = worker.recognize(processedSource);
      recognitionPromise.catch(() => {});

      const {
        data: { text, confidence },
      } = await Promise.race([recognitionPromise, timeoutPromise]);

      onProgress?.(100);
      return {
        text: text || '',
        confidence: typeof confidence === 'number' ? confidence : undefined,
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  } catch (err) {
    await terminateWarmWorker();
    throw err;
  } finally {
    currentProgressCallback = null;
    await releaseImageResources();
    scheduleWarmWorkerIdle();
  }
}

/**
 * Pre-processes an image File in transient memory on an offscreen canvas
 * (upscales small crops, adds whitespace padding, boosts contrast, and suppresses form underlines),
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

/**
 * Unified file text and confidence extractor.
 * Automatically delegates to PDF extractor if file is a PDF,
 * or runs image preprocessing and Tesseract OCR if file is an image.
 */
export const extractTextAndConfidenceFromFile = extractTextAndConfidenceFromImageFile;

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

        // Downscale oversized images
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        // Upscale small crops / low-resolution images so character strokes are clear for OCR
        const minDim = 300;
        if (height < minDim || width < 600) {
          const upScale = Math.min(
            3.5,
            Math.max(1.5, 600 / Math.max(width, 100), minDim / Math.max(height, 50))
          );
          width = Math.round(width * upScale);
          height = Math.round(height * upScale);
        }

        // Add 20px padding margin around the image to prevent edge-touching characters from clipping
        const padding = 20;
        const canvas = document.createElement('canvas');
        registerCanvas(canvas);
        canvas.width = width + padding * 2;
        canvas.height = height + padding * 2;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(objectUrl);
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, padding, padding, width, height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;

        // Grayscale + dynamic contrast boost
        const contrast = 1.45;
        const intercept = 128 * (1 - contrast);

        const grayBuffer = new Uint8Array(canvasWidth * canvasHeight);
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const boosted = Math.max(0, Math.min(255, luminance * contrast + intercept));
          data[i] = boosted;
          data[i + 1] = boosted;
          data[i + 2] = boosted;
          grayBuffer[p] = boosted;
        }

        // Horizontal line suppression for form field underlines:
        // Detect long horizontal lines (1-3px thick) where neighboring vertical pixels are background
        for (let y = padding + 2; y < canvasHeight - padding - 2; y++) {
          let darkCountInRow = 0;
          for (let x = padding; x < canvasWidth - padding; x++) {
            if (grayBuffer[y * canvasWidth + x] < 140) {
              darkCountInRow++;
            }
          }
          // If a row has a continuous horizontal stroke spanning > 35% of content width
          if (darkCountInRow > (canvasWidth - padding * 2) * 0.35) {
            for (let x = padding; x < canvasWidth - padding; x++) {
              const idx = y * canvasWidth + x;
              const above = (y - 3) * canvasWidth + x;
              const below = (y + 3) * canvasWidth + x;
              // If surrounding vertical space is light/background, suppress the thin underline
              if (grayBuffer[above] > 180 && grayBuffer[below] > 180) {
                const dataIdx = idx * 4;
                data[dataIdx] = 255;
                data[dataIdx + 1] = 255;
                data[dataIdx + 2] = 255;
              }
            }
          }
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

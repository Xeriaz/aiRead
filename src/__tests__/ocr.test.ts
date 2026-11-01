import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorker } from 'tesseract.js';
import {
  cleanupAllEphemeralResources,
  extractTextAndConfidenceFromImageFile,
  getOrCreateWarmWorker,
  getWarmWorker,
  OCR_TIMEOUT_MS,
  getLocalTesseractOptions,
  terminateWarmWorker,
  WARM_WORKER_IDLE_TIMEOUT_MS,
} from '../utils/ocr';

interface MockWorkerInstance {
  recognize: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
}

const mockWorkerInstances: MockWorkerInstance[] = [];

vi.mock('tesseract.js', () => {
  return {
    createWorker: vi.fn(async () => {
      const instance = {
        recognize: vi.fn().mockResolvedValue({
          data: {
            text: 'Mock OCR text',
            confidence: 92,
          },
        }),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      mockWorkerInstances.push(instance);
      return instance;
    }),
  };
});

class MockImage {
  private _src = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 800;
  height = 600;
  naturalWidth = 800;
  naturalHeight = 600;

  get src() {
    return this._src;
  }
  set src(val: string) {
    this._src = val;
    if (this.onload) {
      this.onload();
    }
  }
}

describe('Warm Tesseract Worker Lifecycle & Resilience', () => {
  beforeEach(() => {
    mockWorkerInstances.length = 0;
    cleanupAllEphemeralResources();

    vi.mocked(createWorker).mockImplementation(async () => {
      const instance = {
        recognize: vi.fn().mockResolvedValue({
          data: {
            text: 'Mock OCR text',
            confidence: 92,
          },
        }),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      mockWorkerInstances.push(instance);
      return instance as any;
    });

    vi.stubGlobal('Image', MockImage);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-test-image');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(async () => {
    await terminateWarmWorker();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps warm worker alive across sequential getOrCreateWarmWorker calls without premature termination', async () => {
    // Call #1: creates new worker
    const worker1 = await getOrCreateWarmWorker();
    expect(mockWorkerInstances).toHaveLength(1);
    expect(mockWorkerInstances[0].terminate).not.toHaveBeenCalled();

    // Call #2: returns the warm alive worker without terminating it
    const worker2 = await getOrCreateWarmWorker();
    expect(worker2).toBe(worker1);
    expect(mockWorkerInstances).toHaveLength(1);
    expect(mockWorkerInstances[0].terminate).not.toHaveBeenCalled();

    // Confirm worker reference is active
    expect(getWarmWorker()).toBe(worker1);
  });

  it('resets the worker reference and terminates the worker when cleanupAllEphemeralResources is called', async () => {
    const worker1 = await getOrCreateWarmWorker();
    expect(mockWorkerInstances).toHaveLength(1);

    // Call cleanupAllEphemeralResources
    cleanupAllEphemeralResources();

    // Worker reference must be reset to null
    expect(getWarmWorker()).toBeNull();
    expect(mockWorkerInstances[0].terminate).toHaveBeenCalledTimes(1);

    // Call #3: must instantiate a fresh new worker
    const worker3 = await getOrCreateWarmWorker();
    expect(mockWorkerInstances).toHaveLength(2);
    expect(worker3).not.toBe(worker1);
    expect(getWarmWorker()).toBe(worker3);
  });

  it('terminates warm worker when 60-second idle timer expires, but keeps it alive if requests arrive before timeout', async () => {
    vi.useFakeTimers();
    try {
      // Call #1: worker created, 60s idle timer scheduled
      const worker1 = await getOrCreateWarmWorker();
      expect(mockWorkerInstances).toHaveLength(1);
      expect(mockWorkerInstances[0].terminate).not.toHaveBeenCalled();

      // Advance halfway through idle timeout
      await vi.advanceTimersByTimeAsync(WARM_WORKER_IDLE_TIMEOUT_MS / 2);
      expect(mockWorkerInstances[0].terminate).not.toHaveBeenCalled();

      // Call #2 arrives at 30 seconds: clears pending idle timer, keeps worker alive
      const worker2 = await getOrCreateWarmWorker();
      expect(worker2).toBe(worker1);
      expect(mockWorkerInstances[0].terminate).not.toHaveBeenCalled();

      // Advance 40 seconds (less than WARM_WORKER_IDLE_TIMEOUT_MS since call #2)
      await vi.advanceTimersByTimeAsync(40_000);
      expect(mockWorkerInstances[0].terminate).not.toHaveBeenCalled();

      // Advance past WARM_WORKER_IDLE_TIMEOUT_MS from call #2
      await vi.advanceTimersByTimeAsync(WARM_WORKER_IDLE_TIMEOUT_MS - 40_000 + 100);

      // Idle timer expired: worker terminated, warm worker reference reset
      expect(mockWorkerInstances[0].terminate).toHaveBeenCalledTimes(1);
      expect(getWarmWorker()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reuses warm worker on sequential extractTextAndConfidenceFromImageFile calls (fixing Image 2 freeze)', async () => {
    const file1 = new File(['image-1'], 'photo1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['image-2'], 'photo2.jpg', { type: 'image/jpeg' });

    // Call #1 for Image 1
    const res1 = await extractTextAndConfidenceFromImageFile(file1);
    expect(res1.text).toBe('Mock OCR text');
    expect(res1.confidence).toBe(92);
    expect(mockWorkerInstances).toHaveLength(1);
    expect(mockWorkerInstances[0].terminate).not.toHaveBeenCalled();

    // Call #2 for Image 2: must reuse worker from Image 1 and NOT terminate it
    const res2 = await extractTextAndConfidenceFromImageFile(file2);
    expect(res2.text).toBe('Mock OCR text');
    expect(mockWorkerInstances).toHaveLength(1);
    expect(mockWorkerInstances[0].terminate).not.toHaveBeenCalled();
    expect(mockWorkerInstances[0].recognize).toHaveBeenCalledTimes(2);
  });

  it('rejects with timeout error and resets warm worker if OCR recognition exceeds 45s timeout', async () => {
    vi.useFakeTimers();
    try {
      const file = new File(['hanging-img'], 'hang.jpg', { type: 'image/jpeg' });

      // Override worker to simulate a hung recognition promise
      vi.mocked(createWorker).mockImplementation(async () => {
        const instance = {
          recognize: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
          terminate: vi.fn().mockResolvedValue(undefined),
        };
        mockWorkerInstances.push(instance);
        return instance as any;
      });

      const assertion = expect(
        extractTextAndConfidenceFromImageFile(file)
      ).rejects.toThrow(`OCR recognition timed out after ${OCR_TIMEOUT_MS}ms`);

      // Advance timer past 45-second per-image OCR timeout
      await vi.advanceTimersByTimeAsync(OCR_TIMEOUT_MS + 100);

      await assertion;

      // Warm worker must be terminated and reset so next image starts fresh
      expect(mockWorkerInstances[0].terminate).toHaveBeenCalledTimes(1);
      expect(getWarmWorker()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('terminates warm worker and resets reference if recognition throws an error', async () => {
    const file1 = new File(['bad-img'], 'bad.jpg', { type: 'image/jpeg' });
    const file2 = new File(['good-img'], 'good.jpg', { type: 'image/jpeg' });

    vi.mocked(createWorker).mockImplementation(async () => {
      const instanceIndex = mockWorkerInstances.length;
      const instance = {
        recognize: vi.fn().mockImplementation(async () => {
          if (instanceIndex === 0) {
            throw new Error('Recognition failed');
          }
          return { data: { text: 'Recovered text', confidence: 85 } };
        }),
        terminate: vi.fn().mockResolvedValue(undefined),
      };
      mockWorkerInstances.push(instance);
      return instance as any;
    });

    // Image 1 throws error
    await expect(extractTextAndConfidenceFromImageFile(file1)).rejects.toThrow('Recognition failed');

    // First worker was terminated and reference reset
    expect(mockWorkerInstances[0].terminate).toHaveBeenCalledTimes(1);
    expect(getWarmWorker()).toBeNull();

    // Image 2 should get a fresh warm worker and succeed
    const res2 = await extractTextAndConfidenceFromImageFile(file2);
    expect(res2.text).toBe('Recovered text');
    expect(mockWorkerInstances).toHaveLength(2);
  });

  it('configures Tesseract with local self-hosted worker, core, and lang paths for 100% offline operation', async () => {
    const opts = getLocalTesseractOptions();
    expect(opts.workerPath).toContain("/tesseract/worker.min.js");
    expect(opts.corePath).toContain("/tesseract");
    expect(opts.langPath).toContain("/tesseract/lang");
    expect(opts.gzip).toBe(true);

    await getOrCreateWarmWorker();
    expect(createWorker).toHaveBeenCalledWith(
      ['lit', 'eng'],
      1,
      expect.objectContaining({
        workerPath: expect.stringContaining("/tesseract/worker.min.js"),
        corePath: expect.stringContaining("/tesseract"),
        langPath: expect.stringContaining("/tesseract/lang"),
        gzip: true,
      })
    );
  });
});

const MEMORY_PRESSURE_THRESHOLD = 0.8;

export class MemoryPressureError extends Error {
  constructor() {
    super("Server is under memory pressure. Try again shortly.");
    this.name = "MemoryPressureError";
  }
}

export function getMemoryPressureThresholdBytes(maxHeapMb: number): number {
  return Math.floor(maxHeapMb * 1024 * 1024 * MEMORY_PRESSURE_THRESHOLD);
}

export function assertHeapWithinLimit(maxHeapMb: number): void {
  const heapUsed = process.memoryUsage().heapUsed;

  if (heapUsed >= getMemoryPressureThresholdBytes(maxHeapMb)) {
    throw new MemoryPressureError();
  }
}

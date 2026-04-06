import { describe, expect, it, vi } from "vitest";

import {
  createQueryWorkerPayload,
  startQueryWorker,
} from "@/lib/queryWorker";

describe("unit/queryWorker", () => {
  it("ignores invalid worker messages", () => {
    const handlers: Array<(message: unknown) => void> = [];
    const port = {
      on: vi.fn((_event: string, handler: (message: unknown) => void) => {
        handlers.push(handler);
      }),
      postMessage: vi.fn(),
      removeAllListeners: vi.fn(),
    };

    startQueryWorker(port, createQueryWorkerPayload());
    handlers[0]({ nope: true });

    expect(port.postMessage).not.toHaveBeenCalled();
  });
});


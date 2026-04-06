import { describe, expect, it, vi } from "vitest";

import {
  createQueryWorkerPayload,
  runQueryWorker,
  startQueryWorker,
} from "@/lib/queryWorker";

describe("queryWorker", () => {
  it("runs a query and posts the result back to the worker port", () => {
    const port = {
      on: vi.fn(),
      postMessage: vi.fn(),
      removeAllListeners: vi.fn(),
    };

    const result = runQueryWorker(
      {
        id: "job-1",
        options: {
          files: [
            {
              buffer: Buffer.from("value\n1\n2\n", "utf8"),
              filename: "numbers.csv",
            },
          ],
          query: "SELECT COUNT(*) AS count FROM numbers",
        },
      },
      port,
    );

    expect(result).toEqual({
      id: "job-1",
      ok: true,
      result: expect.objectContaining({
        rows: [{ count: 2 }],
      }),
    });
    expect(port.postMessage).toHaveBeenCalledWith(result);
  });

  it("throws when started without a worker port", () => {
    expect(() =>
      startQueryWorker(
        null,
        createQueryWorkerPayload(),
      ),
    ).toThrow("Query worker must run inside a worker thread.");
  });

  it("throws when started with an invalid worker payload", () => {
    const port = {
      on: vi.fn(),
      postMessage: vi.fn(),
      removeAllListeners: vi.fn(),
    };

    expect(() => startQueryWorker(port, {})).toThrow("Query worker payload was invalid.");
  });

  it("starts successfully when given a valid worker payload", () => {
    const port = {
      on: vi.fn(),
      postMessage: vi.fn(),
      removeAllListeners: vi.fn(),
    };

    startQueryWorker(port, createQueryWorkerPayload());

    expect(port.removeAllListeners).toHaveBeenCalledWith("message");
    expect(port.on).toHaveBeenCalledWith("message", expect.any(Function));
  });
});

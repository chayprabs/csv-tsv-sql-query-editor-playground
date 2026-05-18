import { describe, expect, it } from "vitest";

import { readQueryApiResponse } from "../readQueryApiResponse.ts";

describe("readQueryApiResponse", () => {
  it("parses valid JSON payloads", async () => {
    const response = new Response(
      JSON.stringify({
        columns: ["a"],
        executionTimeMs: 12,
        requestId: "abc-def",
        rowCount: 1,
        rows: [{ a: 1 }],
      }),
      { headers: { "x-request-id": "hdr-id" }, status: 200 },
    );

    const payload = await readQueryApiResponse(response);

    expect(payload.rowCount).toBe(1);
    expect(payload.requestId).toBe("abc-def");
    expect(payload.error).toBeUndefined();
  });

  it("fills request id from headers when JSON omits it", async () => {
    const response = new Response(
      JSON.stringify({
        columns: [],
        executionTimeMs: 1,
        rowCount: 0,
        rows: [],
      }),
      { headers: { "x-request-id": "from-header" }, status: 200 },
    );

    const payload = await readQueryApiResponse(response);

    expect(payload.requestId).toBe("from-header");
  });

  it("returns a safe error payload when body is not JSON", async () => {
    const response = new Response("<html>error</html>", {
      headers: { "x-request-id": "xyz" },
      status: 502,
    });

    const payload = await readQueryApiResponse(response);

    expect(payload.error).toContain("unexpected response");
    expect(payload.error).toContain("502");
    expect(payload.requestId).toBe("xyz");
    expect(payload.rows).toEqual([]);
  });
});

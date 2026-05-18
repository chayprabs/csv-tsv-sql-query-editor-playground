import type { QueryResponse } from "./csvToSqlite.ts";

export async function readQueryApiResponse(
  response: Response,
): Promise<QueryResponse> {
  const headerRequestId = response.headers.get("x-request-id") ?? "";
  const text = await response.text();

  try {
    const parsed = JSON.parse(text) as QueryResponse;

    return {
      columns: parsed.columns ?? [],
      executionTimeMs: parsed.executionTimeMs ?? 0,
      requestId: parsed.requestId ?? headerRequestId,
      returnedRows: parsed.returnedRows,
      rowCount: parsed.rowCount ?? 0,
      rows: parsed.rows ?? [],
      totalRows: parsed.totalRows,
      truncated: parsed.truncated,
      warning: parsed.warning,
      error: parsed.error,
    };
  } catch {
    return {
      columns: [],
      executionTimeMs: 0,
      error: response.ok
        ? "Server returned an unexpected response."
        : `Server returned an unexpected response (HTTP ${response.status}).`,
      requestId: headerRequestId,
      rowCount: 0,
      rows: [],
    };
  }
}

const MAX_QUERY_HISTORY = 10;

export function parseStoredQueryHistory(rawValue: string | null): string[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function mergeQueryHistory(
  history: string[],
  nextQuery: string,
): string[] {
  const normalizedQuery = nextQuery.trim();

  if (!normalizedQuery) {
    return history;
  }

  return [normalizedQuery, ...history.filter((query) => query !== normalizedQuery)].slice(
    0,
    MAX_QUERY_HISTORY,
  );
}

export function serializeQueryHistory(history: string[]): string {
  return JSON.stringify(history);
}

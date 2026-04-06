const TABLE_NAME_FALLBACK = "table_1";
const SQLITE_RESERVED_WORDS = new Set([
  "add",
  "all",
  "alter",
  "and",
  "as",
  "by",
  "case",
  "create",
  "delete",
  "distinct",
  "drop",
  "from",
  "group",
  "having",
  "in",
  "index",
  "insert",
  "into",
  "join",
  "key",
  "limit",
  "not",
  "null",
  "offset",
  "on",
  "or",
  "order",
  "primary",
  "select",
  "set",
  "union",
  "update",
  "values",
  "where",
]);

function normalizeBaseTableName(filename: string): string {
  const nameWithoutPath = filename.split(/[/\\]/).pop() ?? filename;
  const withoutExtension = nameWithoutPath.replace(/\.[^/.]+$/, "");
  const normalizedBase =
    withoutExtension
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || TABLE_NAME_FALLBACK;

  if (/^\d/.test(normalizedBase) || SQLITE_RESERVED_WORDS.has(normalizedBase)) {
    return `t_${normalizedBase}`;
  }

  return normalizedBase;
}

export function deriveTableName(
  filename: string,
  takenNames: Set<string>,
): string {
  const baseName = normalizeBaseTableName(filename);
  let candidate = baseName;
  let suffix = 1;

  while (takenNames.has(candidate)) {
    candidate = `${baseName}_${suffix}`;
    suffix += 1;
  }

  takenNames.add(candidate);

  return candidate;
}

import { CLIENT_LIMITS } from "@/lib/clientLimits";

export interface UploadValidationIssue {
  filename: string;
  message: string;
}

export interface UploadValidationResult {
  accepted: File[];
  issues: UploadValidationIssue[];
  rejectedCount: number;
}

const ALLOWED_EXTENSIONS = [".csv", ".tsv", ".txt"];

function isAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function isAllowedMime(file: File): boolean {
  const mime = file.type.toLowerCase();

  if (!mime) {
    return false;
  }

  if (mime.startsWith("text/")) {
    return true;
  }

  return mime === "application/csv" || mime === "application/vnd.ms-excel";
}

export function isAllowedUploadFile(file: File): boolean {
  if (isAllowedExtension(file.name)) {
    return true;
  }

  return isAllowedMime(file);
}

export function validateUploadBatch(
  incoming: File[],
  existing: File[] = [],
): UploadValidationResult {
  const issues: UploadValidationIssue[] = [];
  const accepted: File[] = [];
  let rejectedCount = 0;

  const seen = new Set(
    existing.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
  );

  for (const file of incoming) {
    if (!isAllowedUploadFile(file)) {
      rejectedCount += 1;
      issues.push({
        filename: file.name,
        message: `"${file.name}" is not a supported CSV, TSV, or text file.`,
      });
      continue;
    }

    const identity = `${file.name}:${file.size}:${file.lastModified}`;

    if (seen.has(identity)) {
      continue;
    }

    if (file.size > CLIENT_LIMITS.maxUploadBytes) {
      rejectedCount += 1;
      issues.push({
        filename: file.name,
        message: `"${file.name}" exceeds the per-file size limit.`,
      });
      continue;
    }

    seen.add(identity);
    accepted.push(file);
  }

  const combined = [...existing, ...accepted];

  if (combined.length > CLIENT_LIMITS.maxFileCount) {
    const overflow = combined.length - CLIENT_LIMITS.maxFileCount;
    const dropped = combined.splice(CLIENT_LIMITS.maxFileCount);
    rejectedCount += overflow;

    for (const file of dropped) {
      issues.push({
        filename: file.name,
        message: `Only ${CLIENT_LIMITS.maxFileCount} files are allowed per request.`,
      });
    }
  }

  let totalBytes = combined.reduce((sum, file) => sum + file.size, 0);

  while (totalBytes > CLIENT_LIMITS.maxTotalBytes && combined.length > existing.length) {
    const removed = combined.pop();

    if (!removed) {
      break;
    }

    rejectedCount += 1;
    totalBytes -= removed.size;
    issues.push({
      filename: removed.name,
      message: `Total upload size cannot exceed ${Math.round(CLIENT_LIMITS.maxTotalBytes / (1024 * 1024))} MB.`,
    });
  }

  const acceptedAfterLimits = combined.slice(existing.length);

  return {
    accepted: acceptedAfterLimits,
    issues,
    rejectedCount,
  };
}

export function summarizeUploadIssues(issues: UploadValidationIssue[]): string | null {
  if (issues.length === 0) {
    return null;
  }

  const uniqueMessages = [...new Set(issues.map((issue) => issue.message))];

  if (uniqueMessages.length === 1) {
    return uniqueMessages[0];
  }

  return `${issues.length} file(s) could not be added. ${uniqueMessages[0]}`;
}

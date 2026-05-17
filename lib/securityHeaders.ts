export const BASE_SECURITY_HEADERS = {
  "Permissions-Policy": "camera=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
} as const;

export const API_SECURITY_HEADERS = {
  ...BASE_SECURITY_HEADERS,
  "Cache-Control": "no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'",
} as const;

/**
 * Page/document CSP per Quarry PRD §13 (Layer 8). `unsafe-eval` is added in
 * `development` only so Next.js dev tooling (HMR) keeps working; production
 * builds omit it.
 */
export function buildDocumentContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV === "development";
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

function documentHeaders(): Record<string, string> {
  return {
    ...BASE_SECURITY_HEADERS,
    "Content-Security-Policy": buildDocumentContentSecurityPolicy(),
  };
}

export type SecurityHeadersMode = "api" | "document";

export function applySecurityHeaders(
  headers: Headers,
  mode: SecurityHeadersMode = "document",
): Headers {
  const source = mode === "api" ? API_SECURITY_HEADERS : documentHeaders();

  for (const [key, value] of Object.entries(source)) {
    headers.set(key, value);
  }

  return headers;
}

export function createSecurityHeaders(
  mode: SecurityHeadersMode = "document",
): Headers {
  return applySecurityHeaders(new Headers(), mode);
}

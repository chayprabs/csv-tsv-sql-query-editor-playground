export const BASE_SECURITY_HEADERS = {
  "Permissions-Policy": "camera=(), microphone=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
} as const;

export const API_SECURITY_HEADERS = {
  ...BASE_SECURITY_HEADERS,
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'",
} as const;

export function applySecurityHeaders(
  headers: Headers,
  isApiResponse = false,
): Headers {
  const source = isApiResponse ? API_SECURITY_HEADERS : BASE_SECURITY_HEADERS;

  for (const [key, value] of Object.entries(source)) {
    headers.set(key, value);
  }

  return headers;
}

export function createSecurityHeaders(isApiResponse = false): Headers {
  return applySecurityHeaders(new Headers(), isApiResponse);
}

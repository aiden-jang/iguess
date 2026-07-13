// Framework-agnostic HTTP hardening for the game-server (a plain-fetch Worker, not Hono). Mirrors
// the securityHeaders core the platform's Hono workers use, so the browser-facing responses (the
// served client HTML + static assets) carry the same CSP/HSTS/etc. The game-server is fully
// same-origin: the client, its assets, and the WebSocket all live on one host, so the default CSP
// needs no per-app loosening. `connect-src 'self'` covers the same-origin ws/wss upgrade per CSP3.

const DEFAULT_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https://static.cloudflareinsights.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': DEFAULT_CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
};

// Return a copy of `res` with the security headers stamped on. Static-asset responses from
// env.ASSETS.fetch carry immutable headers, so rebuild with a fresh, mutable Headers rather than
// mutating in place (which would throw).
export function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

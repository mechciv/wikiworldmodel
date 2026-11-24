// Shared HTML escaping, URL scheme filtering, and build-id validation for the viewer UI.

const HTML_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape untrusted text for safe interpolation into HTML text nodes and double/single-quoted attributes. */
export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => HTML_MAP[c]!);
}

/** Return the URL if it uses http: or https:, else undefined (blocks javascript:, data:, vbscript:, etc.). */
export function safeHref(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch {
    // Reject malformed or non-absolute URLs.
  }
  return undefined;
}

const SAFE_BUILD_ID = /^[0-9A-Za-z._-]+$/;

/** Whether a build id from a URL parameter is a single safe path segment (no slashes or traversal). */
export function isSafeBuildId(id: string | null | undefined): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && id !== '.' && id !== '..' && SAFE_BUILD_ID.test(id);
}

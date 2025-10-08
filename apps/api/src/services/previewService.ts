const EXACT_TYPES = new Set([
  'application/json',
  'application/sql',
  'application/xml',
]);

const PREFIX_TYPES = ['text/'];

export function isPreviewable(contentType: string | undefined, size: number, maxBytes = 5 * 1024 * 1024): boolean {
  if (!contentType) return false;
  if (size > maxBytes) return false;
  if (EXACT_TYPES.has(contentType)) return true;
  return PREFIX_TYPES.some((prefix) => contentType.startsWith(prefix));
}

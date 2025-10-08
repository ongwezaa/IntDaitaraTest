const TEXT_TYPES = new Set([
  "text/plain",
  "text/csv",
  "application/json",
  "application/sql",
  "application/xml",
]);

export function shouldPreview(contentType: string | undefined, size: number) {
  if (!contentType) return false;
  if (size > 5 * 1024 * 1024) return false; // 5 MB
  if (contentType.startsWith("text/")) return true;
  return TEXT_TYPES.has(contentType);
}

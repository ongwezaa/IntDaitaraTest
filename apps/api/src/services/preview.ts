const TEXT_TYPES = new Set([
  "application/json",
  "text/plain",
  "text/csv",
  "application/sql",
  "application/xml",
]);

export const shouldPreview = (contentType: string, size: number): boolean => {
  if (size > 5 * 1024 * 1024) {
    return false;
  }
  if (contentType.startsWith("text/")) {
    return true;
  }
  return TEXT_TYPES.has(contentType);
};

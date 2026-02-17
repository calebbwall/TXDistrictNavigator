const EMPTY_PLACEHOLDERS = [
  "n/a", "na", "unknown", "tbd", "not available", "none", "\u2014", "-", ".", "pending"
];

export function isEffectivelyEmpty(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (EMPTY_PLACEHOLDERS.includes(trimmed.toLowerCase())) return true;
  return false;
}

export function normalizeAddress(value: string | null | undefined): string | null {
  if (isEffectivelyEmpty(value)) return null;
  return value!.trim();
}

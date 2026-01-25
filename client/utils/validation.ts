export function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

export function isValidUSPhone(phone: string): boolean {
  const cleaned = cleanPhone(phone);
  return cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith("1"));
}

export function formatPhone(phone: string): string {
  const cleaned = cleanPhone(phone);
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    const digits = cleaned.slice(1);
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

export function getPhoneDigits(phone: string): string {
  const cleaned = cleanPhone(phone);
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return cleaned.slice(1);
  }
  return cleaned;
}

export function isLikelyAddress(address: string): boolean {
  if (!address || address.trim().length < 5) return false;
  const trimmed = address.trim();
  const hasStreetNumber = /^\d+\s/.test(trimmed) || /\s\d+\s/.test(trimmed);
  const hasCommaState = /,\s*[A-Z]{2}/i.test(trimmed);
  const hasStateZip = /[A-Z]{2}\s+\d{5}/i.test(trimmed);
  return hasStreetNumber || hasCommaState || hasStateZip;
}

export function isValidEmail(email: string): boolean {
  if (!email || email.trim().length === 0) return true;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

export function normalizeUrl(url: string): string {
  if (!url || url.trim().length === 0) return url;
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function isValidZipCode(zip: string): boolean {
  if (!zip || zip.trim().length === 0) return true;
  const cleaned = zip.replace(/[^0-9]/g, "");
  return cleaned.length === 5 || cleaned.length === 9;
}

export function formatDateFriendly(dateString: string): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateString;
  }
}

export function toISODateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseISODate(dateString: string): Date | null {
  if (!dateString) return null;
  try {
    const date = new Date(dateString + "T00:00:00");
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

export function getGoogleMapsUrl(address: string): string {
  const encoded = encodeURIComponent(address);
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

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

/**
 * Format a date string for friendly display.
 * IMPORTANT: This function parses dates WITHOUT timezone conversion to prevent date shifting.
 * Input can be YYYY-MM-DD or MM-DD-YYYY format.
 */
export function formatDateFriendly(dateString: string): string {
  if (!dateString) return "";
  
  // Parse the date string manually to avoid timezone issues
  const parsed = parseDateString(dateString);
  if (!parsed) return dateString;
  
  const { year, month, day } = parsed;
  
  // Format as "Mon DD, YYYY"
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = monthNames[month - 1];
  
  return `${monthName} ${day}, ${year}`;
}

/**
 * Format a date string as MM-DD-YYYY for display.
 * IMPORTANT: Timezone-safe - no Date object conversion.
 */
export function formatDateMMDDYYYY(dateString: string): string {
  if (!dateString) return "";
  
  const parsed = parseDateString(dateString);
  if (!parsed) return dateString;
  
  const { year, month, day } = parsed;
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}-${year}`;
}

/**
 * Parse a date string (YYYY-MM-DD or MM-DD-YYYY) into components.
 * Returns null if the format is invalid.
 * IMPORTANT: This does NOT use Date object to avoid timezone issues.
 */
export function parseDateString(dateString: string): { year: number; month: number; day: number } | null {
  if (!dateString) return null;
  
  const trimmed = dateString.trim();
  
  // Try YYYY-MM-DD format (ISO/internal storage format)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }
  
  // Try MM-DD-YYYY format (user input format)
  const usMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (usMatch) {
    const month = parseInt(usMatch[1], 10);
    const day = parseInt(usMatch[2], 10);
    const year = parseInt(usMatch[3], 10);
    
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year, month, day };
    }
  }
  
  return null;
}

/**
 * Convert a date string to internal storage format (YYYY-MM-DD).
 * Accepts either YYYY-MM-DD or MM-DD-YYYY input.
 * IMPORTANT: Timezone-safe - no Date object conversion.
 */
export function toStorageDateString(dateString: string): string {
  if (!dateString) return "";
  
  const parsed = parseDateString(dateString);
  if (!parsed) return dateString;
  
  const { year, month, day } = parsed;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Convert a Date object to YYYY-MM-DD string using LOCAL date values.
 * IMPORTANT: Uses getFullYear/getMonth/getDate to avoid UTC conversion.
 */
export function toISODateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse an ISO date string (YYYY-MM-DD) into a Date object using LOCAL time.
 * IMPORTANT: Creates Date using local constructor to avoid timezone shift.
 */
export function parseISODate(dateString: string): Date | null {
  if (!dateString) return null;
  
  const parsed = parseDateString(dateString);
  if (!parsed) return null;
  
  const { year, month, day } = parsed;
  // Use local Date constructor (year, monthIndex, day) - no timezone shift
  return new Date(year, month - 1, day);
}

export function getGoogleMapsUrl(address: string): string {
  const encoded = encodeURIComponent(address);
  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

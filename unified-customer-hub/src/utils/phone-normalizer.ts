// ═══════════════════════════════════════════════════════════════════════════════
// Phone Normalization Utility
// ═══════════════════════════════════════════════════════════════════════════════
//
// Ép kiểu tất cả SĐT về dạng chuẩn: 0xxxxxxxxx (10-11 số)
// Xử lý các format đầu vào:
//   - +84901234567 → 0901234567
//   - 84901234567  → 0901234567
//   - 901234567    → 0901234567
//   - 0901234567   → 0901234567 (giữ nguyên)
//
// ═══════════════════════════════════════════════════════════════════════════════

export class PhoneNormalizationError extends Error {
  public readonly inputPhone: string;

  constructor(inputPhone: string, message?: string) {
    super(message || `Invalid phone format: ${inputPhone}`);
    this.name = 'PhoneNormalizationError';
    this.inputPhone = inputPhone;
  }
}

/**
 * Normalize phone number to Vietnamese format (0xxxxxxxxx)
 *
 * @param inputPhone - Raw phone input (any format)
 * @returns Normalized phone string (10-11 digits starting with 0)
 * @throws PhoneNormalizationError if phone format is invalid
 *
 * @example
 * ```typescript
 * normalizePhone('+84901234567')  // → '0901234567'
 * normalizePhone('84901234567')   // → '0901234567'
 * normalizePhone('901234567')     // → '0901234567'
 * normalizePhone('0901234567')    // → '0901234567'
 * normalizePhone('0123 456 789')  // → '0123456789'
 * normalizePhone('')              // → null
 * normalizePhone(null)            // → null
 * ```
 */
export function normalizePhone(inputPhone: string | null | undefined): string | null {
  // Handle null/undefined/empty
  if (inputPhone === null || inputPhone === undefined || inputPhone === '') {
    return null;
  }

  // Remove all non-digits
  let cleaned = inputPhone.replace(/[^0-9]/g, '');

  // Handle +84 or 84 prefix (Vietnamese country code)
  if (cleaned.startsWith('84') && cleaned.length >= 11) {
    cleaned = '0' + cleaned.substring(2);
  }

  // Add leading 0 if missing (9 digits without 0)
  if (!cleaned.startsWith('0') && cleaned.length === 9) {
    cleaned = '0' + cleaned;
  }

  // Validate final format: must be 10-11 digits starting with 0
  const phoneRegex = /^0[0-9]{9,10}$/;
  if (!phoneRegex.test(cleaned)) {
    throw new PhoneNormalizationError(inputPhone, `Invalid phone format: ${inputPhone}`);
  }

  return cleaned;
}

/**
 * Check if a string is a valid phone number
 *
 * @param phone - Phone string to validate
 * @returns true if valid, false otherwise
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;

  try {
    normalizePhone(phone);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract phone number from text content
 * Useful for extracting phone from bank transfer content
 *
 * @param content - Text content to search
 * @returns Array of found phone numbers (normalized)
 *
 * @example
 * ```typescript
 * extractPhonesFromContent('CK tu 0901234567 den tai khoan')
 * // → ['0901234567']
 *
 * extractPhonesFromContent('MOMO 901234567 tien an')
 * // → ['0901234567']
 * ```
 */
export function extractPhonesFromContent(content: string): string[] {
  if (!content) return [];

  const phones: string[] = [];

  // Pattern 1: Full phone with optional +84/84 prefix
  // Matches: +84901234567, 84901234567, 0901234567
  const fullPhoneRegex = /(?:\+?84|0)[0-9]{9,10}/g;

  // Pattern 2: 9-10 digits (may be phone without leading 0)
  const partialPhoneRegex = /\b[0-9]{9,10}\b/g;

  // Extract full phones
  const fullMatches = content.match(fullPhoneRegex) || [];
  for (const match of fullMatches) {
    try {
      const normalized = normalizePhone(match);
      if (normalized && !phones.includes(normalized)) {
        phones.push(normalized);
      }
    } catch {
      // Ignore invalid matches
    }
  }

  // Extract partial phones (only if they look like phone numbers)
  const partialMatches = content.match(partialPhoneRegex) || [];
  for (const match of partialMatches) {
    // Skip if already found in full matches
    if (fullMatches.some((fm) => fm.includes(match))) continue;

    // Only consider 9-digit numbers (likely missing leading 0)
    if (match.length === 9 && !match.startsWith('0')) {
      try {
        const normalized = normalizePhone(match);
        if (normalized && !phones.includes(normalized)) {
          phones.push(normalized);
        }
      } catch {
        // Ignore invalid matches
      }
    }
  }

  return phones;
}

/**
 * Mask phone number for display (privacy)
 *
 * @param phone - Phone number to mask
 * @returns Masked phone (e.g., "090***4567")
 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone;

  const start = phone.substring(0, 3);
  const end = phone.substring(phone.length - 4);
  const masked = '*'.repeat(phone.length - 7);

  return `${start}${masked}${end}`;
}

export default {
  normalizePhone,
  isValidPhone,
  extractPhonesFromContent,
  maskPhone,
  PhoneNormalizationError,
};

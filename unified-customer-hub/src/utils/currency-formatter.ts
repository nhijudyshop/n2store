// ═══════════════════════════════════════════════════════════════════════════════
// Currency Formatting Utility
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format number as Vietnamese currency (VND)
 *
 * @param amount - Number to format
 * @param options - Formatting options
 * @returns Formatted currency string
 *
 * @example
 * ```typescript
 * formatCurrency(1500000)           // → "1.500.000 ₫"
 * formatCurrency(1500000, { symbol: false }) // → "1.500.000"
 * formatCurrency(1500000, { compact: true }) // → "1,5 tr"
 * ```
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  options: {
    symbol?: boolean;
    compact?: boolean;
    locale?: string;
  } = {}
): string {
  const { symbol = true, compact = false, locale = 'vi-VN' } = options;

  if (amount === null || amount === undefined) {
    return symbol ? '0 ₫' : '0';
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return symbol ? '0 ₫' : '0';
  }

  if (compact) {
    return formatCompactCurrency(numAmount, symbol);
  }

  const formatted = new Intl.NumberFormat(locale, {
    style: symbol ? 'currency' : 'decimal',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numAmount);

  return formatted;
}

/**
 * Format currency in compact form (triệu, nghìn)
 */
function formatCompactCurrency(amount: number, symbol: boolean): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (absAmount >= 1_000_000_000) {
    const value = (absAmount / 1_000_000_000).toFixed(1).replace('.0', '');
    return `${sign}${value} tỷ${symbol ? ' ₫' : ''}`;
  }

  if (absAmount >= 1_000_000) {
    const value = (absAmount / 1_000_000).toFixed(1).replace('.0', '');
    return `${sign}${value} tr${symbol ? ' ₫' : ''}`;
  }

  if (absAmount >= 1_000) {
    const value = (absAmount / 1_000).toFixed(0);
    return `${sign}${value}k${symbol ? ' ₫' : ''}`;
  }

  return formatCurrency(amount, { symbol, compact: false });
}

/**
 * Parse currency string back to number
 *
 * @param currencyStr - Currency string to parse
 * @returns Numeric value
 *
 * @example
 * ```typescript
 * parseCurrency("1.500.000 ₫")  // → 1500000
 * parseCurrency("1,5 tr")       // → 1500000
 * ```
 */
export function parseCurrency(currencyStr: string | null | undefined): number {
  if (!currencyStr) return 0;

  // Remove currency symbols and spaces
  let cleaned = currencyStr.replace(/[₫đ\s]/gi, '');

  // Handle compact formats
  if (cleaned.includes('tỷ') || cleaned.includes('ty')) {
    const num = parseFloat(cleaned.replace(/[^\d.,]/g, '').replace(',', '.'));
    return num * 1_000_000_000;
  }

  if (cleaned.includes('tr') || cleaned.includes('triệu') || cleaned.includes('trieu')) {
    const num = parseFloat(cleaned.replace(/[^\d.,]/g, '').replace(',', '.'));
    return num * 1_000_000;
  }

  if (cleaned.endsWith('k') || cleaned.endsWith('K')) {
    const num = parseFloat(cleaned.replace(/[^\d.,]/g, '').replace(',', '.'));
    return num * 1_000;
  }

  // Remove thousand separators (dots in VN format)
  cleaned = cleaned.replace(/\./g, '');

  // Replace comma with dot for decimal
  cleaned = cleaned.replace(',', '.');

  return parseFloat(cleaned) || 0;
}

/**
 * Format balance with color indication
 *
 * @param balance - Balance amount
 * @returns Object with formatted value and color class
 */
export function formatBalanceWithColor(balance: number): {
  formatted: string;
  colorClass: string;
  isPositive: boolean;
} {
  const formatted = formatCurrency(balance);
  const isPositive = balance > 0;

  return {
    formatted,
    colorClass: isPositive ? 'text-green-600' : balance < 0 ? 'text-red-600' : 'text-gray-600',
    isPositive,
  };
}

export default {
  formatCurrency,
  parseCurrency,
  formatBalanceWithColor,
};

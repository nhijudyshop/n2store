// ═══════════════════════════════════════════════════════════════════════════════
// Date Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Format date for display in Vietnamese locale
 *
 * @param date - Date to format
 * @param format - Format type
 * @returns Formatted date string
 */
export function formatDate(
  date: Date | string | null | undefined,
  format: 'full' | 'date' | 'time' | 'datetime' | 'relative' = 'datetime'
): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) return '';

  switch (format) {
    case 'full':
      return d.toLocaleDateString('vi-VN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    case 'date':
      return d.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

    case 'time':
      return d.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });

    case 'relative':
      return getRelativeTime(d);

    case 'datetime':
    default:
      return d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
  }
}

/**
 * Get relative time string (e.g., "2 giờ trước", "3 ngày trước")
 */
export function getRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) return 'Vừa xong';
  if (diffMinutes < 60) return `${diffMinutes} phút trước`;
  if (diffHours < 24) return `${diffHours} giờ trước`;
  if (diffDays < 30) return `${diffDays} ngày trước`;
  if (diffMonths < 12) return `${diffMonths} tháng trước`;
  return `${diffYears} năm trước`;
}

/**
 * Calculate days between two dates
 */
export function daysBetween(startDate: Date | string, endDate: Date | string = new Date()): number {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Add days to a date
 */
export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Check if a date is expired
 */
export function isExpired(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.getTime() < Date.now();
}

/**
 * Get start of day
 */
export function startOfDay(date: Date | string = new Date()): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get end of day
 */
export function endOfDay(date: Date | string = new Date()): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Format for database (ISO string)
 */
export function toISOString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Get expiry date for virtual credits
 */
export function getVirtualCreditExpiry(days: number, from: Date = new Date()): Date {
  return addDays(from, days);
}

/**
 * Format expiry countdown
 */
export function formatExpiryCountdown(expiryDate: Date | string): string {
  const d = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
  const now = new Date();

  if (d.getTime() <= now.getTime()) {
    return 'Đã hết hạn';
  }

  const days = daysBetween(now, d);

  if (days === 0) {
    const hours = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60));
    if (hours === 0) {
      const minutes = Math.floor((d.getTime() - now.getTime()) / (1000 * 60));
      return `Còn ${minutes} phút`;
    }
    return `Còn ${hours} giờ`;
  }

  if (days === 1) return 'Còn 1 ngày';
  if (days < 7) return `Còn ${days} ngày`;
  if (days < 30) return `Còn ${Math.floor(days / 7)} tuần`;

  return `Còn ${Math.floor(days / 30)} tháng`;
}

export default {
  formatDate,
  getRelativeTime,
  daysBetween,
  addDays,
  isExpired,
  startOfDay,
  endOfDay,
  toISOString,
  getVirtualCreditExpiry,
  formatExpiryCountdown,
};

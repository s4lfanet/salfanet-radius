/**
 * Input Validation & Sanitization Utilities
 * 
 * Centralized validation functions to prevent injection attacks
 * and enforce business logic constraints
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param str - String to escape
 * @returns HTML-escaped string
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Validate email format and prevent header injection
 * @param email - Email to validate
 * @returns true if valid, false otherwise
 * @throws Error if invalid
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    throw new Error('Email must be a non-empty string');
  }

  const trimmed = email.trim();
  
  // Check length (RFC 5321 max 254 chars)
  if (trimmed.length > 254 || trimmed.length < 3) {
    throw new Error('Email must be between 3 and 254 characters');
  }

  // Check for injection characters (newlines, null bytes, etc.)
  if (/[\r\n\x00%20@]+@/.test(trimmed) || /[\r\n\x00]/.test(trimmed)) {
    throw new Error('Email contains invalid characters');
  }

  // Basic format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    throw new Error('Invalid email format');
  }

  return true;
}

/**
 * Sanitize email to prevent header injection
 * @param email - Email to sanitize
 * @returns Sanitized email
 */
export function sanitizeEmail(email: string): string {
  if (!email) return '';
  // Remove newlines, carriage returns, null bytes, %00
  return email.replace(/[\r\n\x00%]/g, '').trim();
}

/**
 * Validate phone number format (E.164 international format)
 * @param phone - Phone to validate
 * @returns true if valid
 * @throws Error if invalid
 */
export function validatePhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    throw new Error('Phone must be a non-empty string');
  }

  const trimmed = phone.trim();
  
  // E.164 format: +[1-9]{1,3}[0-9]{1,14}
  const phoneRegex = /^\\+?[1-9]\d{1,14}$/;
  
  if (!phoneRegex.test(trimmed)) {
    throw new Error('Invalid phone number format (E.164 expected)');
  }

  if (trimmed.length > 20) {
    throw new Error('Phone number too long');
  }

  return true;
}

/**
 * Sanitize phone number for messaging APIs
 * @param phone - Phone to sanitize
 * @returns Sanitized phone number
 */
export function sanitizePhone(phone: string): string {
  if (!phone) return '';
  // Keep only digits, +, -, and space
  return phone.replace(/[^\d+\-\s]/g, '').trim();
}

/**
 * Validate monetary amount
 * @param amount - Amount to validate (in cents for precision)
 * @param options - Validation options
 * @returns true if valid
 * @throws Error if invalid
 */
export function validateAmount(
  amount: number | string,
  options: {
    minAmount?: number;
    maxAmount?: number;
    allowZero?: boolean;
    allowNegative?: boolean;
  } = {}
): boolean {
  const {
    minAmount = 100,           // Default: Rp 1.00
    maxAmount = 999999999,     // Default: ~Rp 10 million
    allowZero = false,
    allowNegative = false,
  } = options;

  let value: number;
  
  if (typeof amount === 'string') {
    value = parseInt(amount, 10);
  } else {
    value = amount;
  }

  // Check for NaN or infinity
  if (!Number.isFinite(value)) {
    throw new Error('Amount must be a finite number');
  }

  // Check for negative values
  if (value < 0 && !allowNegative) {
    throw new Error('Amount cannot be negative');
  }

  // Check for zero
  if (value === 0 && !allowZero) {
    throw new Error('Amount cannot be zero');
  }

  // Check MAX_SAFE_INTEGER
  if (value > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Amount exceeds maximum safe value (${Number.MAX_SAFE_INTEGER})`);
  }

  // Check range
  if (value < minAmount || value > maxAmount) {
    throw new Error(`Amount must be between ${minAmount} and ${maxAmount}`);
  }

  return true;
}

/**
 * Validate date format (YYYY-MM-DD)
 * @param dateStr - Date string to validate
 * @returns Date object if valid
 * @throws Error if invalid
 */
export function validateDateFormat(dateStr: string): Date {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new Error('Date must be a non-empty string');
  }

  // Check format: YYYY-MM-DD
  const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateFormatRegex.test(dateStr)) {
    throw new Error('Invalid date format. Use YYYY-MM-DD');
  }

  const date = new Date(dateStr + 'T00:00:00Z');
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date value');
  }

  return date;
}

/**
 * Validate date range
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @param maxDays - Maximum days between start and end
 * @returns { start, end } Date objects
 * @throws Error if invalid
 */
export function validateDateRange(
  startDate: string,
  endDate: string,
  maxDays: number = 365
): { start: Date; end: Date } {
  const start = validateDateFormat(startDate);
  const end = validateDateFormat(endDate);

  if (start > end) {
    throw new Error('Start date must be before end date');
  }

  const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > maxDays) {
    throw new Error(`Date range exceeds ${maxDays} days`);
  }

  return { start, end };
}

/**
 * Validate enum value (whitelist check)
 * @param value - Value to validate
 * @param allowedValues - Array of allowed values
 * @param fieldName - Name of field (for error message)
 * @returns true if valid
 * @throws Error if not in whitelist
 */
export function validateEnum<T>(
  value: any,
  allowedValues: readonly T[],
  fieldName: string = 'value'
): boolean {
  if (!allowedValues.includes(value as T)) {
    throw new Error(
      `Invalid ${fieldName}. Must be one of: ${allowedValues.join(', ')}`
    );
  }
  return true;
}

/**
 * Validate timezone against whitelist
 * @param timezone - Timezone string to validate
 * @returns true if valid
 * @throws Error if not in whitelist
 */
export function validateTimezone(timezone: string): boolean {
  const ALLOWED_TIMEZONES = [
    'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura',
    'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Bangkok',
    'Asia/Ho_Chi_Minh', 'Asia/Manila', 'Asia/Tokyo',
    'Asia/Seoul', 'Asia/Hong_Kong', 'Asia/Shanghai',
    'Asia/Taipei', 'Asia/Dubai', 'Asia/Riyadh',
    'Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth',
    'Pacific/Auckland', 'Europe/London', 'Europe/Paris',
    'Europe/Berlin', 'Europe/Moscow', 'America/New_York',
    'America/Los_Angeles', 'America/Chicago', 'America/Sao_Paulo',
    'UTC', 'GMT'
  ];

  if (!timezone || typeof timezone !== 'string') {
    throw new Error('Timezone is required and must be a string');
  }

  if (!ALLOWED_TIMEZONES.includes(timezone)) {
    throw new Error(
      `Invalid timezone. Must be one of: ${ALLOWED_TIMEZONES.join(', ')}`
    );
  }

  return true;
}

/**
 * Validate search string
 * @param search - Search string
 * @param maxLength - Maximum length
 * @returns Sanitized search string
 * @throws Error if invalid
 */
export function validateSearch(search: string, maxLength: number = 100): string {
  if (!search) return '';

  const trimmed = search.trim();

  if (trimmed.length > maxLength) {
    throw new Error(`Search string too long (max ${maxLength} characters)`);
  }

  // Escape special characters for safety
  return trimmed.replace(/[%_\\]/g, '\\$&');
}

/**
 * Validate IP address (IPv4)
 * @param ip - IP address to validate
 * @param allowPrivate - Allow private IP ranges (10.x, 192.168.x, 172.16-31.x)
 * @returns true if valid
 * @throws Error if invalid
 */
export function validateIPAddress(ip: string, allowPrivate: boolean = false): boolean {
  if (!ip || typeof ip !== 'string') {
    throw new Error('IP address must be a non-empty string');
  }

  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  
  if (!ipv4Regex.test(ip)) {
    throw new Error('Invalid IP address format');
  }

  // Validate octets are 0-255
  const octets = ip.split('.').map(Number);
  if (octets.some(octet => isNaN(octet) || octet < 0 || octet > 255)) {
    throw new Error('Invalid IP address: octets must be 0-255');
  }

  // Check for private IP ranges if not allowed
  if (!allowPrivate) {
    const isPrivate = 
      /^10\./.test(ip) ||
      /^192\.168\./.test(ip) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip);

    if (isPrivate) {
      throw new Error('Private IP addresses not allowed');
    }
  }

  return true;
}

/**
 * Validate port number
 * @param port - Port number to validate
 * @param minPort - Minimum allowed port (default: 1)
 * @param maxPort - Maximum allowed port (default: 65535)
 * @returns true if valid
 * @throws Error if invalid
 */
export function validatePort(
  port: number | string,
  minPort: number = 1,
  maxPort: number = 65535
): boolean {
  let portNum: number;

  if (typeof port === 'string') {
    portNum = parseInt(port, 10);
  } else {
    portNum = port;
  }

  if (isNaN(portNum)) {
    throw new Error('Port must be a valid number');
  }

  if (portNum < minPort || portNum > maxPort) {
    throw new Error(`Port must be between ${minPort} and ${maxPort}`);
  }

  return true;
}

/**
 * Validate file size
 * @param fileSize - File size in bytes
 * @param maxSize - Maximum size in bytes
 * @param minSize - Minimum size in bytes (default: 1)
 * @returns true if valid
 * @throws Error if invalid
 */
export function validateFileSize(
  fileSize: number,
  maxSize: number,
  minSize: number = 1
): boolean {
  if (fileSize < minSize) {
    throw new Error(`File is too small (minimum ${minSize} bytes)`);
  }

  if (fileSize > maxSize) {
    throw new Error(`File exceeds maximum size of ${maxSize} bytes`);
  }

  return true;
}

/**
 * Extract and validate pagination parameters
 * @param page - Page number
 * @param limit - Items per page
 * @param maxLimit - Maximum allowed limit
 * @returns { page, limit, skip }
 * @throws Error if invalid
 */
export function validatePagination(
  page?: string | number,
  limit?: string | number,
  maxLimit: number = 100
): { page: number; limit: number; skip: number } {
  let pageNum = 1;
  let limitNum = 20;

  if (page !== undefined) {
    pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
    if (isNaN(pageNum) || pageNum < 1) {
      throw new Error('Page must be a positive integer');
    }
  }

  if (limit !== undefined) {
    limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > maxLimit) {
      throw new Error(`Limit must be between 1 and ${maxLimit}`);
    }
  }

  return {
    page: pageNum,
    limit: limitNum,
    skip: (pageNum - 1) * limitNum,
  };
}

/**
 * URL-safe string validator
 * @param str - String to validate
 * @returns true if safe for URLs
 * @throws Error if invalid
 */
export function validateURLSafeString(str: string, maxLength: number = 50): boolean {
  if (!str || typeof str !== 'string') {
    throw new Error('String is required');
  }

  if (str.length > maxLength) {
    throw new Error(`String too long (max ${maxLength} characters)`);
  }

  // Allow alphanumeric, dash, underscore only
  if (!/^[a-zA-Z0-9_-]+$/.test(str)) {
    throw new Error('String contains invalid characters');
  }

  return true;
}

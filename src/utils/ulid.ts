import { ulid } from 'ulid';

/**
 * Generate a new ULID (Universally Unique Lexicographically Sortable Identifier)
 *
 * ULID characteristics:
 * - 26 characters long
 * - Lexicographically sortable
 * - Timestamp-based prefix (first 10 characters)
 * - Random suffix (last 16 characters)
 * - Case-insensitive Base32 encoding
 * - URL-safe and human-readable
 *
 * @returns {string} A new ULID string
 */
export const generateULID = (): string => {
  return ulid();
};

/**
 * Validate if a string is a valid ULID format
 *
 * @param {string} id - The string to validate
 * @returns {boolean} True if valid ULID format, false otherwise
 */
export const isValidULID = (id: string): boolean => {
  if (!id || typeof id !== 'string') {
    return false;
  }

  // ULID format: 26 characters, base32 encoded (Crockford's Base32)
  // Valid characters: 0123456789ABCDEFGHJKMNPQRSTVWXYZ
  const ulidRegex = /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/i;
  return ulidRegex.test(id);
};

/**
 * Extract timestamp from ULID
 *
 * @param {string} ulidString - Valid ULID string
 * @returns {Date} The timestamp encoded in the ULID
 */
export const getULIDTimestamp = (ulidString: string): Date | null => {
  if (!isValidULID(ulidString)) {
    return null;
  }

  try {
    // First 10 characters contain timestamp
    const timestampPart = ulidString.substring(0, 10);

    // Decode Base32 timestamp (simplified)
    const base32Chars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let timestamp = 0;

    for (let i = 0; i < timestampPart.length; i++) {
      const char = timestampPart[i].toUpperCase();
      const value = base32Chars.indexOf(char);
      timestamp = timestamp * 32 + value;
    }

    return new Date(timestamp);
  } catch (error) {
    return null;
  }
};

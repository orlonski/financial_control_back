import { Decimal } from '@prisma/client/runtime/library';

/**
 * Converts Prisma Decimal fields to numbers in an object or array
 * This ensures the frontend receives numbers instead of strings
 */
export function convertDecimalToNumber<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => convertDecimalToNumber(item)) as T;
  }

  // Handle objects
  if (typeof data === 'object') {
    const result: any = {};
    for (const key in data) {
      const value = (data as any)[key];

      // Skip Date objects - keep them as-is
      if (value instanceof Date) {
        result[key] = value;
      }
      // Check if it's a Decimal instance
      else if (value instanceof Decimal) {
        result[key] = value.toNumber();
      }
      // Check if it's a Decimal-like object (has toNumber method)
      // But make sure it's not a Date
      else if (value && typeof value === 'object' && 'toNumber' in value && !(value instanceof Date)) {
        result[key] = value.toNumber();
      }
      // Recursively convert nested objects/arrays (but not Dates)
      else if (value && typeof value === 'object' && !(value instanceof Date)) {
        result[key] = convertDecimalToNumber(value);
      }
      // Keep other values as-is
      else {
        result[key] = value;
      }
    }
    return result;
  }

  // Return primitive values as-is
  return data;
}

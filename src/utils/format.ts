/**
 * Formats a date to PT-BR format (dd/mm/yyyy)
 * @param value - Date object, ISO string, or null/undefined
 * @returns Formatted date string or empty string for invalid/null values
 */
export function formatDate(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }

  const date = typeof value === 'string' ? new Date(value) : value;

  if (isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('pt-BR');
}

/**
 * Formats a number as Brazilian Real currency (R$ 1.234,56)
 * @param value - The number to format (can be null or undefined)
 * @returns Formatted currency string
 */
export function formatCurrency(value: number | null | undefined): string {
  const formatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  if (value === null || value === undefined) {
    return formatter.format(0);
  }

  return formatter.format(value);
}

/**
 * Formats a number as Brazilian Real currency (R$ 1.234,56)
 * @param value - The number to format (accepts null/undefined)
 * @returns Formatted currency string
 */
export function formatCurrency(value: number | null | undefined): string {
  const safeValue = value ?? 0

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(safeValue)
}

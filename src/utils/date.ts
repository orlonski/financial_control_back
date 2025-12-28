/**
 * Ajusta uma data para o timezone do Brasil (UTC-3).
 * Adiciona 3 horas à data para compensar a diferença de fuso horário.
 *
 * Quando o JavaScript interpreta '2026-01-01' como '2026-01-01T00:00:00Z' (UTC),
 * esta função converte para '2026-01-01T03:00:00Z' que representa meia-noite
 * no horário de Brasília.
 *
 * @param date - Data a ser ajustada
 * @returns Data ajustada para o timezone do Brasil
 */
export function adjustToBrazilTimezone(date: Date): Date {
  const adjustedDate = new Date(date);
  adjustedDate.setHours(adjustedDate.getHours() + 3);
  return adjustedDate;
}

/**
 * Transforma uma string de data para Date ajustada ao timezone do Brasil.
 * Útil para uso em schemas Zod.
 *
 * @param dateString - String de data (ex: '2026-01-01')
 * @returns Data ajustada para o timezone do Brasil
 */
export function parseDateToBrazilTimezone(dateString: string): Date {
  const date = new Date(dateString);
  return adjustToBrazilTimezone(date);
}

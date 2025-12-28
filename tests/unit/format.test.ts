import { formatCurrency } from '../../src/utils/format';

describe('formatCurrency', () => {
  it('should format positive numbers correctly', () => {
    expect(formatCurrency(1234.56)).toBe('R$\u00A01.234,56');
  });

  it('should format negative numbers correctly', () => {
    expect(formatCurrency(-1234.56)).toBe('-R$\u00A01.234,56');
  });

  it('should format zero correctly', () => {
    expect(formatCurrency(0)).toBe('R$\u00A00,00');
  });

  it('should format large numbers correctly', () => {
    expect(formatCurrency(1000000.00)).toBe('R$\u00A01.000.000,00');
  });

  it('should round decimals to two places', () => {
    expect(formatCurrency(123.456)).toBe('R$\u00A0123,46');
    expect(formatCurrency(123.454)).toBe('R$\u00A0123,45');
  });

  it('should handle null values', () => {
    expect(formatCurrency(null)).toBe('R$\u00A00,00');
  });

  it('should handle undefined values', () => {
    expect(formatCurrency(undefined)).toBe('R$\u00A00,00');
  });

  it('should format small decimal values correctly', () => {
    expect(formatCurrency(0.01)).toBe('R$\u00A00,01');
    expect(formatCurrency(0.99)).toBe('R$\u00A00,99');
  });

  it('should format integers correctly', () => {
    expect(formatCurrency(100)).toBe('R$\u00A0100,00');
  });
});

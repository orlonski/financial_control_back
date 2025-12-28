import { formatDate } from '../../src/utils/format'

describe('formatDate', () => {
  it('should format Date object to PT-BR format (dd/mm/yyyy)', () => {
    const date = new Date(2024, 11, 25) // December 25, 2024
    expect(formatDate(date)).toBe('25/12/2024')
  })

  it('should format ISO string to PT-BR format', () => {
    expect(formatDate('2024-12-25')).toBe('25/12/2024')
  })

  it('should format ISO string with time and ignore the time part', () => {
    expect(formatDate('2024-12-25T10:30:00Z')).toBe('25/12/2024')
  })

  it('should return empty string for null', () => {
    expect(formatDate(null)).toBe('')
  })

  it('should return empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('')
  })

  it('should return empty string for invalid date string', () => {
    expect(formatDate('abc')).toBe('')
    expect(formatDate('invalid-date')).toBe('')
import { formatCurrency } from '../../src/utils/format'

describe('formatCurrency', () => {
  it('should format positive values correctly', () => {
    expect(formatCurrency(1234.56)).toBe('R$\u00A01.234,56')
  })

  it('should format negative values with standard format', () => {
    expect(formatCurrency(-1234.56)).toBe('-R$\u00A01.234,56')
  })

  it('should format zero correctly', () => {
    expect(formatCurrency(0)).toBe('R$\u00A00,00')
  })

  it('should format large values correctly', () => {
    expect(formatCurrency(1234567.89)).toBe('R$\u00A01.234.567,89')
  })

  it('should round decimal values correctly', () => {
    expect(formatCurrency(1234.567)).toBe('R$\u00A01.234,57')
    expect(formatCurrency(1234.564)).toBe('R$\u00A01.234,56')
  })

  it('should handle null values returning R$ 0,00', () => {
    expect(formatCurrency(null)).toBe('R$\u00A00,00')
  })

  it('should handle undefined values returning R$ 0,00', () => {
    expect(formatCurrency(undefined)).toBe('R$\u00A00,00')
  })

  it('should format small decimal values correctly', () => {
    expect(formatCurrency(0.01)).toBe('R$\u00A00,01')
    expect(formatCurrency(0.99)).toBe('R$\u00A00,99')
  })

  it('should format whole numbers with decimal places', () => {
    expect(formatCurrency(100)).toBe('R$\u00A0100,00')
    expect(formatCurrency(1000)).toBe('R$\u00A01.000,00')
  })
})

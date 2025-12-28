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
  })
})

import { adjustToBrazilTimezone, parseDateToBrazilTimezone } from '../../src/utils/date'

describe('adjustToBrazilTimezone', () => {
  it('should add 3 hours to UTC date', () => {
    const utcDate = new Date('2026-01-01T00:00:00.000Z')
    const brazilDate = adjustToBrazilTimezone(utcDate)

    expect(brazilDate.toISOString()).toBe('2026-01-01T03:00:00.000Z')
  })

  it('should handle date near midnight correctly', () => {
    const utcDate = new Date('2026-06-15T00:00:00.000Z')
    const brazilDate = adjustToBrazilTimezone(utcDate)

    expect(brazilDate.toISOString()).toBe('2026-06-15T03:00:00.000Z')
  })

  it('should handle date at end of year', () => {
    const utcDate = new Date('2025-12-31T00:00:00.000Z')
    const brazilDate = adjustToBrazilTimezone(utcDate)

    expect(brazilDate.toISOString()).toBe('2025-12-31T03:00:00.000Z')
  })

  it('should not mutate original date', () => {
    const utcDate = new Date('2026-01-01T00:00:00.000Z')
    const originalTime = utcDate.getTime()

    adjustToBrazilTimezone(utcDate)

    expect(utcDate.getTime()).toBe(originalTime)
  })

  it('should handle leap year date', () => {
    const utcDate = new Date('2024-02-29T00:00:00.000Z')
    const brazilDate = adjustToBrazilTimezone(utcDate)

    expect(brazilDate.toISOString()).toBe('2024-02-29T03:00:00.000Z')
  })
})

describe('parseDateToBrazilTimezone', () => {
  it('should parse date string and add 3 hours', () => {
    const brazilDate = parseDateToBrazilTimezone('2026-01-01')

    expect(brazilDate.toISOString()).toBe('2026-01-01T03:00:00.000Z')
  })

  it('should parse ISO date string correctly', () => {
    const brazilDate = parseDateToBrazilTimezone('2027-01-01')

    expect(brazilDate.toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })

  it('should handle different date formats', () => {
    const brazilDate = parseDateToBrazilTimezone('2026-06-15')

    expect(brazilDate.toISOString()).toBe('2026-06-15T03:00:00.000Z')
  })

  it('should match expected format from issue description', () => {
    // Issue expected: startDate: "2026-01-01T03:00:00.000Z"
    const startDate = parseDateToBrazilTimezone('2026-01-01')
    expect(startDate.toISOString()).toBe('2026-01-01T03:00:00.000Z')

    // Issue expected: nextDueDate: "2027-01-01T03:00:00.000Z"
    const nextDueDate = parseDateToBrazilTimezone('2027-01-01')
    expect(nextDueDate.toISOString()).toBe('2027-01-01T03:00:00.000Z')
  })
})

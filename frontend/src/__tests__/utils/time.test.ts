import { formatRelativeTime } from '@/utils/time'

describe('formatRelativeTime', () => {
  it('formats recent times correctly', () => {
    const now = new Date()
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    expect(formatRelativeTime(oneMinuteAgo)).toMatch(/ago|minute/)
    expect(formatRelativeTime(oneHourAgo)).toMatch(/ago|hour/)
  })

  it('handles future dates', () => {
    const future = new Date(Date.now() + 60 * 1000)
    expect(formatRelativeTime(future)).toMatch(/in|from now/)
  })
})
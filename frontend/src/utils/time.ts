import { formatDistanceToNow, differenceInMinutes } from 'date-fns'

export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffInMinutes = differenceInMinutes(now, date)

  // If less than 1 minute, show "now"
  if (diffInMinutes < 1) {
    return 'now'
  }

  // Otherwise use the standard formatDistanceToNow
  return formatDistanceToNow(date, { addSuffix: true })
}

export function shouldGroupMessages(
  currentMessage: { senderId: string; createdAt: string },
  previousMessage: { senderId: string; createdAt: string } | null
): boolean {
  if (!previousMessage) return false

  // Different senders should not be grouped
  if (currentMessage.senderId !== previousMessage.senderId) return false

  // Check if messages are within 10 minutes of each other
  const currentTime = new Date(currentMessage.createdAt)
  const previousTime = new Date(previousMessage.createdAt)
  const diffInMinutes = differenceInMinutes(currentTime, previousTime)

  return diffInMinutes <= 10
}